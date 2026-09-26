import { MapLibreMap, NavigationControl } from "maplibre-gl"
import { useEffect, useRef, useState } from "react"
import { BASEMAPS, DEFAULT_BASEMAP, DEFAULT_VIEW, MAX_ZOOM, MIN_ZOOM, READY_FAILSAFE_MS } from "../config.ts"
import "../lib/worker.ts"
import type { BasemapId, MapInstance } from "../types.ts"

/**
 * Build the map once, and keep it out of React state.
 *
 * This is the structural decision the whole feature rests on. A MapLibre instance is a mutable WebGL
 * object with its own render loop; if React owns it, every state change is a chance to tear down and
 * rebuild a GPU context. So the instance lives in a ref, and the single `setMap` exists only so
 * children can read it off context the frame after it is constructed.
 *
 * **The effect's dependency array is empty, permanently.** If you ever find yourself adding a
 * dependency here, you are about to destroy and rebuild the map on a prop change. Style switching
 * belongs in `useBasemap`, which calls `setStyle` on the live instance instead.
 */
export function useMapInstance() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const instanceRef = useRef<MapInstance | null>(null)
  const [map, setMap] = useState<MapInstance | null>(null)
  const [ready, setReady] = useState(false)
  const [styleEpoch, setStyleEpoch] = useState(0)
  const [basemap, setBasemap] = useState<BasemapId>(DEFAULT_BASEMAP)

  useEffect(() => {
    const container = containerRef.current
    // The second guard is for StrictMode, which runs this effect twice in development.
    if (!container || instanceRef.current) return

    const instance = new MapLibreMap({
      container,
      style: BASEMAPS[DEFAULT_BASEMAP].style,
      center: [DEFAULT_VIEW.lng, DEFAULT_VIEW.lat],
      zoom: DEFAULT_VIEW.zoom,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      /*
       * Keep it flat. A tilted, rotated map is a demo feature: a user who two-finger-twists a trackpad
       * by accident ends up at a 47 degree bearing with no idea what happened or how to undo it. With
       * rotation gone there is also no compass worth showing.
       */
      dragRotate: false,
      pitchWithRotate: false,
      // Attribution is a licence condition of the tiles, not a nicety. Compact keeps it to an "i".
      attributionControl: { compact: true },
    })

    instance.touchZoomRotate.disableRotation()
    /*
     * Bottom right, above the attribution, because the top right is where a detail card belongs — it is
     * the corner furthest from the sidebar, so a card there covers the least map. With rotation
     * disabled there is no compass to show either, so this is two small buttons.
     */
    instance.addControl(new NavigationControl({ showCompass: false }), "bottom-right")

    /*
     * Every custom source and layer dies on `setStyle`. The counter is what tells the layer components
     * to put themselves back; it fires on the first load too, which is why layers can simply wait for a
     * non-zero epoch rather than racing the style.
     */
    instance.on("style.load", () => setStyleEpoch(epoch => epoch + 1))

    const failsafe = setTimeout(() => setReady(true), READY_FAILSAFE_MS)
    instance.on("load", () => {
      clearTimeout(failsafe)
      setReady(true)
    })

    /*
     * Without this the map is blank and silent.
     *
     * MapLibre measures its container once, at construction. In dev, Vite injects the stylesheet
     * asynchronously, so this effect can easily run while the container is still 0x0 — the map then
     * requests no tiles and reports no error, forever. The observer also covers every later layout
     * change: the sidebar collapsing, a detail card opening, a window resize.
     */
    const observer = new ResizeObserver(() => instance.resize())
    observer.observe(container)

    instanceRef.current = instance
    setMap(instance)

    return () => {
      clearTimeout(failsafe)
      observer.disconnect()
      instance.remove()
      instanceRef.current = null
    }
  }, [])

  return { containerRef, map, ready, styleEpoch, basemap, setBasemap }
}
