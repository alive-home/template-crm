import { Hono } from "hono"
import { query, queryOne } from "./turso"

/**
 * The read-only doors into the playbook and its application settings.
 *
 * These rows are not CRM objects, so they do not enter the object registry or the generic record
 * routes. A guide is also not a blob to send with every list request: its markdown can be tens of
 * kilobytes, while the list only needs enough metadata to choose one. The body therefore has one
 * explicit slug route, and settings have their own literal path beside it.
 *
 * The tables are declared in `apps/api/src/crm/schema-playbook.ts` and created by `apps/api/scripts/migrate.ts`. This
 * file only reads them. An unmigrated database is a normal state during setup, so list routes answer
 * with an empty list and a named migration instruction instead of turning setup into a 500.
 */

type DocListRow = {
  doc_id: string
  title: string
  kind: string
  summary: string | null
  position: number
  updated_at: string
}

type DocRow = DocListRow & { body: string }
type SettingRow = { key: string; value: string; note: string | null }

const MIGRATION_MESSAGE = "The playbook tables do not exist yet. Run bun apps/api/scripts/migrate.ts"

function isMissingTable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /no such table/i.test(message)
}

export function crmDocRoutes(): Hono {
  const app = new Hono()

  /** GET /api/crm/docs — metadata only; document bodies have their own route. */
  app.get("/docs", async c => {
    try {
      const rows = await query<DocListRow>(
        "SELECT doc_id, title, kind, summary, position, updated_at FROM doc ORDER BY position, title",
      )
      return c.json(
        rows.map(row => ({
          id: row.doc_id,
          title: row.title,
          kind: row.kind,
          summary: row.summary,
          position: row.position,
          updatedAt: row.updated_at,
        })),
      )
    } catch (error) {
      if (!isMissingTable(error)) throw error
      return c.json({ docs: [], error: MIGRATION_MESSAGE })
    }
  })

  /** GET /api/crm/docs/:slug — one full guide, including its verbatim markdown body. */
  app.get("/docs/:slug", async c => {
    try {
      const row = await queryOne<DocRow>(
        "SELECT doc_id, title, kind, body, summary, position, updated_at FROM doc WHERE doc_id = ?",
        [c.req.param("slug")],
      )
      if (!row) return c.json({ error: "document not found" }, 404)
      return c.json({
        id: row.doc_id,
        title: row.title,
        kind: row.kind,
        body: row.body,
        summary: row.summary,
        position: row.position,
        updatedAt: row.updated_at,
      })
    } catch (error) {
      if (!isMissingTable(error)) throw error
      return c.json({ error: MIGRATION_MESSAGE }, 404)
    }
  })

  /** GET /api/crm/settings — tunable values, ordered by their stable key. */
  app.get("/settings", async c => {
    try {
      const rows = await query<SettingRow>("SELECT key, value, note FROM app_setting ORDER BY key")
      return c.json(rows)
    } catch (error) {
      if (!isMissingTable(error)) throw error
      return c.json({ settings: [], error: MIGRATION_MESSAGE })
    }
  })

  return app
}
