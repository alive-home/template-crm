import { Search } from "lucide-react"
import { useMemo, useState } from "react"
import { Input } from "#/components/ui/input.tsx"
import { AccountCard } from "#/features/accounts-map/AccountCard.tsx"
import { AccountsLayer } from "#/features/accounts-map/AccountsLayer.tsx"
import { MapLegend } from "#/features/accounts-map/MapLegend.tsx"
import { VisibleCount } from "#/features/accounts-map/VisibleCount.tsx"
import { BasemapSwitcher, MapView } from "#/features/map/index.ts"
import { useCrmMap } from "#/hooks/use-crm.ts"
import type { MapCompanyProperties, MapFeature, MapFeed } from "#/lib/map-types.ts"
import { cn } from "#/lib/utils.ts"

/**
 * The accounts map.
 *
 * The record grid answers "what do we hold about this company". This answers a question it cannot:
 * **who else is near the one I am already talking to.** That matters here because the motion is Dutch
 * and regional — a trip to Eindhoven that visits one prospect and misses the four around it is the
 * kind of thing a list will never tell you.
 *
 * The map is a viewport-filling surface with its chrome floating over it, so the page owns its own
 * layout rather than sitting inside a gutter, the same way the record grid does.
 */

const BANDS = ["Alles", "P0", "P1", "P2", "P3", "Ongescoord"] as const
type Band = (typeof BANDS)[number]

function matches(feature: MapFeature, filter: Band, q: string): boolean {
  const p = feature.properties

  if (filter !== "Alles") {
    if (filter === "Ongescoord" ? p.band !== 9 : p.band !== Number(filter.slice(1))) return false
  }

  if (!q) return true
  const haystack = [p.name, p.domain, p.locality, p.stage].filter(Boolean).join(" ").toLowerCase()
  return haystack.includes(q.toLowerCase())
}

export function CrmMap() {
  const { data, isLoading, error } = useCrmMap()
  const [filter, setFilter] = useState<Band>("Alles")
  const [q, setQ] = useState("")
  const [selected, setSelected] = useState<MapCompanyProperties | null>(null)

  /**
   * Filtering rebuilds the collection instead of calling `setFilter` on the layer, and that is because
   * of clustering.
   *
   * A layer filter hides features after they have been clustered, so the circles would keep the counts
   * of the unfiltered set: filter to P0 and Utrecht still reads "13" while showing one dot. The cluster
   * totals are the whole point of a cluster, so the filter has to happen before the source sees the
   * data. At 148 features that costs nothing.
   */
  const filtered = useMemo<MapFeed | undefined>(() => {
    if (!data) return undefined
    return { ...data, features: data.features.filter(f => matches(f, filter, q)) }
  }, [data, filter, q])

  const shown = filtered?.features.length ?? 0
  const isFiltered = filter !== "Alles" || q.length > 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-3 px-6 pt-5 pb-3">
        <div className="min-w-0">
          <h1 className="font-semibold text-[19px] text-foreground tracking-tight">Map</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {isLoading
              ? "Bedrijven laden"
              : error
                ? "De kaart kon niet geladen worden"
                : isFiltered
                  ? `${shown} van ${data?.meta.placed ?? 0} bedrijven op de kaart`
                  : "Klik een stip voor het bedrijf, een cluster om in te zoomen"}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative w-56">
            <Search size={14} className="-translate-y-1/2 absolute top-1/2 left-2.5 text-muted-foreground" />
            <Input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Zoek bedrijf, plaats…"
              className="h-8 pl-8 text-[13px]"
            />
          </div>

          <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
            {BANDS.map(option => (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                className={cn(
                  "rounded px-2 py-1 text-[11.5px] transition-colors",
                  filter === option
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 border-border border-t">
        <MapView>
          <AccountsLayer data={filtered} selectedId={selected?.id ?? null} onSelect={setSelected} />
          <AccountCard account={selected} onClose={() => setSelected(null)} />
          <MapLegend meta={data?.meta} />
          {/*
           * Reads the camera, so it is deliberately its own component: held here, a pan re-renders one
           * chip instead of every layer on the map. See `useMapCamera`.
           */}
          <VisibleCount features={filtered?.features ?? []} />
          {/* One job per corner: card top right, basemap top left, legend and zoom at the bottom. */}
          <BasemapSwitcher className="absolute top-3 left-3 z-10" />
        </MapView>
      </div>
    </div>
  )
}

export default CrmMap
