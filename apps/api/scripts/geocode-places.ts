/**
 * De plaatsen op de kaart, één keer opgezocht.
 *
 * Een deel van de bedrijven heeft een breedte- en lengtegraad op het record; een groter deel heeft
 * alleen een plaatsnaam. Zonder deze stap toont de kaart maar een fractie van de lijst en lijkt de
 * rest niet te bestaan.
 *
 * Twee regels houden dit eerlijk, en het zijn dezelfde twee: gemeten en geraden mogen in dezelfde
 * database staan, maar nooit in dezelfde kolom.
 *
 * - **De kolommen van het record worden nooit overschreven.** `primary_location_latitude` is een
 *   adres dat iemand heeft ingevuld. Wat hier uitkomt is een stadscentrum. Zou je dat in diezelfde
 *   kolom schrijven, dan is het verschil de volgende dag onzichtbaar en staat er een bedrijf op een
 *   punt dat niemand ooit heeft gecontroleerd, met precies dezelfde stelligheid als een echt adres.
 * - **We zoeken plaatsen op, geen bedrijven.** De sleutel is de stad, niet het record. Utrecht staat
 *   dertien keer in de lijst en wordt één keer opgezocht, en het veertiende bedrijf in Utrecht heeft
 *   morgen een punt zonder dat hier iets voor hoeft te draaien.
 *
 * De herkomst wordt bij het lezen bepaald en niet hier opgeslagen: een bedrijf met eigen coördinaten
 * is `record`, een bedrijf dat via deze tabel op de kaart komt is `city`. De kaart zegt dat erbij.
 *
 * Gebruik: `bun apps/api/scripts/geocode-places.ts` (droog: `--dry`, opnieuw: `--force`).
 */

import { z } from "zod"
import { execute, query } from "../src/crm/turso"

/** Nominatim vraagt om één verzoek per seconde en om een herkenbare afzender. Beide staan hier. */
const NOMINATIM = "https://nominatim.openstreetmap.org/search"
const USER_AGENT = "crm-map/1.0 (set this to a URL or address that identifies you)"
const REQUEST_INTERVAL_MS = 1100

/**
 * Wanneer een antwoord een plaats is.
 *
 * Nominatim geeft altijd iets terug. Vraag je naar een naam die het niet kent, dan kan het
 * terugvallen op de provincie of het land, en een landmiddelpunt zet een bedrijf ergens in een
 * weiland of op de Noordzee met dezelfde stelligheid als een stad. Daarom een ondergrens op
 * `place_rank`, dat van 4 (land) via 8 (provincie) naar 14-18 (stad, dorp) loopt.
 *
 * **Maar de rang beslist alleen als het type niets zegt.** De eerste versie hing er volledig op en
 * weigerde Berlijn en Hamburg: dat zijn stadstaten, dus rang 7 en 8, terwijl `addresstype` er gewoon
 * `city` bij zet. Twee bedrijven vielen van de kaart omdat de Duitse bestuurlijke indeling niet in
 * een getal past. Zegt Nominatim zelf dat het een woonplaats is, dan is dat het betere bewijs.
 */
const MIN_PLACE_RANK = 10
const SETTLEMENT_TYPES = new Set(["city", "town", "village", "municipality", "hamlet", "borough", "suburb"])
const REFUSED_TYPES = new Set(["country", "state", "continent"])

/**
 * Wat Nominatim terugstuurt, gecontroleerd in plaats van aangenomen.
 *
 * Dit is een grens: het antwoord komt van buiten deze repo, dus het wordt geparsed. `lat` en `lon`
 * komen als tekst binnen, niet als getal, en dat is precies het soort verschil dat een `as` zou
 * verbergen tot er een bedrijf op nul graden noord staat.
 */
const HitSchema = z.object({
  lat: z.string().optional(),
  lon: z.string().optional(),
  display_name: z.string().optional(),
  place_rank: z.number().optional(),
  addresstype: z.string().optional(),
})
const HitsSchema = z.array(HitSchema)

type NominatimHit = z.infer<typeof HitSchema>
type PlaceRow = { locality: string; country_code: string | null }

/** `amsterdam|nl`. Het land hoort in de sleutel: Cambridge is twee steden op twee continenten. */
export function placeKey(locality: string, countryCode: string | null): string {
  return `${locality.trim().toLowerCase()}|${(countryCode ?? "").trim().toLowerCase()}`
}

/** Een antwoord dat geen plaats is, is geen antwoord. Zie `MIN_PLACE_RANK`. */
export function isUsablePlace(hit: NominatimHit): boolean {
  const lat = Number(hit.lat)
  const lon = Number(hit.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false
  if (lat === 0 && lon === 0) return false
  if (hit.addresstype && REFUSED_TYPES.has(hit.addresstype)) return false
  if (hit.addresstype && SETTLEMENT_TYPES.has(hit.addresstype)) return true
  return (hit.place_rank ?? 99) >= MIN_PLACE_RANK
}

async function lookup(locality: string, countryCode: string | null): Promise<NominatimHit | null> {
  const url = new URL(NOMINATIM)
  url.searchParams.set("q", locality)
  url.searchParams.set("format", "jsonv2")
  url.searchParams.set("limit", "1")
  if (countryCode) url.searchParams.set("countrycodes", countryCode.toLowerCase())

  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } })
  if (!response.ok) throw new Error(`Nominatim ${response.status} voor ${locality}`)

  const hit = HitsSchema.parse(await response.json())[0]
  if (!hit || !isUsablePlace(hit)) return null
  return hit
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Een gevangen fout is `unknown`. Dit leest er een zin uit zonder er een `Error` van te beweren. */
function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

async function main() {
  const force = process.argv.includes("--force")
  const dry = process.argv.includes("--dry")

  /*
   * Alleen de plaatsen die de kaart nodig heeft: een bedrijf met eigen coördinaten hoeft niet
   * opgezocht te worden, want dat punt is beter dan alles wat hier uitkomt.
   */
  const places = await query<PlaceRow>(`
    SELECT DISTINCT TRIM(primary_location_locality) AS locality,
           NULLIF(TRIM(COALESCE(primary_location_country_code, '')), '') AS country_code
    FROM companies
    WHERE primary_location_locality IS NOT NULL
      AND TRIM(primary_location_locality) <> ''
      AND (primary_location_latitude IS NULL OR primary_location_longitude IS NULL)
    ORDER BY locality
  `)

  const known = new Set(
    force ? [] : (await query<{ place_key: string }>("SELECT place_key FROM geo_place")).map(r => r.place_key),
  )

  const todo = places.filter(p => !known.has(placeKey(p.locality, p.country_code)))
  console.log(`${places.length} plaatsen in de lijst, ${todo.length} nog op te zoeken.`)
  if (dry) {
    for (const p of todo) console.log(`  ${p.locality}${p.country_code ? ` (${p.country_code})` : ""}`)
    return
  }

  let found = 0
  const refused: string[] = []

  for (const place of todo) {
    const label = `${place.locality}${place.country_code ? ` (${place.country_code})` : ""}`
    try {
      const hit = await lookup(place.locality, place.country_code)
      if (!hit) {
        refused.push(label)
        console.log(`  geen plaats gevonden: ${label}`)
      } else {
        await execute(
          `INSERT INTO geo_place (place_key, locality, country_code, latitude, longitude, display_name, place_rank, source, geocoded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'nominatim', ?)
           ON CONFLICT(place_key) DO UPDATE SET
             latitude = excluded.latitude, longitude = excluded.longitude,
             display_name = excluded.display_name, place_rank = excluded.place_rank,
             geocoded_at = excluded.geocoded_at`,
          [
            placeKey(place.locality, place.country_code),
            place.locality,
            place.country_code,
            Number(hit.lat),
            Number(hit.lon),
            hit.display_name ?? null,
            hit.place_rank ?? null,
            new Date().toISOString(),
          ],
        )
        found += 1
        console.log(`  ${label} -> ${hit.display_name}`)
      }
    } catch (error) {
      refused.push(label)
      console.log(`  mislukt: ${label} (${messageOf(error)})`)
    }
    await sleep(REQUEST_INTERVAL_MS)
  }

  console.log(`\n${found} plaatsen opgeslagen.`)
  if (refused.length > 0) {
    /*
     * Een plaats die niet gevonden is, krijgt geen punt en geen benadering. Ze staat hier zodat
     * iemand de plaatsnaam op het record kan verbeteren, want dat is de echte fout.
     */
    console.log(`${refused.length} zonder punt, die blijven van de kaart: ${refused.join(", ")}`)
  }
}

if (import.meta.main) {
  main().catch(error => {
    console.error(error)
    process.exit(1)
  })
}
