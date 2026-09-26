/**
 * The shape of a declaration in `apps/api/src/crm/schema.ts`, and how one turns into SQL.
 *
 * Kept apart from the declarations themselves so that adding a table never means scrolling past the
 * type that describes it, and so the DDL builders sit next to the shape they read rather than at the
 * bottom of a four-hundred-line file. Nothing here knows which tables exist.
 */

/**
 * How the column is stored, and what the catalog calls it.
 *
 * `store` is SQLite's declared type, which mostly decides nothing (SQLite is dynamically typed) but
 * does decide integer primary keys and reads as documentation. `type` is the catalog's attribute
 * type, which is what actually drives the UI: the header icon, the chip, the 0/1-to-boolean pass in
 * `crm-routes.ts`. The two are separate because `is_completed` is stored as an integer and rendered
 * as a checkbox, and both facts are true.
 */
export type Column = {
  name: string
  store: "text" | "integer" | "real"
  /** Catalog attribute type. Matches `ColumnKind` in `apps/web/src/lib/crm-columns.ts`. */
  type: string
  /** Heading, only where the one derived from the name is wrong. */
  title?: string
  /** Allowed values, for `select` and `status`. Seeded into the catalog's option tables. */
  options?: string[]
  /** Written by the system rather than typed by a person: ids, provenance, timestamps. */
  system?: true
}

/**
 * A multi-value attribute: its own table, keyed back to the parent.
 *
 * `value` holds a scalar (a domain, an email address). `reference` points at another record and is
 * resolved to a label by `crm-routes.ts`. `extra` is for the rare column beyond the shape, which is
 * `value_root_domain` on domains and nothing else.
 */
export type Child = {
  table: string
  /** The attribute slug this collection is exposed as. */
  slug: string
  kind: "value" | "reference"
  type: string
  title?: string
  extra?: Column[]
}

export type ObjectTable = {
  table: string
  singular: string
  plural: string
  columns: Column[]
  children: Child[]
}

/** Every record table carries these. `record_id` is the identity; the rest are provenance. */
export const IDENTITY: Column[] = [
  { name: "record_id", store: "text", type: "text", title: "Record ID", system: true },
  { name: "created_at", store: "text", type: "timestamp", title: "Added", system: true },
  { name: "created_by_actor_id", store: "text", type: "actor-reference", system: true },
  { name: "created_by_actor_type", store: "text", type: "actor-reference", system: true },
]

/** DDL for one object's own table. */
export function objectDdl(object: ObjectTable): string {
  const columns = object.columns.map(column =>
    column.name === "record_id" ? `${column.name} ${column.store} primary key` : `"${column.name}" ${column.store}`,
  )
  return `create table if not exists ${object.table} (\n\t${columns.join(",\n\t")}\n)`
}

/** Every column a child table has, including the two that define its shape. */
export function childColumns(child: Child): Column[] {
  return [
    { name: "record_id", store: "text", type: "text", system: true },
    { name: "position", store: "integer", type: "number", system: true },
    child.kind === "value"
      ? { name: "value", store: "text", type: child.type }
      : { name: "value_record_id", store: "text", type: "record-reference" },
    ...(child.kind === "reference"
      ? [{ name: "value_target_object", store: "text" as const, type: "text", system: true as const }]
      : []),
    ...(child.extra ?? []),
  ]
}

/**
 * DDL for a child table.
 *
 * `(record_id, position)` is the key: a record's third domain is one row, and re-importing it
 * overwrites rather than duplicates.
 */
export function childDdl(child: Child): string {
  const columns = childColumns(child).map(column => `"${column.name}" ${column.store}`)
  return `create table if not exists ${child.table} (\n\t${columns.join(",\n\t")},\n\tprimary key (record_id, position)\n)`
}

/**
 * A deterministic attribute id, so re-running the migration updates a row rather than adding one.
 *
 * The original catalog used the source system's UUIDs. Those are meaningless here and there is no
 * authority handing out new ones, so the id is the thing it identifies.
 */
export const attributeId = (object: string, slug: string): string => `${object}.${slug}`
