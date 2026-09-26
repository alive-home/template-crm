/**
 * Reading values back out of a libsql row.
 *
 * A row column is `unknown` and stays `unknown` until something checks it. The code above this file
 * used to say `row.title as string | null` at every such point, which is not a check: a column that
 * came back as a number then travelled on as a `string` and only failed somewhere else, with the
 * cast nowhere in the stack. These are the checks that were being skipped, in one place.
 *
 * `null` means "not a value of this type" and not only "SQL NULL", on purpose. Callers already treat
 * a missing column as empty, and inventing a different empty for "wrong type" would only give them a
 * second nothing to handle.
 */

/** A row as it leaves the database: every column present, every value still unchecked. */
export type Row = Record<string, unknown>

/** The column as text, or null when it is absent or not text. */
export function text(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

/** The column as text, or the empty string. For places that concatenate rather than branch. */
export function textOr(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback
}

/**
 * The column as text, or a thrown error naming the column.
 *
 * For a column the query itself selected and the schema declares NOT NULL: a miss there is a bug in
 * the SQL, not data to route around, and it should say which column while the query is still on
 * screen.
 */
export function requireText(value: unknown, column: string): string {
  if (typeof value !== "string") throw new Error(`expected ${column} to be text, got ${describe(value)}`)
  return value
}

/** The column as a number, or null when it is absent or not a number. */
export function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

/** The column as a number, or 0. Counts and sums, where "no rows" and "zero" are the same answer. */
export function numOr(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

/** Every text value in a column of a result set, skipping the rows where it is not text. */
export function textColumn(rows: readonly Row[], column: string): string[] {
  return rows.map(row => text(row[column])).filter((value): value is string => value !== null)
}

function describe(value: unknown): string {
  if (value === null) return "null"
  return typeof value
}
