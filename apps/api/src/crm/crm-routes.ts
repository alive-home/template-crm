import type { InValue } from "@libsql/client"
import { Hono } from "hono"
import { attributesFor, CRM_SCHEMA, isCrmObject, writableColumns } from "./crm"
import { listParams, listRecords, noteCounts } from "./crm-list"
import { withLookups } from "./crm-lookups"
import { crmMapRoutes } from "./crm-map"
import { crmMarketRoutes } from "./crm-market"
import { crmOutboundRoutes } from "./crm-outbound"
import { crmPersonaRoutes } from "./crm-personas"
import { crmPipelineRoutes } from "./crm-pipeline"
import { childValues, type Row, withBooleans } from "./crm-records"
import { crmSummaryRoutes } from "./crm-summary"
import { crmTaskRoutes } from "./crm-tasks"
import { PICTURE_COLUMNS, pictureUrlProblem } from "./picture"
import { loadPictureRules } from "./picture-rules"
import { execute, query, queryOne } from "./turso"

/**
 * CRM read/write API, backed by the hosted database in Turso.
 *
 * Every handler is async — libsql is a network client, not an in-process file. Object names arriving
 * from the URL are checked against the registry before they reach SQL, so a table name is never
 * interpolated from user input; values always travel as bound parameters.
 */

export function crmRoutes(): Hono {
  const app = new Hono()

  // GET /api/crm/summary — the overview aggregate, counted in SQL. Mounted first so the literal
  // path wins over `/:object`, which would otherwise match "summary" as an object name.
  app.route("/", crmSummaryRoutes())

  // GET /api/crm/outbound — the drafts feed, same reason: a literal path ahead of `/:object`.
  app.route("/", crmOutboundRoutes())

  // GET /api/crm/market — the case companies and the work already delivered there, same reason.
  app.route("/", crmMarketRoutes())

  // GET /api/crm/map — the companies we can place, as GeoJSON. Literal path ahead of `/:object`.
  app.route("/", crmMapRoutes())

  // GET /api/crm/pipeline — the deals as cards, grouped by stage. Literal path again.
  app.route("/", crmPipelineRoutes())

  // GET /api/crm/personas — ours rather than the CRM's, but read over the same connection.
  app.route("/", crmPersonaRoutes())

  // /api/crm/tasks and /api/crm/notes/:id — addressed by their own id, so literal paths again.
  app.route("/", crmTaskRoutes())

  /** GET /api/crm/schema/:object — the attribute catalog: titles, types, options. */
  app.get("/schema/:object", async c => {
    const object = c.req.param("object")
    if (!isCrmObject(object)) return c.json({ error: `unknown object: ${object}` }, 404)

    const attributes = await attributesFor(object)
    return c.json({
      object,
      singular: CRM_SCHEMA[object].singular,
      attributes: attributes.map(attribute => ({
        slug: attribute.api_slug,
        title: attribute.title,
        type: attribute.type,
        isSystem: attribute.is_system_attribute === 1,
        isMultiselect: attribute.is_multiselect === 1,
        options: attribute.options,
      })),
    })
  })

  /**
   * GET /api/crm/:object — one page of records, with ?q= search, ?field=&value= filter and ?sort=.
   *
   * The response is `{ rows, total, limit, offset }` rather than a bare array. That shape is the
   * point: a page of a hundred rows handed over as an array is indistinguishable from a complete
   * list of a hundred rows, and the grid would have no way to say what it is not showing.
   */
  app.get("/:object", async c => {
    const object = c.req.param("object")
    if (!isCrmObject(object)) return c.json({ error: `unknown object: ${object}` }, 404)

    const page = await listRecords(object, listParams(new URL(c.req.url)))
    if ("error" in page) return c.json({ error: page.error }, 400)

    const ids = page.rows.map(row => row.record_id)
    const [children, notes] = await Promise.all([childValues(object, ids), noteCounts(object, ids)])

    const rows = await withBooleans(
      object,
      await withLookups(
        object,
        page.rows.map(row => ({ ...row, ...children.get(row.record_id), noteCount: notes.get(row.record_id) ?? 0 })),
      ),
    )

    return c.json({ rows, total: page.total, limit: page.limit, offset: page.offset })
  })

  /** GET /api/crm/:object/:id — one record with its multi-value fields, notes and tasks. */
  app.get("/:object/:id", async c => {
    const object = c.req.param("object")
    if (!isCrmObject(object)) return c.json({ error: `unknown object: ${object}` }, 404)

    const id = c.req.param("id")
    const schema = CRM_SCHEMA[object]
    const row = await queryOne<Row & { record_id: string }>(
      `SELECT *, ${schema.label} AS label FROM ${schema.table} WHERE record_id = ?`,
      [id],
    )
    if (!row) return c.json({ error: "not found" }, 404)

    const [children, notes, tasks, projects] = await Promise.all([
      childValues(object, [id]),
      query<Row>(
        `SELECT note_id, title, content_plaintext, created_at FROM note
				 WHERE parent_object = ? AND parent_record_id = ? ORDER BY created_at DESC`,
        [object, id],
      ),
      query<Row>(
        `SELECT task.task_id, task.content_plaintext, task.is_completed, task.deadline_at FROM task
				 JOIN task_linked_record link ON link.task_id = task.task_id
				 WHERE link.target_record_id = ? ORDER BY task.created_at`,
        [id],
      ),
      // Projects point at their company, not the other way round, so a company's delivered work is
      // a backlink rather than a child table. Without it the work sits in the CRM and shows up on
      // no page anyone opens.
      object === "companies"
        ? query<Row>(
            `SELECT record_id, name, status, tech_stack, notes FROM projects
						 WHERE company_record_id = ? ORDER BY created_at`,
            [id],
          )
        : Promise.resolve<Row[]>([]),
    ])

    const [record] = await withBooleans(object, await withLookups(object, [{ ...row, ...children.get(id) }]))

    return c.json({
      ...record,
      notes: notes.map(note => ({
        id: note.note_id,
        title: note.title,
        content: note.content_plaintext,
        createdAt: note.created_at,
      })),
      tasks: tasks.map(task => ({
        id: task.task_id,
        content: task.content_plaintext,
        isCompleted: task.is_completed === 1,
        deadlineAt: task.deadline_at,
      })),
      projects: projects.map(project => ({
        id: project.record_id,
        name: project.name,
        status: project.status,
        stack: project.tech_stack,
        notes: project.notes,
      })),
    })
  })

  /**
   * PATCH /api/crm/:object/:id — write attribute columns.
   *
   * Only columns that exist on the table are accepted, and identity and provenance are never
   * writable. An unknown field is rejected rather than ignored: silently dropping a field the caller
   * believes it saved is the worse failure.
   */
  app.patch("/:object/:id", async c => {
    const object = c.req.param("object")
    if (!isCrmObject(object)) return c.json({ error: `unknown object: ${object}` }, 404)

    const body = await c.req
      .json<{ values?: Record<string, unknown> }>()
      .catch((): { values?: Record<string, unknown> } => ({}))
    const entries = Object.entries(body.values ?? {})
    if (!entries.length) return c.json({ error: "no values to write" }, 400)

    const columns = await writableColumns(object)
    const unknown = entries.filter(([key]) => !columns.has(key)).map(([key]) => key)
    if (unknown.length) return c.json({ error: `unknown or read-only fields: ${unknown.join(", ")}` }, 400)

    /*
     * A picture column is checked before it is stored, for the same reason an unknown field is a 400:
     * a URL that cannot render is a field that reads as filled and shows nothing, and the page it
     * breaks is not the page you were on when you saved it.
     */
    const pictureRules = entries.some(([key]) => PICTURE_COLUMNS.has(key)) ? await loadPictureRules() : []
    for (const [key, value] of entries) {
      if (!PICTURE_COLUMNS.has(key)) continue
      const problem = pictureUrlProblem(value, pictureRules)
      if (problem) return c.json({ error: `${key}: ${problem}` }, 400)
    }

    const id = c.req.param("id")
    const args: InValue[] = entries.map(([, value]) => {
      if (value === null || value === undefined) return null
      if (typeof value === "boolean") return value ? 1 : 0
      if (typeof value === "object") return JSON.stringify(value)
      if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") return value
      // A symbol or a function cannot have come from JSON, so this is unreachable through the API.
      // It still has to say something rather than be asserted away, and its own text is the least
      // surprising thing to store.
      return String(value)
    })

    const changed = await execute(
      `UPDATE ${CRM_SCHEMA[object].table} SET ${entries.map(([key]) => `"${key}" = ?`).join(", ")} WHERE record_id = ?`,
      [...args, id],
    )
    if (!changed) return c.json({ error: "not found" }, 404)

    const row = await queryOne<Row>(
      `SELECT *, ${CRM_SCHEMA[object].label} AS label FROM ${CRM_SCHEMA[object].table} WHERE record_id = ?`,
      [id],
    )
    return c.json(row)
  })

  /** POST /api/crm/:object/:id/notes — append a note. Authored here, so it gets a local id. */
  app.post("/:object/:id/notes", async c => {
    const object = c.req.param("object")
    if (!isCrmObject(object)) return c.json({ error: `unknown object: ${object}` }, 404)

    const id = c.req.param("id")
    const body = await c.req
      .json<{ title?: string; content?: string }>()
      .catch((): { title?: string; content?: string } => ({}))
    const content = (body.content ?? "").trim()
    if (!content) return c.json({ error: "content required" }, 400)

    const exists = await queryOne<Row>(`SELECT record_id FROM ${CRM_SCHEMA[object].table} WHERE record_id = ?`, [id])
    if (!exists) return c.json({ error: "not found" }, 404)

    const note = {
      id: crypto.randomUUID(),
      title: (body.title ?? "").trim() || new Date().toISOString().slice(0, 10),
      content,
      createdAt: new Date().toISOString(),
    }
    await execute(
      `INSERT INTO note (note_id, parent_object, parent_record_id, title, content_plaintext, created_at)
			 VALUES (?, ?, ?, ?, ?, ?)`,
      [note.id, object, id, note.title, note.content, note.createdAt],
    )

    return c.json(note, 201)
  })

  return app
}
