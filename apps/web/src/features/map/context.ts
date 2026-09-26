import { createContext, useContext } from "react"
import type { MapContextValue } from "./types.ts"

export const MapContext = createContext<MapContextValue | null>(null)

/**
 * Read the map off the context.
 *
 * Throws rather than returning null when called outside a `MapView`, because the alternative is a
 * layer that renders nothing and reports nothing — which looks exactly like a layer whose data is
 * empty.
 */
export function useMapContext(): MapContextValue {
  const value = useContext(MapContext)
  if (!value) throw new Error("useMapContext must be called inside a <MapView>.")
  return value
}
