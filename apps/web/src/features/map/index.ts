/**
 * A generic MapLibre container. It knows nothing about the CRM.
 *
 * Everything that goes on the map is a separate feature mounted as a child of `MapView` — see
 * `src/features/accounts-map` for this app's use of it.
 */
export { BasemapSwitcher } from "./components/BasemapSwitcher.tsx"
export { MapLoadingOverlay } from "./components/MapLoadingOverlay.tsx"
export { MapView } from "./components/MapView.tsx"
export { BASEMAPS, DEFAULT_VIEW, LABEL_FONT, MAX_ZOOM, MIN_ZOOM } from "./config.ts"
export { useMapContext } from "./context.ts"
export { useMapCamera } from "./hooks/useMapCamera.ts"
export { useMapLayers } from "./hooks/useMapLayers.ts"
export { hsl, type MapTokens, mapTokens, readToken } from "./lib/tokens.ts"
export type { Basemap, BasemapId, MapCamera, MapContextValue, MapInstance, MapLayerSetup } from "./types.ts"
