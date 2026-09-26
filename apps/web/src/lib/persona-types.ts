/**
 * What `/api/crm/personas` returns.
 *
 * Its own file, like `map-types.ts` and `pipeline-types.ts`, because `crm-types.ts` is at the
 * 300-line cap and these types describe one endpoint nothing else reads.
 *
 * The field names are Dutch because the values are: the personas were written in Dutch, they are
 * stored in Turso under Dutch column names, and translating the keys on the way out would put a
 * second vocabulary between the database and the screen for no reader's benefit.
 */

/** How sure a single claim is. Per field, never per persona — see `PersonaDetail`. */
export type Zekerheid = "aanname" | "kwalitatief" | "geverifieerd"

export type PersonaRing = { ring: string; waarde: string; zekerheid: Zekerheid; bron: string | null }

export type PersonaQuote = {
  citaat: string
  functie: string | null
  bron: string | null
  datum: string | null
  zekerheid: Zekerheid
}

export type Persona = {
  id: string
  naam: string
  roepnaam: string
  type: "primair" | "secundair" | "negatief"
  scope: string
  mandaat: string | null
  doel: string | null
  werkwijze: string | null
  denkwijze: string | null
  bewijsbasis: string | null
  gesprekken: number
  zekerheid: Zekerheid
  getoetst: string
  ringen: PersonaRing[]
  citaten: PersonaQuote[]
}

/** A feed carries a reason when it is empty, so "no personas" and "no tables" do not look alike. */
export type PersonaFeed = { personas: Persona[]; error?: string }

/** De vijf buying insights van Revella, in de volgorde waarin een koop verloopt. */
export const RING_LABELS: Record<string, string> = {
  aanleiding: "Waarom nu",
  succesfactoren: "Welk resultaat",
  bezwaren: "Wat hen tegenhoudt",
  beslissingscriteria: "Waarop zij ons beoordelen",
  koopproces: "Hoe de koop loopt",
}
