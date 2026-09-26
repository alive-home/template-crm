import { useMemo } from "react"
import { useMapCamera, useMapContext } from "#/features/map/index.ts"
import type { MapFeature } from "#/lib/map-types.ts"

/**
 * How many of the filtered accounts are inside the current viewport.
 *
 * **This component is the reason `useMapCamera` is called at a leaf.** `move` fires continuously while
 * panning, so a camera value held in `MapView` would re-render the whole map tree — every layer, the
 * card, the legend — on every frame of every drag. Held here, a drag repaints one chip.
 *
 * It answers the question the map exists for: not "how many companies do we have", which the header
 * already says, but "how many are in the bit of the country I am looking at" — which is what turns a
 * pan across Brabant into a plan for a day of visits.
 */
export function VisibleCount({ features }: { features: MapFeature[] }) {
  const camera = useMapCamera()
  const { map } = useMapContext()

  /*
   * `camera` is a trigger rather than an input, which is why the linter cannot see it being used. The
   * count is read off `map.getBounds()` — the map's own state, which has already moved by the time
   * this runs — and `camera` is the thing that says it moved. Drop it and the number freezes at
   * whatever the first frame said, on a map that keeps panning underneath it.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: camera is the change signal, see above.
  const visible = useMemo(() => {
    if (!map) return 0
    const bounds = map.getBounds()
    return features.filter(feature => bounds.contains(feature.geometry.coordinates)).length
  }, [map, features, camera])

  if (features.length === 0) return null

  return (
    <div className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-md border border-border bg-card/95 px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
      <span className="font-medium text-foreground tabular-nums">{visible}</span> in beeld
      {visible === features.length ? null : <span className="text-muted-foreground/70"> van {features.length}</span>}
    </div>
  )
}
