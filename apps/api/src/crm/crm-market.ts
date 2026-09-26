import { Hono } from "hono"
import { readMarketTaxonomy } from "./market-taxonomy"
import { query } from "./turso"

/**
 * The market research feed: companies, with the AI work already delivered there.
 *
 * There is no second list, and now there is no second copy either. The named case companies were
 * imported into `companies` by `apps/api/scripts/import-cases.ts` and every published case is a row in
 * `projects` linked to one of them, so this endpoint is a join over the CRM. The scraped file it was
 * built from has been deleted: this is the only place the cases live.
 *
 * That import wrote its facts as labelled lines — `Sector:` and `Knelpunt:` on the company, the case
 * itself on the project — so they are split back apart here rather than rendered as a block of prose
 * the reader has to parse. The cluster comes out of the same lines, which is why the page needs no
 * slug-keyed table in the repo to group by.
 */

type Row = {
  company_id: string
  company: string
  description: string | null
  project_id: string
  project: string
  notes: string | null
  tech_stack: string | null
  source_id: string
}

const FIELDS: Record<string, string> = {
  "Waar het vastliep": "problem",
  "Wat er is gebouwd": "work",
  "Voor welke functie": "who",
  "Hun woorden": "quote",
  Bron: "source",
}

/** One `Label: value` line per fact. An unrecognised line is kept, never dropped. */
function parseNotes(notes: string | null): Record<string, string> {
  const parsed: Record<string, string> = {}
  for (const line of (notes ?? "").split("\n")) {
    const split = line.indexOf(":")
    if (split === -1) continue
    const label = line.slice(0, split).trim()
    const value = line.slice(split + 1).trim()
    if (label.startsWith("Wat zij claimen")) parsed.outcome = value
    else if (FIELDS[label]) parsed[FIELDS[label]] = value
  }
  return parsed
}

/** One `Label: ...` line off the company description the import wrote. */
function descriptionLine(description: string | null, label: string): string {
  const match = (description ?? "").match(new RegExp(`^${label}:\\s*(.+)$`, "m"))
  return match?.[1]?.replace(/\.$/, "") ?? ""
}

/**
 * The day the case list was read, off the provenance line the import wrote.
 *
 * Every case company carries the same sentence, so the first one that parses answers for the set.
 * The page states this date on screen; when nothing carries it the page must say so rather than
 * print today and imply the read is fresh.
 */
function readOn(descriptions: (string | null)[]): string | null {
  for (const description of descriptions) {
    const match = (description ?? "").match(/gelezen op ([\d-]+)/)
    if (match?.[1]) return match[1]
  }
  return null
}

/** The publisher of the case list, from the same sentence. */
function readFrom(descriptions: (string | null)[]): string | null {
  for (const description of descriptions) {
    const match = (description ?? "").match(/klantcase van (.+?), gelezen op/)
    if (match?.[1]) return match[1]
  }
  return null
}

export function crmMarketRoutes() {
  const app = new Hono()

  /** GET /api/crm/market — one row per delivered project, with its company. */
  app.get("/market", async c => {
    const [rows, taxonomy] = await Promise.all([
      query<Row>(
        `SELECT company.record_id AS company_id, company.name AS company, company.description,
			        project.record_id AS project_id, project.name AS project, project.notes,
			        project.tech_stack, project.alive_source_id AS source_id
			 FROM projects project
			 JOIN companies company ON company.record_id = project.company_record_id
			 WHERE project.alive_source_id LIKE 'market-case:%'
			 ORDER BY company.name`,
      ),
      readMarketTaxonomy(),
    ])

    const descriptions = rows.map(row => row.description)
    const cases = rows.map(row => {
      const notes = parseNotes(row.notes)
      const clusterLabel = descriptionLine(row.description, "Knelpunt")
      const sector = descriptionLine(row.description, "Sector")
      return {
        companyId: row.company_id,
        company: row.company,
        sector,
        cluster: taxonomy.clusterId(clusterLabel),
        clusterLabel,
        route: taxonomy.routeId({ client: row.company, sector, who: notes.who ?? "" }),
        projectId: row.project_id,
        project: row.project,
        slug: row.source_id.replace("market-case:", ""),
        stack: row.tech_stack,
        ...notes,
      }
    })

    return c.json({
      readOn: readOn(descriptions),
      readFrom: readFrom(descriptions),
      clusters: taxonomy.clusters,
      routes: taxonomy.routes,
      cases,
      ...(taxonomy.warnings.length ? { warning: taxonomy.warnings.join(" ") } : {}),
    })
  })

  return app
}
