import { useEffect, useRef } from "react"
import { BASEMAPS } from "../config.ts"
import type { BasemapId, MapInstance } from "../types.ts"

/**
 * Apply a basemap change to the live instance.
 *
 * `setStyle` swaps the style on the map that already exists — it never rebuilds it, so the camera, the
 * controls and the WebGL context all survive. What does not survive is every source and layer added by
 * hand, which is what `styleEpoch` and `useMapLayers` exist to repair.
 *
 * The first run is skipped: the instance was constructed with the default style already applied, and
 * calling `setStyle` with the style it is already showing would throw the layers away for nothing.
 */
export function useBasemap(map: MapInstance | null, basemap: BasemapId): void {
  const appliedRef = useRef<BasemapId | null>(null)

  useEffect(() => {
    if (!map) return
    if (appliedRef.current === null) {
      appliedRef.current = basemap
      return
    }
    if (appliedRef.current === basemap) return

    appliedRef.current = basemap
    map.setStyle(BASEMAPS[basemap].style)
  }, [map, basemap])
}
