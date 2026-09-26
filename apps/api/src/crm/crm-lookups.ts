import { CRM_SCHEMA, type CrmObject } from "./crm"
import { query } from "./turso"

/**
 * Resolve bare reference id columns into `{ id, object, label }`.
 *
 * A person's company arrives as `company_record_id` and nothing else, so without this a list of
 * people shows a column of UUIDs. One query per lookup for the whole page, not one per row.
 *
 * A missing target keeps its id and a null label rather than being dropped: a reference pointing at
 * a reference pointing at a record that is not there is a real state, and blanking it would hide it.
 */
export async function withLookups<T extends Record<string, unknown>>(object: CrmObject, rows: T[]): Promise<T[]> {
  const lookups = CRM_SCHEMA[object].lookups
  if (!lookups?.length || rows.length === 0) return rows

  const resolved = await Promise.all(
    lookups.map(async lookup => {
      const ids = [...new Set(rows.map(row => row[lookup.column]).filter((id): id is string => typeof id === "string"))]
      if (ids.length === 0) return [lookup, new Map<string, string | null>()] as const

      const labels = await query<{ record_id: string; label: string | null }>(
        `SELECT record_id, ${CRM_SCHEMA[lookup.ref].label} AS label FROM ${CRM_SCHEMA[lookup.ref].table}
				 WHERE record_id IN (${ids.map(() => "?").join(", ")})`,
        ids,
      )

      return [lookup, new Map(labels.map(row => [row.record_id, row.label]))] as const
    }),
  )

  return rows.map(row => {
    const extra: Record<string, unknown> = {}

    for (const [lookup, labels] of resolved) {
      const id = row[lookup.column]
      extra[lookup.key] = typeof id === "string" ? { id, object: lookup.ref, label: labels.get(id) ?? null } : null
    }

    return { ...row, ...extra }
  })
}
