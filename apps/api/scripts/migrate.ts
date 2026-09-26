/**
 * Bring a Turso database up to the schema this code needs.
 *
 * There was no way to start. The CRM reads its columns at runtime, which means it adapts to whatever
 * the database already has — and means an empty database stays empty, because nothing anywhere
 * creates a table. A fresh clone pointed at a fresh Turso database got "no such table: companies" and
 * no route forward.
 *
 * Safe to run against a database that already has data. Every step is additive and conditional:
 *
 * - **Tables** are `create table if not exists`. An existing table is never redefined.
 * - **Columns** are added only when `pragma_table_info` says they are missing. Nothing is dropped,
 *   renamed or retyped, so a column holding data cannot be touched by this script.
 * - **Catalog rows** are matched on `(object_slug, api_slug)`, not on id. The original database
 *   carries the source system's UUIDs; inserting by our own deterministic id would have added a
 *   second row for every attribute and shown every field twice.
 * - **The one rename** is the old `attio_*` catalog prefix, and it runs first. In the other order,
 *   step two would create empty `catalog_*` tables beside the populated `attio_*` ones and the CRM
 *   would come up with every column untyped.
 *
 * Nothing here writes a record. An empty database stays empty of people and companies; it just
 * becomes a database this code can open.
 *
 * Steps 1 to 3 are here and reason about DDL. Step 4, the catalog rows that describe the result, is
 * `migrate-catalog.ts`: writing rows into four tables loaded from somebody else's export is a
 * different job with a different rule, and the two were one file only by accident of order.
 *
 * Run: `bun apps/api/scripts/migrate.ts`, or `--dry-run` to print the statements without executing them.
 * Requires TURSO_DATABASE_URL_CRM and TURSO_API_KEY_CRM, and it writes to whichever they name.
 */
import { CRM_SCHEMA } from "../src/crm/crm"
import { textColumn } from "../src/crm/row"
import {
  CATALOG_TABLES,
  type Column,
  childColumns,
  childDdl,
  OBJECTS,
  objectDdl,
  SUPPORT_TABLES,
} from "../src/crm/schema"
import { objectIndexes } from "../src/crm/schema-indexes"
import { turso } from "../src/crm/turso"
import { describeCatalog } from "./migrate-catalog"

const dryRun = process.argv.includes("--dry-run")
const client = turso()

const statements: string[] = []

/** Run a statement, or record it and move on. Everything the migration does goes through here. */
async function run(sql: string): Promise<void> {
  statements.push(sql)
  if (!dryRun) await client.execute(sql)
}

/**
 * The registry and the schema must agree before anything is written.
 *
 * `apps/api/src/crm/crm.ts` decides which table backs an object and which child tables it joins; this file
 * decides what those tables contain. They are two files, so they can drift — and the way that shows
 * up in production is a route selecting from a table the migration never created. Checking takes a
 * dozen lines and turns that into a startup error with a name in it.
 */
function checkAgainstRegistry(): void {
  const declared = new Set(OBJECTS.map(object => object.table))
  const declaredChildren = new Set(OBJECTS.flatMap(object => object.children.map(child => child.table)))
  const problems: string[] = []

  for (const [object, def] of Object.entries(CRM_SCHEMA)) {
    if (!declared.has(def.table)) problems.push(`${object}: table "${def.table}" is not in apps/api/src/crm/schema.ts`)
    for (const child of def.children) {
      if (!declaredChildren.has(child.table)) problems.push(`${object}: child table "${child.table}" is not declared`)
    }

    const columns = new Set(OBJECTS.find(o => o.table === def.table)?.columns.map(c => c.name) ?? [])
    // The label can be an expression (`COALESCE(display_name, primary_email_address)`), so only a bare
    // column name is checkable. Searched and looked-up columns are always bare.
    const named = [...def.search, ...(def.lookups?.map(lookup => lookup.column) ?? [])]
    if (/^\w+$/.test(def.label)) named.push(def.label)
    for (const column of named) {
      if (!columns.has(column)) problems.push(`${object}: SQL reads "${column}", which is not declared`)
    }
  }

  if (problems.length > 0) {
    throw new Error(`apps/api/src/crm/crm.ts and apps/api/src/crm/schema.ts disagree:\n  ${problems.join("\n  ")}`)
  }
}

checkAgainstRegistry()

/**
 * What the database already has.
 *
 * Indexes are read alongside tables so a re-run reports nothing at all. `create index if not exists`
 * is harmless to repeat, but a migration whose second run still prints five statements trains you to
 * stop reading its output, and the run that finally does something goes unnoticed.
 */
const existing = await client.execute("select name, type from sqlite_master where type in ('table', 'index')")
const tables = new Set(
  textColumn(
    existing.rows.filter(row => row.type === "table"),
    "name",
  ),
)
const indexes = new Set(
  textColumn(
    existing.rows.filter(row => row.type === "index"),
    "name",
  ),
)

/**
 * The table names as they are on disk, before step 1 pretends to rename any of them.
 *
 * `tables` is updated as the migration goes, which is what keeps step 2 from recreating something
 * step 1 just renamed. In a dry run nothing was renamed, so that same update makes the catalog look
 * present under a name the database does not have yet, and reading it throws. This set is the
 * honest answer to "what can actually be selected from right now".
 */
const tablesOnDisk = new Set(tables)

/** `create index if not exists <name> on ...` — the name is what decides whether it is already there. */
const indexName = (sql: string): string => sql.match(/if not exists (\w+)/)?.[1] ?? ""

// ---------------------------------------------------------------------------------------------
// 1. The catalog rename, before anything can create a table beside it.
// ---------------------------------------------------------------------------------------------

for (const suffix of ["object", "attribute", "select_option", "status"]) {
  const from = `attio_${suffix}`
  const to = `catalog_${suffix}`
  if (tables.has(from) && !tables.has(to)) {
    await run(`alter table ${from} rename to ${to}`)
    tables.delete(from)
    tables.add(to)
  }
}

// ---------------------------------------------------------------------------------------------
// 2. Tables.
// ---------------------------------------------------------------------------------------------

for (const table of [...CATALOG_TABLES, ...SUPPORT_TABLES]) {
  if (!tables.has(table.name)) await run(table.ddl)
  // Indexes are checked separately from their table: an index added to this file later has to reach a
  // database whose table was created before it existed.
  for (const index of table.indexes ?? []) {
    if (!indexes.has(indexName(index))) await run(index)
  }
}

for (const object of OBJECTS) {
  if (!tables.has(object.table)) await run(objectDdl(object))
  for (const child of object.children) {
    if (!tables.has(child.table)) await run(childDdl(child))
  }
}

// The list queries' own indexes, generated from the ordering they use. Checked by name like every
// other index here, so a database created before they existed picks them up on the next run.
for (const index of objectIndexes()) {
  if (!indexes.has(indexName(index))) await run(index)
}

// ---------------------------------------------------------------------------------------------
// 3. Columns missing from tables that already existed.
// ---------------------------------------------------------------------------------------------

/** Add whatever this table is missing. A table created a moment ago has nothing missing. */
async function addMissingColumns(table: string, columns: Column[]): Promise<void> {
  if (!tables.has(table)) return

  const present = new Set(
    textColumn((await client.execute(`select name from pragma_table_info('${table}')`)).rows, "name"),
  )
  for (const column of columns) {
    if (!present.has(column.name)) await run(`alter table ${table} add column "${column.name}" ${column.store}`)
  }
}

for (const object of OBJECTS) {
  await addMissingColumns(object.table, object.columns)
  for (const child of object.children) await addMissingColumns(child.table, childColumns(child))
}

// ---------------------------------------------------------------------------------------------
// 4. The catalog rows that describe all of it, in `migrate-catalog.ts` — rows, not DDL.
// ---------------------------------------------------------------------------------------------

const described = await describeCatalog({ client, objects: OBJECTS, dryRun, tablesOnDisk })

// ---------------------------------------------------------------------------------------------

if (dryRun) {
  for (const sql of statements) console.log(`${sql};\n`)
  console.log(`-- ${statements.length} statements, nothing executed. Catalog rows are not planned in dry runs.`)
} else {
  for (const sql of statements) console.log((sql.split("\n")[0] ?? sql).trim())
  console.log(
    `\n${statements.length} schema statements, ${described.objects} objects and ${described.attributes} attributes ` +
      `described, ${described.options} options added.`,
  )
}
