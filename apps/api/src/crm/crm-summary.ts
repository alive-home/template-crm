import { Hono } from "hono"
import { CRM_OBJECTS, CRM_SCHEMA } from "./crm"
import { text } from "./row"
import { query, queryOne } from "./turso"

/**
 * The overview aggregate.
 *
 * Split out of `crm-routes.ts` because it is the one endpoint that reads across every table, and
 * because that file was already at its length limit. Everything here is counted in SQL rather than
 * in the browser: the alternative is shipping 300 deal rows to the client so it can add up a column.
 *
 * Nothing is invented. A stage with no deals does not appear, a null money column contributes zero
 * rather than being guessed at, and every figure is a plain COUNT or SUM over the mirrored export.
 */

type Row = Record<string, unknown>

/** Top N for the breakdown lists. Long tails are summarised as "other", never silently dropped. */
const TOP_N = 6

const num = (value: unknown): number => (typeof value === "number" ? value : Number(value ?? 0) || 0)

/**
 * Tally one deals column, biggest first.
 *
 * Rows with no value land in their own bucket under `blank` rather than being filtered out — an
 * unset stage is a real state of the pipeline, and dropping it would make the counts stop adding up
 * to the number of deals.
 */
async function breakdown(column: string, blank: string, limit = TOP_N): Promise<{ name: string; count: number }[]> {
  const rows = await query<{ name: string | null; n: number }>(
    `SELECT "${column}" AS name, COUNT(*) AS n FROM deals GROUP BY "${column}" ORDER BY n DESC`,
  )
  const mapped = rows.map(row => ({ name: (row.name ?? "").trim() || blank, count: num(row.n) }))
  if (mapped.length <= limit) return mapped

  const head = mapped.slice(0, limit)
  const tail = mapped.slice(limit).reduce((total, row) => total + row.count, 0)
  return [...head, { name: `Other (${mapped.length - limit})`, count: tail }]
}

export function crmSummaryRoutes(): Hono {
  const app = new Hono()

  app.get("/summary", async c => {
    const [counts, totals, pipeline, money, stages, priorities, readiness, notes, upcoming] = await Promise.all([
      query<{ object: string; n: number }>(
        CRM_OBJECTS.map(o => `SELECT '${o}' AS object, COUNT(*) AS n FROM ${CRM_SCHEMA[o].table}`).join(" UNION ALL "),
      ),
      queryOne<Row>(
        `SELECT (SELECT COUNT(*) FROM note) AS notes, (SELECT COUNT(*) FROM task) AS tasks,
				        (SELECT COUNT(*) FROM task WHERE is_completed = 0) AS open_tasks,
				        (SELECT COUNT(*) FROM task WHERE is_completed = 0 AND deadline_at IS NOT NULL
				          AND deadline_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) AS overdue_tasks`,
      ),
      // Deal coverage: how much of the pipeline has been worked, rather than how much it is worth.
      queryOne<Row>(
        `SELECT COUNT(*) AS deals,
				        SUM(CASE WHEN next_step IS NOT NULL AND TRIM(next_step) <> '' THEN 1 ELSE 0 END) AS with_next_step,
				        SUM(CASE WHEN associated_company_record_id IS NOT NULL THEN 1 ELSE 0 END) AS with_company
				 FROM deals`,
      ),
      queryOne<Row>(
        `SELECT COALESCE(SUM(committed_eur), 0) AS committed, COALESCE(SUM(paid_eur), 0) AS paid,
				        COALESCE(SUM(outstanding_eur), 0) AS outstanding FROM deals`,
      ),
      query<{ stage: string | null; n: number; committed: number }>(
        `SELECT stage, COUNT(*) AS n, COALESCE(SUM(committed_eur), 0) AS committed
				 FROM deals GROUP BY stage ORDER BY n DESC`,
      ),
      breakdown("prospect_priority", "Unscored"),
      // Readiness, not segment: segments are near-unique per deal, so a breakdown of them is a list
      // of deals wearing a chart's clothes.
      breakdown("outreach_readiness", "Not assessed"),
      // Recent notes need their parent's name, and the parent can be any of the seven objects.
      query<Row>(
        `WITH record_index AS (${CRM_OBJECTS.map(
          o => `SELECT record_id, '${o}' AS object, ${CRM_SCHEMA[o].label} AS label FROM ${CRM_SCHEMA[o].table}`,
        ).join(" UNION ALL ")})
				 SELECT note.note_id, note.title, note.created_at, note.parent_object, note.parent_record_id,
				        record_index.label AS parent_label
				 FROM note
				 LEFT JOIN record_index ON record_index.record_id = note.parent_record_id
				 ORDER BY note.created_at DESC LIMIT 8`,
      ),
      query<Row>(
        `SELECT task_id, content_plaintext, deadline_at FROM task
				 WHERE is_completed = 0 AND deadline_at IS NOT NULL ORDER BY deadline_at LIMIT 5`,
      ),
    ])

    return c.json({
      source: "turso",
      objects: CRM_OBJECTS.map(object => ({
        object,
        singular: CRM_SCHEMA[object].singular,
        count: counts.find(row => row.object === object)?.n ?? 0,
      })),
      notes: num(totals?.notes),
      tasks: num(totals?.tasks),
      openTasks: num(totals?.open_tasks),
      overdueTasks: num(totals?.overdue_tasks),
      coverage: {
        deals: num(pipeline?.deals),
        withNextStep: num(pipeline?.with_next_step),
        withCompany: num(pipeline?.with_company),
      },
      revenue: {
        committed: num(money?.committed),
        paid: num(money?.paid),
        outstanding: num(money?.outstanding),
      },
      stages: stages.map(row => ({
        stage: (row.stage ?? "").trim() || "No stage",
        count: num(row.n),
        committed: num(row.committed),
      })),
      priorities,
      readiness,
      recentNotes: notes.map(row => ({
        id: String(row.note_id),
        title: text(row.title),
        createdAt: text(row.created_at),
        record: row.parent_record_id
          ? { id: String(row.parent_record_id), object: row.parent_object, label: row.parent_label ?? null }
          : null,
      })),
      upcomingTasks: upcoming.map(row => ({
        id: String(row.task_id),
        content: text(row.content_plaintext),
        deadlineAt: text(row.deadline_at),
      })),
    })
  })

  return app
}
