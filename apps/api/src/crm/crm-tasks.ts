import { Hono } from "hono"
import { RECORD_INDEX, type Row } from "./crm-records"
import { execute, query } from "./turso"

/**
 * Tasks and notes, addressed by their own id.
 *
 * Everything else in the API hangs off an object slug. These three do not: a task belongs to whoever
 * it links to, or to nobody, and a note is deleted by its id from wherever it is being read. Mounted
 * ahead of `/:object` so the literal paths win.
 */
export function crmTaskRoutes(): Hono {
  const app = new Hono()

  /** GET /api/crm/tasks — every task, newest first. Most are linked to no record at all. */
  app.get("/tasks", async c => {
    const openOnly = c.req.query("open") === "1"
    const rows = await query<Row>(
      `WITH record_index AS (${RECORD_INDEX})
			 SELECT task.task_id, task.content_plaintext, task.is_completed, task.deadline_at, task.created_at,
			        link.target_record_id, record_index.object AS linked_object, record_index.label AS linked_label
			 FROM task
			 LEFT JOIN task_linked_record link ON link.task_id = task.task_id
			 LEFT JOIN record_index ON record_index.record_id = link.target_record_id
			 ${openOnly ? "WHERE task.is_completed = 0" : ""}
			 ORDER BY task.created_at DESC`,
    )

    return c.json(
      rows.map(row => ({
        id: row.task_id,
        content: row.content_plaintext,
        isCompleted: row.is_completed === 1,
        deadlineAt: row.deadline_at,
        createdAt: row.created_at,
        record: row.target_record_id
          ? { id: row.target_record_id, object: row.linked_object, label: row.linked_label }
          : null,
      })),
    )
  })

  /** PATCH /api/crm/tasks/:id — toggle completion, stamping completed_at to match. */
  app.patch("/tasks/:id", async c => {
    const body = await c.req.json<{ isCompleted?: boolean }>().catch((): { isCompleted?: boolean } => ({}))
    const done = body.isCompleted === true
    const changed = await execute("UPDATE task SET is_completed = ?, completed_at = ? WHERE task_id = ?", [
      done ? 1 : 0,
      done ? new Date().toISOString() : null,
      c.req.param("id"),
    ])
    if (!changed) return c.json({ error: "not found" }, 404)
    return c.json({ id: c.req.param("id"), isCompleted: done })
  })

  /** DELETE /api/crm/notes/:noteId — remove a note. */
  app.delete("/notes/:noteId", async c => {
    const changed = await execute("DELETE FROM note WHERE note_id = ?", [c.req.param("noteId")])
    if (!changed) return c.json({ error: "not found" }, 404)
    return c.json({ ok: true })
  })

  return app
}
