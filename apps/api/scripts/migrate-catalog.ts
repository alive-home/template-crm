/**
 * Step 4 of the migration: the catalog rows that describe the tables step 1 to 3 just shaped.
 *
 * It is its own file because it is its own job. The rest of `migrate.ts` reasons about DDL — what
 * exists, what is missing, what to create — and never reads a row. This half writes nothing but
 * rows, into four tables that were loaded from a hosted CRM and carry that export's ids.
 *
 * Which is the whole difficulty, and the rule that follows from it: **an existing description is
 * never rewritten, only a missing one is added.** Every match is by slug, never by id. The loaded
 * catalog holds each object and attribute under the source system's UUID, so keying on an id we
 * generated would file a second copy of every field beside the ones already there, and the CRM
 * would render each attribute twice.
 */
import type { Client } from "@libsql/client"
import { attributeId, type Column, type ObjectTable } from "../src/crm/schema"
import { query } from "../src/crm/turso"

export type CatalogCounts = { objects: number; attributes: number; options: number }

type Options = {
  client: Client
  objects: readonly ObjectTable[]
  /** Plan only. A dry run against a database whose catalog is still unrenamed cannot read it at all. */
  dryRun: boolean
  /** Table names as they are on disk, before the rename in step 1 was planned. */
  tablesOnDisk: ReadonlySet<string>
}

/** An object's attributes, plus its child tables — `domains` is one multi-value attribute, not five columns. */
function attributesOf(object: ObjectTable): (Column & { multi?: true })[] {
  return [
    ...object.columns,
    ...object.children.map(child => ({
      name: child.slug,
      store: "text" as const,
      type: child.type,
      title: child.title,
      multi: true as const,
    })),
  ]
}

export async function describeCatalog({ client, objects, dryRun, tablesOnDisk }: Options): Promise<CatalogCounts> {
  const readable = (table: string) => !dryRun || tablesOnDisk.has(table)

  // Keyed `object.attribute`, the pair the CRM itself reads an attribute by, whatever its id is.
  const describedAttributes = new Map(
    (readable("catalog_attribute")
      ? await query<{ object_slug: string; api_slug: string; attribute_id: string }>(
          "select object_slug, api_slug, attribute_id from catalog_attribute",
        )
      : []
    ).map(row => [`${row.object_slug}.${row.api_slug}`, row.attribute_id]),
  )

  // Slug -> the id the catalog files that object under. An attribute row carries both, and `object_id`
  // is not null, so an attribute cannot be described before the object it belongs to is.
  const objectIds = new Map(
    (readable("catalog_object")
      ? await query<{ object_id: string; api_slug: string }>("select object_id, api_slug from catalog_object")
      : []
    ).map(row => [row.api_slug, row.object_id]),
  )

  const counts: CatalogCounts = { objects: 0, attributes: 0, options: 0 }

  for (const object of objects) {
    if (!objectIds.has(object.table)) {
      if (!dryRun) {
        await client.execute({
          sql: "insert into catalog_object (object_id, api_slug, singular_noun, plural_noun) values (?, ?, ?, ?)",
          args: [object.table, object.table, object.singular, object.plural],
        })
      }
      objectIds.set(object.table, object.table)
      counts.objects++
    }

    const objectId = objectIds.get(object.table) ?? object.table

    for (const attribute of attributesOf(object)) {
      const key = `${object.table}.${attribute.name}`
      let id = describedAttributes.get(key)

      if (!id) {
        id = attributeId(object.table, attribute.name)
        if (!dryRun) {
          await client.execute({
            // Every not-null column is named. `storage` is the catalog's own word for where a value
            // lives: a multi-value attribute is a child table, everything else is a column on the row.
            sql: `insert into catalog_attribute
					        (attribute_id, object_id, object_slug, api_slug, title, type, is_system_attribute,
					         is_writable, is_required, is_unique, is_multiselect, is_archived, storage)
					      values (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 0, ?)`,
            args: [
              id,
              objectId,
              object.table,
              attribute.name,
              attribute.title ?? null,
              attribute.type,
              attribute.system ? 1 : 0,
              attribute.system ? 0 : 1,
              attribute.multi ? 1 : 0,
              attribute.multi ? "child_table" : "column",
            ],
          })
        }
        describedAttributes.set(key, id)
        counts.attributes++
      }

      // Options are only ever added. A value somebody added in Turso is a real option that this file
      // does not know about, and removing it would break the rows already using it.
      for (const option of attribute.options ?? []) {
        const status = attribute.type === "status"
        const table = status ? "catalog_status" : "catalog_select_option"
        // A status row carries one column a select option does not, and it is not null.
        const columns = status
          ? "status_id, attribute_id, title, is_archived, celebration_enabled"
          : "option_id, attribute_id, title, is_archived"
        const values = status ? "?, ?, ?, 0, 0" : "?, ?, ?, 0"
        if (dryRun) continue

        const exists = await client.execute({
          sql: `select 1 from ${table} where attribute_id = ? and title = ?`,
          args: [id, option],
        })
        if (exists.rows.length > 0) continue

        await client.execute({
          sql: `insert into ${table} (${columns}) values (${values})`,
          args: [`${id}.${option}`, id, option],
        })
        counts.options++
      }
    }
  }

  return counts
}
