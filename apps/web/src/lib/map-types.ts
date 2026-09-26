/**
 * What `/api/crm/map` returns, and how to read a pin's properties back out of MapLibre.
 *
 * Its own file rather than a section of `crm-types.ts` because that file is at the 300-line cap and
 * this is a separate seam: everything here describes one endpoint and the one library that consumes
 * it, and nothing else in the app imports it.
 */

/**
 * Where a pin's coordinates came from. Provenance, not accuracy.
 *
 * `record` means the company row carried a latitude and longitude; `city` means it carried only a
 * place name and `apps/api/scripts/geocode-places.ts` looked that place up. The two are never flattened into
 * one dot that looks equally sure of itself, and the legend prints the split.
 */
export type MapPointSource = "record" | "city"

export type MapCompanyProperties = {
  id: string
  name: string
  domain: string | null
  /** The company's own `logo_url`, so the card shows a logo rather than only a favicon. */
  logo: string | null
  locality: string | null
  countryCode: string | null
  source: MapPointSource
  stage: string | null
  priority: string | null
  /** The priority band as a number, because a MapLibre expression cannot parse "P1 — high fit". */
  band: number
  score: number | null
  dealId: string | null
  peopleCount: number
}

export type MapFeature = {
  type: "Feature"
  id: number
  geometry: { type: "Point"; coordinates: [number, number] }
  properties: MapCompanyProperties
}

export type MapMeta = {
  total: number
  placed: number
  /** Companies with no coordinates and no place name. Counted, never silently dropped. */
  unplaced: number
  fromRecord: number
  city: number
  geocoded: boolean
}

export type MapFeed = {
  type: "FeatureCollection"
  features: MapFeature[]
  meta: MapMeta
}

/** An empty collection, for the moment before the fetch lands. Real zeroes, not a cast. */
export const EMPTY_FEED: MapFeed = {
  type: "FeatureCollection",
  features: [],
  meta: { total: 0, placed: 0, unplaced: 0, fromRecord: 0, city: 0, geocoded: false },
}

/**
 * Read a clicked feature's properties back into the type above.
 *
 * MapLibre hands a clicked feature's `properties` back as a loose bag of values: they have crossed a
 * worker boundary and been through the clustering index, so the type system knows nothing about them
 * by the time they arrive. The upstream version wrote `properties as unknown as MapCompanyProperties`
 * here, which is the double assertion that means "stop asking" — and `as` is banned in this repo
 * exactly so a boundary like this gets a reader instead.
 *
 * Nothing is invented on a miss: the id is the one field a card cannot do without, so a feature
 * without one returns null rather than a card about a company nobody can open.
 */
export function readMapProperties(properties: unknown): MapCompanyProperties | null {
  if (typeof properties !== "object" || properties === null) return null
  const bag: Record<string, unknown> = { ...properties }

  const id = str(bag.id)
  if (id === null) return null

  return {
    id,
    name: str(bag.name) ?? "Unnamed",
    domain: str(bag.domain),
    logo: str(bag.logo),
    locality: str(bag.locality),
    countryCode: str(bag.countryCode),
    source: bag.source === "record" ? "record" : "city",
    stage: str(bag.stage),
    priority: str(bag.priority),
    band: nums(bag.band) ?? 9,
    score: nums(bag.score),
    dealId: str(bag.dealId),
    peopleCount: nums(bag.peopleCount) ?? 0,
  }
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function nums(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}
