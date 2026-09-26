import { Hono } from "hono"
import { query } from "./turso"

/**
 * The accounts map: every company we can honestly place, as GeoJSON.
 *
 * A dedicated read for the same reason the summary has one — a company has 60 columns and a pin
 * shows five of them. It is also the only endpoint that has to answer a question the rest of the CRM
 * never asks: *how sure are we where this is?*
 *
 * **Two registers, never merged.** Some companies carry a latitude and longitude on the record.
 * Others carry only a city name, and `apps/api/scripts/geocode-places.ts` looked those cities up. Both
 * end up as a dot, so the difference has to survive into the payload or the map quietly promotes a
 * guess: `source` is `record` or `city`, and the pin, the legend and the card all say which.
 *
 * **The field is named for its provenance, not its accuracy**, and that is the honest limit of what
 * this endpoint knows. It was called `precision: exact | city` first, until one company turned out to
 * sit on 52.3676, 4.9041 — Amsterdam's centroid to four decimals. The import had geocoded that one to
 * city level too, so "exact" was this code vouching for somebody else's pipeline. What is actually
 * known is where the number came from: the record, or the city name on it.
 *
 * **A company we cannot place is counted, never dropped.** `unplaced` comes back with the features,
 * because the companies with no location at all are a fact about this CRM — much of the list was
 * imported without an address — and a map that renders only the placeable ones without saying so
 * reads as the whole list.
 */

type MapRow = {
  id: string
  name: string | null
  domain: string | null
  logo_url: string | null
  locality: string | null
  country_code: string | null
  exact_lat: number | null
  exact_lng: number | null
  city_lat: number | null
  city_lng: number | null
  stage: string | null
  priority: string | null
  score: number | null
  deal_id: string | null
  people_count: number | null
}

/**
 * How far a city-sourced pin is allowed to be nudged, in degrees of latitude (~110km per degree).
 *
 * Every company in a city shares its centre point, so without this they are one dot: all but one of
 * those records unable to be clicked, hovered or counted by eye at any zoom. The nudge is a golden-angle spiral, so it
 * is deterministic — a record does not move between reloads — and it stays inside the city it belongs
 * to, roughly 150m to 900m out.
 *
 * This is not a claim about where the company sits, and it is only ever applied to points that are
 * already labelled `city`. Points that came off the record are never touched: whatever that number is
 * worth, moving it would only make it worth less.
 */
const SPIRAL_STEP_DEG = 0.0014
const GOLDEN_ANGLE = 2.399963229728653

function spiralOffset(index: number, latitude: number): [number, number] {
  if (index === 0) return [0, 0]
  const radius = SPIRAL_STEP_DEG * Math.sqrt(index)
  const angle = index * GOLDEN_ANGLE
  // Longitude degrees shrink towards the poles; without the correction a spiral looks squashed.
  const lngScale = 1 / Math.max(0.2, Math.cos((latitude * Math.PI) / 180))
  return [radius * Math.cos(angle) * lngScale, radius * Math.sin(angle)]
}

/** The band a human set, as a sort key. Same ladder the outbound queue works down. */
const BAND = `CASE
  WHEN d.prospect_priority LIKE 'P0%' THEN 0
  WHEN d.prospect_priority LIKE 'P1%' THEN 1
  WHEN d.prospect_priority LIKE 'P2%' THEN 2
  WHEN d.prospect_priority LIKE 'P3%' THEN 3
  ELSE 9 END`

export function crmMapRoutes(): Hono {
  const app = new Hono()

  app.get("/map", async c => {
    /*
     * `geo_place` is filled by the geocode script and may genuinely be empty — on a fresh database, or
     * before anyone has run it. That is not an error worth a 500: the map still works, it just shows
     * the companies that carry their own coordinates. The table itself is created by the migration, so
     * the join is always valid SQL; it simply matches nothing until the script has run.
     */
    const hasPlaces = await tableExists("geo_place")

    const cityJoin = hasPlaces
      ? `LEFT JOIN geo_place g
           ON g.place_key = LOWER(TRIM(co.primary_location_locality)) || '|'
                         || LOWER(TRIM(COALESCE(co.primary_location_country_code, '')))`
      : ""
    const cityCols = hasPlaces
      ? "g.latitude AS city_lat, g.longitude AS city_lng"
      : "NULL AS city_lat, NULL AS city_lng"

    const rows = await query<MapRow>(`
      SELECT co.record_id AS id, co.name,
             (SELECT value FROM companies__domains cd WHERE cd.record_id = co.record_id
              ORDER BY cd.position LIMIT 1) AS domain,
             co.logo_url,
             co.primary_location_locality AS locality,
             co.primary_location_country_code AS country_code,
             co.primary_location_latitude AS exact_lat,
             co.primary_location_longitude AS exact_lng,
             ${cityCols},
             d.stage, d.prospect_priority AS priority,
             d.alive_time_saved_score AS score, d.record_id AS deal_id,
             (SELECT COUNT(*) FROM people p WHERE p.company_record_id = co.record_id) AS people_count
        FROM companies co
        ${cityJoin}
        /*
         * The strongest deal, and only that one. A company with three deals is still one pin, and the
         * pin should carry the deal that decides how it is treated — the same one the record header
         * shows, so the map and the record page cannot disagree about where we stand.
         */
        LEFT JOIN deals d ON d.record_id = (
            SELECT d2.record_id FROM deals d2
             WHERE d2.associated_company_record_id = co.record_id
             ORDER BY COALESCE(d2.alive_time_saved_score, -1) DESC, d2.created_at
             LIMIT 1)
       ORDER BY ${BAND}, COALESCE(d.alive_time_saved_score, -1) DESC, co.name COLLATE NOCASE
    `)

    // How many share each city point, so the spiral can space them out deterministically.
    const seenInCity = new Map<string, number>()
    const features = []
    let unplaced = 0
    let fromRecord = 0
    let city = 0

    for (const row of rows) {
      /*
       * Read into locals rather than testing `row.exact_lat !== null` and reaching for it again below:
       * `as` is banned here, so the narrowing has to be the thing that carries the value through.
       */
      const exactLat = row.exact_lat
      const exactLng = row.exact_lng
      const cityLat = row.city_lat
      const cityLng = row.city_lng

      let lng: number
      let lat: number
      let source: "record" | "city"

      if (exactLat !== null && exactLng !== null) {
        lng = exactLng
        lat = exactLat
        source = "record"
        fromRecord += 1
      } else if (cityLat !== null && cityLng !== null) {
        const key = `${cityLat},${cityLng}`
        const index = seenInCity.get(key) ?? 0
        seenInCity.set(key, index + 1)
        const [dLng, dLat] = spiralOffset(index, cityLat)
        lng = cityLng + dLng
        lat = cityLat + dLat
        source = "city"
        city += 1
      } else {
        unplaced += 1
        continue
      }

      features.push({
        type: "Feature" as const,
        id: features.length,
        geometry: { type: "Point" as const, coordinates: [lng, lat] },
        properties: {
          id: row.id,
          name: row.name ?? "Unnamed",
          domain: row.domain,
          logo: row.logo_url,
          locality: row.locality,
          countryCode: row.country_code,
          source,
          stage: row.stage,
          priority: row.priority,
          // The band as a number, because a MapLibre expression cannot parse "P1 — high fit".
          band: bandOf(row.priority),
          score: row.score,
          dealId: row.deal_id,
          peopleCount: row.people_count ?? 0,
        },
      })
    }

    return c.json({
      type: "FeatureCollection",
      features,
      meta: { total: rows.length, placed: features.length, unplaced, fromRecord, city, geocoded: hasPlaces },
    })
  })

  return app
}

function bandOf(priority: string | null): number {
  if (!priority) return 9
  const match = /^P([0-3])/.exec(priority.trim())
  return match ? Number(match[1]) : 9
}

async function tableExists(name: string): Promise<boolean> {
  const rows = await query<{ n: number }>("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name = ?", [
    name,
  ])
  return (rows[0]?.n ?? 0) > 0
}
