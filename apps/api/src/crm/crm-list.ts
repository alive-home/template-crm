import type { InValue } from "@libsql/client"
import { CRM_SCHEMA, type CrmObject, tableColumns } from "./crm"
import type { Row } from "./crm-records"
import { query, queryOne } from "./turso"

/**
 * Reading one page of one object.
 *
 * The list route used to be `SELECT *` with no `LIMIT`, ordered by name, and it worked because the
 * tables were small. Everything about it stops working somewhere between here and the size this CRM
 * is being built for: the row scan, the sort, the JSON, the browser holding all of it, and the five
 * child-table reads that fetched every domain and category in the database to decorate them.
 *
 * So a list is a page now, and the page is the unit everything else is scoped to.
 */

/** Rows per request. Set by the client; the ceiling is here so a URL cannot ask for the table. */
const PAGE_DEFAULT = 100
const PAGE_MAX = 500

export type ListParams = {
  q?: string
  field?: string
  value?: string
  limit: number
  offset: number
  sort?: string
  direction: "asc" | "desc"
}

/** Reads the query string into a page request, clamping rather than rejecting a silly number. */
export function listParams(url: URL): ListParams {
  /*
   * An absent parameter is not a zero.
   *
   * `Number(null)` is 0 and `Number("")` is 0, both of which are finite and non-negative, so reading
   * the value before checking that it is there answered every unparameterised request with a page of
   * no rows and a full total — a list that knows how many records it has and shows none of them.
   */
  const number = (name: string, fallback: number) => {
    const raw = url.searchParams.get(name)
    if (raw === null || raw.trim() === "") return fallback
    const parsed = Number(raw)
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback
  }

  return {
    q: url.searchParams.get("q") ?? undefined,
    field: url.searchParams.get("field") ?? undefined,
    value: url.searchParams.get("value") ?? undefined,
    limit: Math.min(number("limit", PAGE_DEFAULT), PAGE_MAX),
    offset: number("offset", 0),
    sort: url.searchParams.get("sort") ?? undefined,
    direction: url.searchParams.get("dir") === "desc" ? "desc" : "asc",
  }
}

/**
 * The SQL behind a sortable column, or null if the column cannot be sorted.
 *
 * Sorting moved to the server with pagination, because sorting a page is not sorting a list — click
 * "oldest first" on page one of three thousand and a client-side sort answers with the oldest of the
 * hundred rows it happens to be holding, which is a wrong answer presented as a right one.
 *
 * Three kinds of column, because the response has three kinds of key:
 * - a real column of the table, quoted and used directly;
 * - a collection assembled from a child table, which sorts by how many there are, the way the grid
 *   has always sorted it;
 * - a single reference stored as a bare id, which sorts by the label you can actually see rather
 *   than by the UUID underneath it.
 *
 * Everything is derived from the registry, so no caller-supplied string is ever interpolated: the
 * column name is matched against a known set first, and what goes into the SQL is what the registry
 * holds.
 */
async function sortExpression(object: CrmObject, column: string): Promise<string | null> {
  const schema = CRM_SCHEMA[object]
  if (column === "label") return schema.label

  const child = schema.children.find(candidate => candidate.key === column)
  if (child) {
    // NULLIF so that "none" sorts as blank rather than as the smallest number. The grid pins blanks
    // to the bottom in both directions, and a record with no domains has nothing to say about domains.
    return `NULLIF((SELECT COUNT(*) FROM ${child.table} kid WHERE kid.record_id = ${schema.table}.record_id), 0)`
  }

  const lookup = schema.lookups?.find(candidate => candidate.key === column)
  if (lookup) {
    const target = CRM_SCHEMA[lookup.ref]
    return `(SELECT ${target.label} FROM ${target.table} ref WHERE ref.record_id = ${schema.table}."${lookup.column}")`
  }

  /*
   * Unqualified, and that matters for the index rather than for the SQL.
   *
   * `companies."name"` and `"name"` mean the same thing in a single-table query, but the ordering
   * here is an *expression* — `(x IS NULL OR x = '')` — and SQLite matches an expression index by
   * comparing the expression structurally. A qualified reference in the query and a bare one in the
   * index are not obviously the same tree, and SQLite will not allow a qualified name in an index
   * definition at all, so the two could never be written to agree. Both sides say `"name"`.
   */
  const columns = await tableColumns(object)
  return columns.has(column) ? `"${column}"` : null
}

/**
 * The two leading terms of every sort: blanks last, then the value.
 *
 * Most columns are null on most records — 76% of the fields in a companies page are empty — so
 * letting empties lead a descending sort makes the first screen the rows with nothing to say. This
 * is the same rule the client-side sort had; it just runs where the rows are now.
 *
 * `apps/api/src/crm/schema-indexes.ts` builds its indexes out of this exact function, which is the only reason
 * any of it is indexable. An index on `name` does not serve `ORDER BY (name IS NULL...), name`:
 * SQLite matches an index against the whole ordering term by term, so a two-term sort needs a
 * two-term index and one written by hand beside it drifts the first time either changes.
 */
export function sortTerms(expression: string, direction: "asc" | "desc"): string {
  return `(${expression} IS NULL OR ${expression} = '') ASC, ${expression} COLLATE NOCASE ${direction.toUpperCase()}, record_id ASC`
}

/**
 * `ORDER BY`, ending in `record_id`, which is doing two jobs.
 *
 * Paging is `LIMIT`/`OFFSET`, so an ordering that leaves ties unresolved lets rows swap places
 * between two requests: a record can arrive on page two having already been seen on page one, and
 * another is never shown at all. Sorting a CRM by a status with nine values means almost every row
 * is tied, so this is the normal case rather than a rare one. `record_id` is unique, so adding it
 * last makes the order total and the paging repeatable.
 *
 * It is also what lets the index cover the whole sort. An index can only satisfy an `ORDER BY` it
 * matches term for term, so a trailing term that is *not* in the index sends the whole thing to a
 * temp B-tree — which is what the label tiebreaker did here before, quietly, while the plan for the
 * default view looked fine.
 */
function orderBy(expression: string, direction: "asc" | "desc"): string {
  return `ORDER BY ${sortTerms(expression, direction)}`
}

export type ListPage = { rows: (Row & { record_id: string })[]; total: number; limit: number; offset: number }

/**
 * One page of records, plus how many there are in total.
 *
 * The count is a second query over the same WHERE rather than something derived from the page,
 * because the page cannot know. It is what lets the grid say "100 of 12,480" instead of "100", and
 * a grid that shows a hundred rows without saying how many it is not showing is the table version
 * of a map that draws 148 dots and calls itself the CRM.
 */
export async function listRecords(object: CrmObject, params: ListParams): Promise<ListPage | { error: string }> {
  const schema = CRM_SCHEMA[object]
  const clauses: string[] = []
  const args: InValue[] = []

  if (params.q) {
    clauses.push(`(${schema.search.map(column => `${column} LIKE ?`).join(" OR ")})`)
    for (const _ of schema.search) args.push(`%${params.q}%`)
  }

  // Filtering is by real column, checked against the table rather than trusted from the query string.
  if (params.field && params.value !== undefined) {
    const columns = await tableColumns(object)
    if (!columns.has(params.field)) return { error: `unknown field: ${params.field}` }
    clauses.push(`"${params.field}" = ?`)
    args.push(params.value)
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""

  const expression = params.sort ? await sortExpression(object, params.sort) : schema.label
  if (!expression) return { error: `column cannot be sorted: ${params.sort}` }
  const order = orderBy(expression, params.direction)

  // Count and page in parallel: they read the same rows and neither depends on the other.
  const [total, rows] = await Promise.all([
    queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM ${schema.table} ${where}`, args),
    query<Row & { record_id: string }>(
      `SELECT *, ${schema.label} AS label FROM ${schema.table} ${where} ${order} LIMIT ? OFFSET ?`,
      [...args, params.limit, params.offset],
    ),
  ])

  return { rows, total: total?.n ?? 0, limit: params.limit, offset: params.offset }
}

/**
 * How many notes each record on this page carries.
 *
 * Scoped to the page for the same reason the child values are: this was a `GROUP BY` over the whole
 * note table to decorate whichever records happened to be on screen.
 */
export async function noteCounts(object: CrmObject, recordIds: string[]): Promise<Map<string, number>> {
  if (recordIds.length === 0) return new Map()

  const placeholders = recordIds.map(() => "?").join(",")
  const rows = await query<{ parent_record_id: string; n: number }>(
    `SELECT parent_record_id, COUNT(*) AS n FROM note
		 WHERE parent_object = ? AND parent_record_id IN (${placeholders}) GROUP BY parent_record_id`,
    [object, ...recordIds],
  )
  return new Map(rows.map(row => [row.parent_record_id, row.n]))
}
