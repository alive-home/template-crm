import type { ExpressionSpecification } from "@maplibre/maplibre-gl-style-spec"
import { hsl, type MapTokens } from "#/features/map/index.ts"

/**
 * The five bands, in the order they are read and drawn.
 *
 * A literal tuple rather than a loose `number`, because `noUncheckedIndexedAccess` is on: keyed by a
 * bare number, every colour and every label comes back `string | undefined` and the paint expression
 * below stops typechecking. The band is a closed set, so it is spelled as one.
 */
export const BAND_ORDER = [0, 1, 2, 3, 9] as const
export type BandKey = (typeof BAND_ORDER)[number]

/** Anything the API sends that is not one of the five is unscored. */
export function bandKey(band: number): BandKey {
  return band === 0 || band === 1 || band === 2 || band === 3 ? band : 9
}

/**
 * How an account is painted.
 *
 * Kept out of the layer component because these are the judgements — what the colour means, what the
 * size means, what appears at which zoom — and they are worth reading without a `useEffect` around
 * them.
 *
 * **Colour is the priority band, not the pipeline stage.** Stage is the obvious axis and it is the
 * wrong one here: most placed companies sit in Prospect and a third have no deal at all, so a
 * stage-coloured map is one colour with a rounding error on top. The band a human scored has real
 * spread and it is the same ranking `apps/api/scripts/outbound-queue.ts` works down, so the map answers the
 * question the CRM is actually organised around.
 *
 * The ramp is single-hue and sequential, derived from `--accent`, for the same reason the age ramp
 * is: the variable is ordinal, so the colours have to be comparable at a glance rather than merely
 * different from each other. Unscored is grey, not a fifth accent step, because "nobody has judged
 * this yet" is a different kind of thing from a weak score.
 */
export function bandColors(t: MapTokens): Record<BandKey, string> {
  return {
    0: hsl(t.accent, { lighten: -14, saturate: 4 }),
    1: hsl(t.accent),
    2: hsl(t.accent, { lighten: 14, saturate: -22 }),
    3: hsl(t.accent, { lighten: 24, saturate: -40 }),
    9: hsl(t.muted, { lighten: 18 }),
  }
}

/**
 * A MapLibre `match` on the band, falling through to the unscored grey.
 *
 * The return type is the style spec's own, not an inferred array. `as` is banned here, and the
 * alternative the upstream code used — `as never` at every call site — is the same assertion with the
 * type name filed off: it silences the checker on exactly the values MapLibre validates at runtime,
 * where a rejected paint property is a console warning and a layer that never draws.
 */
export function bandColorExpression(t: MapTokens): ExpressionSpecification {
  const colors = bandColors(t)
  return ["match", ["get", "band"], 0, colors[0], 1, colors[1], 2, colors[2], 3, colors[3], colors[9]]
}

/** The same ramp, keyed on the strongest band inside a cluster. */
export function clusterColorExpression(t: MapTokens): ExpressionSpecification {
  const colors = bandColors(t)
  return ["match", ["get", "minBand"], 0, colors[0], 1, colors[1], 2, colors[2], 3, colors[3], colors[9]]
}

export const BAND_LABELS: Record<BandKey, string> = {
  0: "P0 — strongest fit",
  1: "P1 — high fit",
  2: "P2 — good fit",
  3: "P3 — exploratory",
  9: "Unscored",
}

/** The label for whatever band a pin actually carries. */
export function bandLabel(band: number): string {
  return BAND_LABELS[bandKey(band)]
}

/**
 * Dot size by zoom, and by band within each zoom.
 *
 * At country zoom a strong lead is a bigger mark than an unscored one, which is what makes the map
 * readable before you have zoomed anywhere. The spread narrows as you zoom in, because once you are
 * looking at one city the question is no longer which of these matters most.
 *
 * `pad` widens every stop, for the selection ring that has to sit outside the dot. It is a parameter
 * rather than an addition at the call site because **a zoom expression may only be the outermost
 * function in a paint property**: wrapping this in `["+", …, 6]` is invalid, and MapLibre's answer is
 * to reject that one layer with a console error and carry on. The ring simply never drew, on a map
 * that otherwise looked entirely correct.
 */
export function radiusExpression(pad = 0): ExpressionSpecification {
  const byBand = (strong: number, mid: number, weak: number): ExpressionSpecification => [
    "match",
    ["get", "band"],
    0,
    strong + pad,
    1,
    strong + pad,
    2,
    mid + pad,
    3,
    mid + pad,
    weak + pad,
  ]

  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    3,
    byBand(4, 3, 2.2),
    6,
    byBand(6, 4.5, 3.4),
    10,
    byBand(8, 7, 6),
    14,
    byBand(10, 9, 8),
  ]
}

/**
 * Cluster size by how many accounts are inside it.
 *
 * Stepped rather than interpolated: the jump from 9 to 10 should be visible, because the number
 * printed inside the circle is the thing being read and the circle is its container.
 */
export const CLUSTER_RADIUS: ExpressionSpecification = ["step", ["get", "point_count"], 14, 5, 18, 15, 23, 40, 30]

/** A dot's fill drops right back when the point is only a city centre. See `MapPointSource`. */
export function cityAware(cityValue: number, recordValue: number): ExpressionSpecification {
  return ["case", ["==", ["get", "source"], "city"], cityValue, recordValue]
}
