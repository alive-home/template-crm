import { useEffect, useMemo, useState } from "react"
import { Skeleton } from "#/components/crm/Panel.tsx"
import { CaseDetail } from "#/components/market/CaseDetail.tsx"
import { CaseIndex } from "#/components/market/CaseIndex.tsx"
import { useMarketCases } from "#/hooks/use-crm.ts"
import type { ClusterId, RouteId } from "#/lib/market-types.ts"

/**
 * Market research: waar de kopers vastlopen, en hoe het contact daar begon.
 *
 * De pagina leest als mail en niet als tabel. Een tabel liet je zinnen vergelijken die
 * je alleen aan het scannen was; de vraag hier is er een per bedrijf.
 *
 * De pagina houdt geen lijst bij en leest ook geen bestand meer: bedrijf, opdracht en knelpunt komen
 * allemaal uit de CRM (`/api/crm/market`). Wat hier staat is de toestand van het scherm, en wat in
 * `lib/market` staat is onze lezing: de indeling en de regel, nooit een bedrijf.
 */
export function Research() {
  const [cluster, setCluster] = useState<ClusterId | "all">("all")
  const [route, setRoute] = useState<RouteId | "all">("all")
  const [q, setQ] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const { data, isLoading } = useMarketCases()
  // Elke lijst wordt hier één keer afgedekt. De taxonomie komt uit een aparte tabel: een database
  // zonder seed, of een server die de tabellen nog niet kent, antwoordt zonder `clusters` en
  // `routes`. Dat is een lege lijst, geen kapotte pagina.
  const cases = useMemo(() => data?.cases ?? [], [data])
  const clusters = useMemo(() => data?.clusters ?? [], [data])
  const routes = useMemo(() => data?.routes ?? [], [data])

  const found = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return cases.filter(
      item =>
        !needle ||
        `${item.company} ${item.sector} ${item.problem} ${item.work} ${item.who}`.toLowerCase().includes(needle),
    )
  }, [cases, q])

  const shown = useMemo(
    () =>
      found.filter(
        item => (cluster === "all" || item.cluster === cluster) && (route === "all" || item.route === route),
      ),
    [found, cluster, route],
  )

  // De pane toont altijd iets: een filter die de selectie leeggooit zou het halve scherm leeg laten
  // terwijl de lijst ernaast vol staat.
  useEffect(() => {
    const first = shown[0]
    if (first && !shown.some(item => item.projectId === selected)) setSelected(first.projectId)
  }, [shown, selected])

  const current = shown.find(item => item.projectId === selected)

  return (
    <div className="flex min-h-0 flex-1">
      <CaseIndex
        cases={cases}
        clusters={clusters}
        routes={routes}
        warning={data?.warning}
        readOn={data?.readOn ?? null}
        readFrom={data?.readFrom ?? null}
        shown={shown}
        found={found}
        isLoading={isLoading}
        q={q}
        onQ={setQ}
        cluster={cluster}
        onCluster={setCluster}
        route={route}
        onRoute={setRoute}
        selected={selected}
        onSelect={setSelected}
      />

      <div className="min-w-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-3 p-8">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : current ? (
          <CaseDetail item={current} route={routes.find(entry => entry.id === current.route) ?? null} />
        ) : (
          <div className="flex h-full items-center justify-center px-8 text-center">
            <p className="max-w-sm text-[13px] text-muted-foreground">
              Geen bedrijf dat op deze combinatie past. Pas de zoekopdracht aan of kies een ander filter.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default Research
