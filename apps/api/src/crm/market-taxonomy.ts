/**
 * The commercial market taxonomy belongs to the CRM database, not to the application bundle.
 * This reader turns the ordered rows into one request-scoped resolver so rule regexes are compiled
 * once and every case in the response is classified against the same snapshot.
 */
import { query } from "./turso"

export type MarketCluster = { id: string; label: string; what: string }
export type MarketChannel = { id: string; label: string; icon: string; what: string; inbound: boolean }
export type MarketRoute = { id: string; label: string; why: string; move: string; channel: MarketChannel }

type ClusterRow = { cluster_id: string; label: string; what: string }
type RouteRow = {
  route_id: string
  label: string
  why: string
  move: string
  channel_id: string
  channel_label: string
  channel_icon: string
  channel_what: string
  inbound: number
  is_fallback: number
}
type RuleRow = {
  rule_id: string
  route_id: string
  field: string
  pattern: string
  flags: string
}

type CaseFields = { client: string; sector: string; who: string }
type CompiledRule = { routeId: string; field: "client" | "sector" | "who"; pattern: RegExp }

export type MarketTaxonomy = {
  clusters: MarketCluster[]
  routes: MarketRoute[]
  clusterId(label: string): string | null
  routeId(item: CaseFields): string | null
  warnings: string[]
}

const SEED_WARNING = "De markttaxonomie is nog niet geladen. Draai bun apps/api/scripts/seed-turso.ts."

function missingTable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /no such table/i.test(message)
}

/** Read and compile the taxonomy once for one market request. */
export async function readMarketTaxonomy(): Promise<MarketTaxonomy> {
  let rows: [ClusterRow[], RouteRow[], RuleRow[]]
  try {
    rows = await Promise.all([
      query<ClusterRow>("SELECT cluster_id, label, what FROM market_cluster ORDER BY position, label"),
      query<RouteRow>(
        `SELECT route_id, label, why, move, channel_id, channel_label, channel_icon, channel_what,
                inbound, is_fallback FROM market_route ORDER BY position, label`,
      ),
      query<RuleRow>(
        "SELECT rule_id, route_id, field, pattern, flags FROM market_route_rule ORDER BY position, rule_id",
      ),
    ])
  } catch (error) {
    // An unmigrated playbook and a broken database are different states. Only the former degrades.
    if (!missingTable(error)) throw error
    return emptyTaxonomy(SEED_WARNING)
  }

  const [clusterRows, routeRows, ruleRows] = rows
  if (clusterRows.length === 0 || routeRows.length === 0) {
    return emptyTaxonomy(SEED_WARNING)
  }

  const clusters = clusterRows.map(row => ({ id: row.cluster_id, label: row.label, what: row.what }))
  const routes = routeRows.map(row => ({
    id: row.route_id,
    label: row.label,
    why: row.why,
    move: row.move,
    channel: {
      id: row.channel_id,
      label: row.channel_label,
      icon: row.channel_icon,
      what: row.channel_what,
      inbound: row.inbound === 1,
    },
  }))
  const clusterByLabel = new Map(clusters.map(cluster => [normaliseLabel(cluster.label), cluster.id]))
  const fallback = routeRows.find(route => route.is_fallback === 1)?.route_id ?? null
  const warnings = ruleRows.length === 0 ? [SEED_WARNING] : []
  const compiled: CompiledRule[] = []

  for (const rule of ruleRows) {
    if (rule.field !== "client" && rule.field !== "sector" && rule.field !== "who") {
      warnings.push(`Marktregel '${rule.rule_id}' is overgeslagen: onbekend veld '${rule.field}'`)
      continue
    }
    try {
      compiled.push({ routeId: rule.route_id, field: rule.field, pattern: new RegExp(rule.pattern, rule.flags) })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      warnings.push(`Marktregel '${rule.rule_id}' is overgeslagen: ${reason}`)
    }
  }

  return {
    clusters,
    routes,
    clusterId: label => clusterByLabel.get(normaliseLabel(label)) ?? null,
    routeId: item => {
      // No rows means no decision. Invalid rows are still named above and the fallback remains valid.
      if (ruleRows.length === 0) return null
      for (const rule of compiled) {
        const value = rule.field === "client" ? item.client : rule.field === "sector" ? item.sector : item.who
        rule.pattern.lastIndex = 0
        if (rule.pattern.test(value)) return rule.routeId
      }
      return fallback
    },
    warnings,
  }
}

function normaliseLabel(label: string): string {
  return label.trim().replace(/\.$/, "")
}

function emptyTaxonomy(warning: string): MarketTaxonomy {
  return {
    clusters: [],
    routes: [],
    clusterId: () => null,
    routeId: () => null,
    warnings: [warning],
  }
}
