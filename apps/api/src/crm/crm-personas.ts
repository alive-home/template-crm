import { Hono } from "hono"
import { query } from "./turso"

/**
 * De persona's: wie er betaalt, en wie wij denken dat gaat betalen.
 *
 * These are not CRM objects, so they are not in `crm.ts`. That registry maps the seven objects the
 * grid renders and nothing else; a table of our own between them would blur the line between "this
 * is a record" and "this is our reading of the market". They live in the same database, because a
 * persona kept in a file in this repo is a file nobody opens a month later.
 *
 * Three tables, because the literature keeps two registers apart and so must this:
 *
 * - `personas`      the persona itself, with the evidence it rests on and how sure that is
 * - `persona_ring`  Revella's five buying insights, each with its own certainty and source
 * - `persona_quote` verbatim quotes, never paraphrased, with a source and a date
 *
 * **Certainty is per field, not per persona.** A persona is almost never wholly assumption or wholly
 * evidence, and a single flag on the row makes a published quote look as weak as a guessed role.
 *
 * The tables are declared in `apps/api/src/crm/schema-support.ts` and created by `apps/api/scripts/migrate.ts`, like
 * every other table here. This file only reads them — creating a table inside a read path is how a
 * fresh clone silently defines its own schema.
 */

type PersonaRow = {
  persona_id: string
  naam: string
  roepnaam: string
  persona_type: string
  scope: string
  mandaat: string | null
  doel: string | null
  huidige_werkwijze: string | null
  denkwijze: string | null
  bewijsbasis: string | null
  n_gesprekken: number
  zekerheid: string
  laatst_getoetst: string
}

type RingRow = { persona_id: string; ring: string; waarde: string; zekerheid: string; bron: string | null }

type QuoteRow = {
  persona_id: string
  citaat: string
  functie: string | null
  bron: string | null
  datum: string | null
  zekerheid: string
}

export function crmPersonaRoutes(): Hono {
  const app = new Hono()

  /**
   * GET /api/crm/personas — every persona, with its rings and its quotes.
   *
   * Three queries rather than one join with duplicated rows: there are six personas, so the join
   * saves nothing and costs a result the page has to take apart again.
   *
   * A missing table is not an error here but an empty list with a reason attached, because this
   * endpoint also exists on a database the migration has not been run against yet.
   */
  app.get("/personas", async c => {
    try {
      const [personas, ringen, citaten] = await Promise.all([
        query<PersonaRow>("SELECT * FROM personas ORDER BY volgorde, naam"),
        query<RingRow>("SELECT persona_id, ring, waarde, zekerheid, bron FROM persona_ring ORDER BY volgorde"),
        query<QuoteRow>("SELECT persona_id, citaat, functie, bron, datum, zekerheid FROM persona_quote"),
      ])

      return c.json({
        personas: personas.map(row => ({
          id: row.persona_id,
          naam: row.naam,
          roepnaam: row.roepnaam,
          type: row.persona_type,
          scope: row.scope,
          mandaat: row.mandaat,
          doel: row.doel,
          werkwijze: row.huidige_werkwijze,
          denkwijze: row.denkwijze,
          bewijsbasis: row.bewijsbasis,
          gesprekken: row.n_gesprekken,
          zekerheid: row.zekerheid,
          getoetst: row.laatst_getoetst,
          ringen: ringen
            .filter(ring => ring.persona_id === row.persona_id)
            .map(ring => ({ ring: ring.ring, waarde: ring.waarde, zekerheid: ring.zekerheid, bron: ring.bron })),
          citaten: citaten
            .filter(quote => quote.persona_id === row.persona_id)
            .map(quote => ({
              citaat: quote.citaat,
              functie: quote.functie,
              bron: quote.bron,
              datum: quote.datum,
              zekerheid: quote.zekerheid,
            })),
        })),
      })
    } catch (error) {
      // "The table does not exist yet" and "the database is broken" must not look the same.
      const message = error instanceof Error ? error.message : String(error)
      if (!/no such table/i.test(message)) throw error
      return c.json({
        personas: [],
        error: "De persona-tabellen bestaan nog niet. Draai bun apps/api/scripts/migrate.ts",
      })
    }
  })

  return app
}
