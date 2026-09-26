import { Search } from "lucide-react"
import { EmptyState, Skeleton } from "#/components/crm/Panel.tsx"
import { ContactBadge } from "#/components/market/ContactBadge.tsx"
import { Input } from "#/components/ui/input.tsx"
import type { ClusterId, MarketCaseRow, MarketCluster, MarketRoute, RouteId } from "#/lib/market-types.ts"
import { cn } from "#/lib/utils.ts"

/**
 * De index links: welk bedrijf, en hoe het contact daar is gelegd.
 *
 * Twee filters op één rij zou de kolom vol zetten, dus het knelpunt filtert en het kanaal ook, maar
 * de tellingen volgen allebei de zoekopdracht. Een chip die dertien zegt naast een lege lijst zijn
 * twee getallen die elkaar tegenspreken, en de lezer kan niet zien welke van de twee liegt.
 *
 * De regel onder een bedrijf toonde het onderwerp van een gereconstrueerde mail. Die mails waren
 * verzonnen en zijn weg, dus staat er nu de sector: korter, en het is waar.
 */

type Props = {
  cases: MarketCaseRow[]
  clusters: MarketCluster[]
  routes: MarketRoute[]
  warning?: string
  /** Wanneer en waar de caselijst is gelezen. Komt uit de CRM; `null` als geen record het draagt. */
  readOn: string | null
  readFrom: string | null
  shown: MarketCaseRow[]
  found: MarketCaseRow[]
  isLoading: boolean
  q: string
  onQ: (value: string) => void
  cluster: ClusterId | "all"
  onCluster: (value: ClusterId | "all") => void
  route: RouteId | "all"
  onRoute: (value: RouteId | "all") => void
  selected: string | null
  onSelect: (id: string) => void
}

const chip = (active: boolean, empty: boolean) =>
  cn(
    "rounded border px-1.5 py-0.5 text-[11px] transition-colors",
    empty && "opacity-40",
    active ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-muted",
  )

export function CaseIndex(props: Props) {
  const { cases, clusters, routes, warning, readOn, readFrom, shown, found, isLoading, q, cluster, route, selected } =
    props

  // Elke groep telt binnen de selectie van de andere, zodat een chip nooit een aantal belooft dat na
  // het klikken nul blijkt. De volgorde ligt vast: chips die zich tijdens het typen herschikken
  // laten de lijst onder de cursor wegspringen.
  const inRoute = found.filter(item => route === "all" || item.route === route)
  const inCluster = found.filter(item => cluster === "all" || item.cluster === cluster)

  const clusterCounts = clusters.map(entry => ({
    ...entry,
    count: inRoute.filter(item => item.cluster === entry.id).length,
  }))

  const routeCounts = routes.map(entry => ({
    ...entry,
    count: inCluster.filter(item => item.route === entry.id).length,
  }))

  return (
    <aside className="flex w-[19rem] shrink-0 flex-col border-border border-r">
      <div className="border-border border-b px-4 py-3">
        <h1 className="font-semibold text-[15px] text-foreground">Market research</h1>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {cases.length} opdrachten die al zijn gedaan
          {readFrom ? `, uit de cases die ${readFrom} zelf publiceert` : ""}.{readOn ? ` Gelezen op ${readOn}.` : ""}
        </p>
      </div>

      <div className="flex h-10 items-center gap-2 border-border border-b px-3">
        <Search size={13} className="shrink-0 text-muted-foreground" />
        <Input
          value={q}
          onChange={event => props.onQ(event.target.value)}
          placeholder="Zoek bedrijf of knelpunt"
          className="h-7 border-0 bg-transparent px-0 text-[12px] shadow-none focus-visible:ring-0"
        />
      </div>

      {warning ? (
        <div className="border-border border-b px-3 py-2 text-[11px] text-muted-foreground">{warning}</div>
      ) : null}

      <div className="border-border border-b px-3 py-2">
        <div className="pb-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">Eerste contact</div>
        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={() => props.onRoute("all")} className={chip(route === "all", false)}>
            Alles ({inCluster.length})
          </button>
          {routeCounts.map(entry => (
            <button
              key={entry.id}
              type="button"
              disabled={entry.count === 0}
              onClick={() => props.onRoute(route === entry.id ? "all" : entry.id)}
              className={chip(route === entry.id, entry.count === 0)}
            >
              {entry.channel.label} ({entry.count})
            </button>
          ))}
        </div>
      </div>

      <div className="border-border border-b px-3 py-2">
        <div className="pb-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">Knelpunt</div>
        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={() => props.onCluster("all")} className={chip(cluster === "all", false)}>
            Alles ({inRoute.length})
          </button>
          {clusterCounts.map(entry => (
            <button
              key={entry.id}
              type="button"
              disabled={entry.count === 0}
              onClick={() => props.onCluster(cluster === entry.id ? "all" : entry.id)}
              className={chip(cluster === entry.id, entry.count === 0)}
            >
              {entry.label} ({entry.count})
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2, 3, 4, 5, 6, 7].map(row => (
              <Skeleton key={row} className="h-9 w-full" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <EmptyState>Niets gevonden.</EmptyState>
        ) : (
          shown.map(item => {
            const itemRoute = routes.find(route => route.id === item.route)
            return (
              <button
                key={item.projectId}
                type="button"
                onClick={() => props.onSelect(item.projectId)}
                className={cn(
                  "block w-full border-border border-b px-3 py-2.5 text-left",
                  item.projectId === selected ? "bg-muted" : "hover:bg-muted/50",
                )}
              >
                <span className="block truncate font-medium text-[13px] text-foreground">{item.company}</span>
                <span className="mt-1 flex items-center gap-1.5">
                  {itemRoute ? <ContactBadge channel={itemRoute.channel} size="sm" /> : null}
                  <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{item.sector}</span>
                </span>
              </button>
            )
          })
        )}
      </div>
    </aside>
  )
}

export default CaseIndex
