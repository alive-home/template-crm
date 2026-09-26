import type { MapLibreMap } from "maplibre-gl"

/** The live MapLibre instance. Aliased so nothing outside this feature imports the library's name. */
export type MapInstance = MapLibreMap

export type BasemapId = "light" | "street" | "dark"

export type Basemap = {
  id: BasemapId
  label: string
  /** Carto publishes each style with its own tiles, glyphs and sprites on the same host. */
  style: string
}

export type MapCamera = {
  lng: number
  lat: number
  zoom: number
}

/**
 * What a layer component reads off the context.
 *
 * `styleEpoch` is the one that is easy to leave out and expensive to miss. `setStyle` throws away
 * every source and layer that was added by hand, so a basemap switch silently empties the map unless
 * something tells the layers to rebuild. The counter is that something.
 */
export type MapContextValue = {
  map: MapInstance | null
  /** True once the first style has finished loading. */
  ready: boolean
  /** Bumped on every `style.load`: first load, and again after every basemap switch. */
  styleEpoch: number
  basemap: BasemapId
  setBasemap: (id: BasemapId) => void
}

/**
 * A layer's setup function. Runs against a map that has a style loaded, and returns its own cleanup.
 *
 * The cleanup is not optional in practice: after a style switch the layer may already be gone, and
 * `removeLayer` on a layer that is not there throws.
 */
/*
 * The union below is React's own `EffectCallback` shape: a setup that *may* return a cleanup.
 * Narrowing it to `undefined` would reject the ordinary case of a layer whose setup simply ends
 * without returning anything, so the rule is suppressed rather than obeyed.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: mirrors React's EffectCallback, see above.
export type MapLayerSetup = (map: MapInstance) => (() => void) | void
