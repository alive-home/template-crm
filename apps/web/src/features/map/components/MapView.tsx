import { useMemo } from "react"
import { cn } from "#/lib/utils.ts"
import { MapContext } from "../context.ts"
import { useBasemap } from "../hooks/useBasemap.ts"
import { useMapInstance } from "../hooks/useMapInstance.ts"
import type { MapContextValue } from "../types.ts"
import { MapLoadingOverlay } from "./MapLoadingOverlay.tsx"
import "maplibre-gl/dist/maplibre-gl.css"
import "../styles/map.css"

/**
 * The map container. It provides a context and renders whatever it is given.
 *
 * Nothing in this feature knows what a company is — things that go *on* the map are separate features
 * that mount as children:
 *
 * ```tsx
 * <MapView>
 *   <AccountsLayer />
 *   <AccountCard />
 * </MapView>
 * ```
 *
 * A layer component returns `null`. It renders nothing and exists purely to run an effect against the
 * instance, which is what lets map layers be expressed in JSX — mounted conditionally, each with its
 * own data fetching and hooks.
 */
export function MapView({ children, className }: { children?: React.ReactNode; className?: string }) {
  const { containerRef, map, ready, styleEpoch, basemap, setBasemap } = useMapInstance()

  useBasemap(map, basemap)

  const value = useMemo<MapContextValue>(
    () => ({ map, ready, styleEpoch, basemap, setBasemap }),
    [map, ready, styleEpoch, basemap, setBasemap],
  )

  return (
    <MapContext.Provider value={value}>
      <div className={cn("relative h-full w-full overflow-hidden", className)}>
        {/*
         * maplibre-gl.css sets `.maplibregl-map { position: relative }`, which beats Tailwind's
         * `absolute` on specificity. So the canvas is sized with h/w and the wrapper above it is the
         * positioned element that all the chrome hangs off.
         */}
        <div ref={containerRef} className="h-full w-full" />
        {/* Children render above the canvas; each one decides its own pointer-events. */}
        {map ? children : null}
        <MapLoadingOverlay ready={ready} />
      </div>
    </MapContext.Provider>
  )
}
