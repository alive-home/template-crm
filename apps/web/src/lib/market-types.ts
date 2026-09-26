/**
 * The market API contract: CRM cases plus the commercial taxonomy Turso applies to them.
 *
 * The cluster and route sets used to live in the client as literals. They are application data now,
 * so their ids are strings and every label, explanation and rule arrives with the cases that use it.
 */

export type ClusterId = string
export type RouteId = string

export type MarketCluster = { id: ClusterId; label: string; what: string }

export type ContactChannel = {
  id: string
  label: string
  icon: string
  what: string
  inbound: boolean
}

export type MarketRoute = {
  id: RouteId
  label: string
  why: string
  move: string
  channel: ContactChannel
}

/** One delivered project at a case company, from `GET /api/crm/market`. */
export type MarketCaseRow = {
  companyId: string
  company: string
  sector: string
  /** Resolved taxonomy id, or null when the CRM's label is not in the taxonomy. */
  cluster: ClusterId | null
  /** The bottleneck in the CRM's own words. Empty when the record does not carry one. */
  clusterLabel: string
  /** First matching database rule, the fallback route, or null when there are no rules. */
  route: RouteId | null
  projectId: string
  project: string
  slug: string
  stack: string | null
  problem?: string
  work?: string
  outcome?: string
  who?: string
  quote?: string
  source?: string
}

/** `GET /api/crm/market` — cases, taxonomy, and where and when the source list was read. */
export type MarketCases = {
  cases: MarketCaseRow[]
  clusters: MarketCluster[]
  routes: MarketRoute[]
  readOn: string | null
  readFrom: string | null
  warning?: string
}
