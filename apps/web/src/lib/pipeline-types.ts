/**
 * What `/api/crm/pipeline` returns.
 *
 * Its own file rather than a section of `crm-types.ts` for the same reason `map-types.ts` is one:
 * that file is at the 300-line cap, and this is a separate seam. Everything here describes one
 * endpoint and the board that reads it.
 */

/** One card on the pipeline board. A thin projection of a deal, not the whole record. */
export type PipelineDeal = {
  id: string
  name: string
  stage: string | null
  company: { id: string; label: string | null } | null
  priority: string | null
  readiness: string | null
  score: number | null
  location: string | null
  nextStep: string | null
  committedEur: number | null
  outstandingEur: number | null
}

export type PipelineFeed = { stages: string[]; unstaged: number; deals: PipelineDeal[]; warning?: string }
