import { useEffect, useRef, useState } from "react"
import { DEFAULT_VIEW } from "../config.ts"
import { useMapContext } from "../context.ts"
import type { MapCamera } from "../types.ts"

/**
 * The current centre and zoom, throttled to one update per frame.
 *
 * **Call this from the smallest component that needs the numbers.** `move` fires continuously while
 * panning — dozens of times a second — so a camera state that lives in `MapView` re-renders the entire
 * map tree on every frame of every drag. Kept at the leaf, only the leaf repaints.
 *
 * The rAF gate matters even then: without it React is asked to render far more often than the screen
 * can show, and a drag across a full-width map turns into hundreds of wasted renders.
 */
export function useMapCamera(): MapCamera {
  const { map } = useMapContext()
  const [camera, setCamera] = useState<MapCamera>(DEFAULT_VIEW)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    if (!map) return

    const sync = () => {
      if (frameRef.current !== null) return
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null
        const center = map.getCenter()
        setCamera({ lng: center.lng, lat: center.lat, zoom: map.getZoom() })
      })
    }

    sync()
    map.on("move", sync)

    return () => {
      map.off("move", sync)
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [map])

  return camera
}
