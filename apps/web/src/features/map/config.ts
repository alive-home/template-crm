import type { Basemap, BasemapId, MapCamera } from "./types.ts"

/**
 * Carto's three open vector styles. No token, no account, no per-load billing.
 *
 * Each `style.json` points at its own tiles, glyphs and sprites on the same host, so there is nothing
 * else to configure and no key to leak.
 *
 * Light is the default on purpose. It is a grey basemap designed to sit *under* data; Street has
 * coloured roads and POI icons that compete with the pins for exactly the attention the pins want.
 */
export const BASEMAPS: Record<BasemapId, Basemap> = {
  light: {
    id: "light",
    label: "Licht",
    style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  },
  street: {
    id: "street",
    label: "Straat",
    style: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
  },
  dark: {
    id: "dark",
    label: "Donker",
    style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  },
}

export const BASEMAP_ORDER: BasemapId[] = ["light", "street", "dark"]
export const DEFAULT_BASEMAP: BasemapId = "light"

/**
 * The home view: the Netherlands and the edges of Belgium and Germany.
 *
 * Most of the list is Dutch and the rest is mostly one flight away, so opening on the whole of Europe
 * would put the entire CRM in one corner of the screen.
 */
export const DEFAULT_VIEW: MapCamera = { lng: 5.2, lat: 52.1, zoom: 6.4 }

export const MIN_ZOOM = 2
/** Street level. Past this you are paying for tiles that answer nothing about a company. */
export const MAX_ZOOM = 17

/**
 * The loading overlay's failsafe, in milliseconds.
 *
 * `load` waits for every source, sprite and glyph. If one of those is blocked — a proxy, an ad blocker
 * taking a dislike to a CDN — it never fires and the overlay sits on top of a map that is working
 * perfectly well. The timer guarantees the overlay always dies.
 */
export const READY_FAILSAFE_MS = 4000

/**
 * `text-font` resolves against the basemap's glyph endpoint, not against CSS.
 *
 * Name a font Carto does not host and the labels render nothing at all, silently. Open Sans Regular
 * ships with all three styles.
 */
export const LABEL_FONT = ["Open Sans Regular"]
