import { useEffect, useRef } from "react"
import { useMapContext } from "../context.ts"
import type { MapLayerSetup } from "../types.ts"

/**
 * Run a layer's setup against the map, and run it again after every basemap switch.
 *
 * `map.setStyle()` discards every source and layer that was added by hand. Switch from Light to Dark
 * and all your pins disappear, with no error anywhere — which is the single most likely bug to ship in
 * a map like this. `styleEpoch` bumps on each `style.load`, so this effect re-runs and the layers come
 * back.
 *
 * Two details that are easy to get wrong:
 *
 * - **The setup lives in a ref.** Callers pass an inline arrow function, which is a new identity on
 *   every render; in the dependency array it would tear down and re-add the layers continuously.
 * - **Epoch 0 means no style yet**, and `addSource` throws before the style is loaded. So the effect
 *   waits rather than guarding inside every caller.
 */
export function useMapLayers(setup: MapLayerSetup): void {
  const { map, styleEpoch } = useMapContext()
  const setupRef = useRef(setup)

  useEffect(() => {
    setupRef.current = setup
  }, [setup])

  useEffect(() => {
    if (!map || styleEpoch === 0) return
    return setupRef.current(map) ?? undefined
  }, [map, styleEpoch])
}
