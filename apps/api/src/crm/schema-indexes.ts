import { CRM_OBJECTS, CRM_SCHEMA } from "./crm"
import { sortTerms } from "./crm-list"

/**
 * The indexes the list queries need, derived from the queries themselves.
 *
 * There were none. `companies`, `people` and `deals` carried nothing but their primary keys, so
 * every list request sorted the whole table in memory and every reference resolved by scanning it.
 * At a few hundred rows that is free and it stays free right up until it is not, which is the failure mode
 * worth pre-empting: nothing gets slower gradually, one page just stops answering.
 *
 * **They are generated rather than written out.** An index only helps if it matches the `ORDER BY`
 * term for term — same expression, same collation, same order — and a hand-written list beside a
 * hand-written query drifts the first time either is edited, silently, because a query with an
 * unused index is not an error. Both come out of `sortTerms` in `crm-list.ts` instead.
 */

/**
 * One index per direction, because a sort cannot be read backwards when its terms disagree.
 *
 * SQLite will scan an index in reverse to satisfy a descending sort, but only when *every* term
 * reverses. The ordering here is deliberately mixed — blanks stay pinned to the bottom whichever way
 * the values run — so `blank ASC, value DESC` is not the reverse of `blank ASC, value ASC` and the
 * ascending index does nothing for it. Clicking a column header twice would have gone from an index
 * scan to sorting the entire table in a temp B-tree, which is a difference nobody sees at a few hundred rows
 * and the only thing anybody sees at 300,000.
 */
function sortIndexes(name: string, table: string, expression: string): string[] {
  return (["asc", "desc"] as const).map(
    direction => `create index if not exists ${name}_${direction} on ${table} (${sortTerms(expression, direction)})`,
  )
}

/**
 * What gets one, and what deliberately does not.
 *
 * The label of every object, because that is the default ordering of every list and the one nobody
 * chooses. `created_at`, because "Added" is in the opening view of all seven and is the usual second
 * click. Every single-value reference column, because those are read twice — once to resolve the
 * name the grid shows, and again if you sort on it.
 *
 * Not the other 150 columns. An index is not free on write and a CRM this size will be importing in
 * batches; a rarely-sorted column can pay for itself with a scan. Not the free-text search either,
 * which `LIKE '%q%'` cannot use an index for at any size — that one needs FTS5 and is the next piece
 * of work, not something an index here can quietly fix.
 */
export function objectIndexes(): string[] {
  const statements: string[] = []

  for (const object of CRM_OBJECTS) {
    const schema = CRM_SCHEMA[object]

    statements.push(...sortIndexes(`${schema.table}_label`, schema.table, schema.label))
    statements.push(...sortIndexes(`${schema.table}_created`, schema.table, `"created_at"`))

    for (const lookup of schema.lookups ?? []) {
      statements.push(
        `create index if not exists ${schema.table}_${lookup.column} on ${schema.table} ("${lookup.column}")`,
      )
    }
  }

  return statements
}
