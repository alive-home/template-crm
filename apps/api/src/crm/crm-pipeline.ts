import { Hono } from "hono"
import { query } from "./turso"

/**
 * The pipeline board: every deal as a card, grouped by the stage it is in.
 *
 * This is a view over `deals`, not a second list. The stage a deal sits in is a real column with a
 * real status type in the catalog, so moving a card is an ordinary `PATCH /api/crm/deals/:id` on
 * `stage` and the board needs no state of its own.
 *
 * It is a dedicated endpoint rather than the generic `/crm/:object` read for one reason: a deal has
 * 60 columns and a card shows six of them. Sending every full record to draw the cards is most of a
 * megabyte of prose the board never renders.
 *
 * **The card only shows fields that are actually filled in.** `value` is null on nearly every deal and
 * `committed_eur` exists only on the ones that were won, so the board shows money there and nothing
 * at all on the rest. A pipeline that renders a value on every card teaches the reader to
 * believe a number that was never quoted, which is the same failure that once filled this
 * CRM with invented deal sizes.
 */

type DealRow = {
  id: string
  name: string
  stage: string | null
  company_id: string | null
  company: string | null
  priority: string | null
  readiness: string | null
  score: number | null
  location: string | null
  next_step: string | null
  committed_eur: number | null
  outstanding_eur: number | null
}

type StageRow = { title: string }

const STAGE_WARNING = "The pipeline stages have not been seeded. Run bun apps/api/scripts/seed-turso.ts."

/**
 * Priority band as a sort key. `P0` first, anything unscored last.
 *
 * The column has no manual ordering — there is no `sort_order` on this table — so the vertical axis
 * is the ranking the CRM already holds: the band a human set, then the time-saved score. It means
 * dragging a card up and down inside a column is deliberately inert, and the page says so.
 */
const BAND = `CASE
  WHEN d.prospect_priority LIKE 'P0%' THEN 0
  WHEN d.prospect_priority LIKE 'P1%' THEN 1
  WHEN d.prospect_priority LIKE 'P2%' THEN 2
  WHEN d.prospect_priority LIKE 'P3%' THEN 3
  ELSE 9 END`

export function crmPipelineRoutes(): Hono {
  const app = new Hono()

  app.get("/pipeline", async c => {
    const dealsPromise = query<DealRow>(
      `SELECT d.record_id AS id, d.name, d.stage,
              d.associated_company_record_id AS company_id, co.name AS company,
              d.prospect_priority AS priority, d.outreach_readiness AS readiness,
              d.alive_time_saved_score AS score, d.prospect_location AS location,
              d.next_step, d.committed_eur, d.outstanding_eur
         FROM deals d
         LEFT JOIN companies co ON co.record_id = d.associated_company_record_id
        ORDER BY ${BAND}, COALESCE(d.alive_time_saved_score, -1) DESC, d.name`,
    )
    const stagesPromise = query<StageRow>("SELECT title FROM pipeline_stage ORDER BY position, title").catch(error => {
      const message = error instanceof Error ? error.message : String(error)
      if (/no such table/i.test(message)) return []
      throw error
    })
    const [deals, stageRows] = await Promise.all([dealsPromise, stagesPromise])

    // Columns are the stored order, plus any stage the data actually uses that is not in it.
    // A stage nobody anticipated must still get a column: a card with nowhere to go is a record
    // the board silently hides, and this page is meant to be the whole pipeline.
    const used = new Set(deals.map(d => d.stage ?? "").filter(Boolean))
    const configured = stageRows.map(row => row.title)
    const known = new Set(configured)
    const extra = [...used].filter(stage => !known.has(stage)).sort()
    const stages = configured.length ? [...configured, ...extra] : [...used].sort()

    return c.json({
      stages,
      // Deals with no stage at all would otherwise be invisible; they get their own column.
      unstaged: deals.filter(d => !d.stage).length,
      deals: deals.map(d => ({
        id: d.id,
        name: d.name,
        stage: d.stage,
        company: d.company_id ? { id: d.company_id, label: d.company } : null,
        priority: d.priority,
        readiness: d.readiness,
        score: d.score,
        location: d.location,
        nextStep: d.next_step,
        committedEur: d.committed_eur,
        outstandingEur: d.outstanding_eur,
      })),
      ...(configured.length ? {} : { warning: STAGE_WARNING }),
    })
  })

  return app
}
