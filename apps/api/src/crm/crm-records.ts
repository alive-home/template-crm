import type { InValue } from "@libsql/client"
import { CRM_OBJECTS, CRM_SCHEMA, type CrmObject, checkboxColumns } from "./crm"
import { query } from "./turso"

/**
 * Assembling one record out of the tables it is spread across.
 *
 * A record is its own row plus a row per value in every multi-value attribute, and the columns a
 * checkbox lives in are integers on the way out. None of that is a routing concern, so it sits here
 * rather than above the handlers that call it.
 */

export type Row = Record<string, unknown>

/** One label per record across every object, for resolving links whose target object is unrecorded. */
export const RECORD_INDEX = CRM_OBJECTS.map(
  object =>
    `SELECT record_id, '${object}' AS object, ${CRM_SCHEMA[object].label} AS label FROM ${CRM_SCHEMA[object].table}`,
).join(" UNION ALL ")

/**
 * Multi-value attributes for a set of records, grouped by record.
 *
 * **The ids are required, and that is the whole point of this signature.** It used to take one
 * optional record id, and the list route passed nothing — so drawing a page of companies read every
 * row of all five child tables and threw away the ones it had not asked about. At a few hundred records that
 * is invisible. At three hundred thousand it is the query that takes the server down, and it would
 * have been reintroduced by anyone who read the old default as "leave it out for all of them".
 *
 * `(record_id, position)` is the primary key of every child table, so an `IN` over a page's ids is
 * an index seek per id rather than a scan.
 */
export async function childValues(object: CrmObject, recordIds: string[]): Promise<Map<string, Row>> {
  const byRecord = new Map<string, Row>()
  if (recordIds.length === 0) return byRecord

  const filter = `WHERE child.record_id IN (${recordIds.map(() => "?").join(",")})`
  const args: InValue[] = recordIds

  for (const child of CRM_SCHEMA[object].children) {
    // A reference child resolves its label with a correlated subquery: unqualified columns bind to
    // the inner table, so each object's own label expression works unchanged.
    const select = child.ref
      ? `SELECT child.record_id, child.value_record_id AS id,
			   (SELECT ${CRM_SCHEMA[child.ref].label} FROM ${CRM_SCHEMA[child.ref].table} ref
			    WHERE ref.record_id = child.value_record_id) AS label`
      : `SELECT child.record_id, child.${child.value} AS value`

    const rows = await query<Row & { record_id: string }>(
      `${select} FROM ${child.table} child ${filter} ORDER BY child.record_id, child.position`,
      args,
    )

    for (const { record_id, ...rest } of rows) {
      const bucket = byRecord.get(record_id) ?? {}
      const existing = bucket[child.key]
      const list = Array.isArray(existing) ? existing : []
      list.push(child.ref ? { id: rest.id, object: child.ref, label: rest.label } : rest.value)
      bucket[child.key] = list
      byRecord.set(record_id, bucket)
    }
  }

  return byRecord
}

/** Turn the 0/1 checkbox columns back into booleans. A null stays null — unset is not "no". */
export async function withBooleans<T extends Row>(object: CrmObject, rows: T[]): Promise<T[]> {
  const flags = await checkboxColumns(object)
  if (!flags.size) return rows

  // Collected as a patch and merged, rather than written back into a copy of the row: a generic row
  // is not writable by index, and widening it to do so would throw away the shape the caller asked
  // for on the way in.
  return rows.map(row => {
    const patch: Row = {}
    for (const column of flags) {
      const value = row[column]
      if (typeof value === "number") patch[column] = value === 1
    }
    return { ...row, ...patch }
  })
}
