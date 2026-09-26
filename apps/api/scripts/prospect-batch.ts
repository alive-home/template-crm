/**
 * A batch of candidate companies, verified before any of them reaches the CRM.
 *
 * A lead list changes shape as it learns, and the profile worth adding next is rarely the one it
 * started with. That profile is a commercial judgement, so it is not written here either.
 *
 * **The candidates are not in this file.** They are a prospect list: real named organisations with a
 * note on why we think they buy, which is business writing rather than code. The runtime list lives
 * in Turso's `prospect_candidate` table.
 *
 * Every candidate is a guess until it is checked, so nothing is written on a name alone:
 * - the KvK must know it, which is what makes it a Dutch legal entity rather than a brand we recall;
 * - the site must answer through the stealth browser and say what the company does, in its own words.
 *
 * A candidate that fails either check is printed as a refusal and left out. That is the same rule the
 * outbound loop runs on: an unverifiable company is a record to fix, not a company to write to.
 *
 * Run: `bun apps/api/scripts/prospect-batch.ts` to research and print. `--write` imports the passers.
 */
import { textColumn } from "../src/crm/row"
import { query, turso } from "../src/crm/turso"
import { extract, kvk } from "./services"

const SOURCE = "sector-batch"
const IMPORTED_ON = new Date().toISOString().slice(0, 10)

/** [name, domain, sector, why this profile is a buyer] */
type Candidate = [string, string, string | null, string | null]
type CandidateRow = { name: string; domain: string; sector: string | null; why: string | null }

const CANDIDATE_SEED_ERROR = "The prospect candidate table is empty or missing. Run bun apps/api/scripts/seed-turso.ts."

/**
 * Read the prospect list from the database.
 *
 * A missing file is a stop, not an empty run: "no candidates" and "the list is somewhere else" would
 * otherwise both print zero refusals and zero writes, and look like success.
 */
async function loadCandidates(): Promise<Candidate[]> {
  let rows: CandidateRow[]
  try {
    rows = await query<CandidateRow>("SELECT name, domain, sector, why FROM prospect_candidate ORDER BY name")
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/no such table/i.test(message)) throw new Error(CANDIDATE_SEED_ERROR)
    throw error
  }
  if (rows.length === 0) throw new Error(CANDIDATE_SEED_ERROR)
  return rows.map(entry => [entry.name, entry.domain, entry.sector, entry.why])
}

const CANDIDATES = await loadCandidates()

const SCHEMA = {
  what_they_do: "string",
  promise: "string",
  size_signal: "string",
  contact_email: "string",
  latest_dated_item: "string",
  latest_date: "string",
}

const PROMPT =
  "Read only what this page says. Leave a field as an empty string rather than inventing a value. " +
  "size_signal is any stated number of employees, locations or customers, quoted from the page."

type Finding = {
  candidate: Candidate
  kvkName?: string
  kvkNumber?: string
  city?: string
  site?: Record<string, unknown>
  refusal?: string
}

/**
 * The extract endpoint rate-limits, and a 429 read as "site unreadable" would refuse a company for a
 * reason that has nothing to do with the company. So it waits the time the service asks for and tries
 * again, twice, before it calls anything a refusal.
 */
async function extractWithBackoff(url: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await extract(url, SCHEMA, PROMPT)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const retry = message.match(/"retryAfter":(\d+)/)
      if (attempt >= 2 || !retry) throw error
      await new Promise(resolve => setTimeout(resolve, (Number(retry[1]) + 2) * 1000))
    }
  }
}

async function research(candidate: Candidate): Promise<Finding> {
  const [name, domain] = candidate
  const finding: Finding = { candidate }

  const hits = await kvk(name).catch(() => [])
  const hit = hits[0]
  if (hit) {
    finding.kvkName = hit.naam
    finding.kvkNumber = hit.kvkNummer
    // The register answers with branches too, so a national chain's village clinic comes back as a
    // real location and the wrong city to file the company under. A city is only kept when the match
    // is the company itself, because a branch town in the record reads as a fact about head office.
    if (hit.naam.toLowerCase().replace(/ b\.v\.$/, "") === name.toLowerCase()) finding.city = hit.adres?.plaats
  }

  try {
    finding.site = await extractWithBackoff(`https://${domain}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    finding.refusal = `site unreadable: ${message.slice(0, 120)}`
    return finding
  }

  if (!finding.site?.what_they_do) finding.refusal = "site read, but it never says what the company does"
  else if (!hit) finding.refusal = "no KvK match under this name — the record is wrong before the mail is"
  return finding
}

function describe(f: Finding): string {
  const [name, domain, sector, why] = f.candidate
  const site = f.site ?? {}
  const lines = [
    `Imported ${IMPORTED_ON} — sector batch, the established-organisation profile.`,
    `Segment: ${sector ?? "not recorded"}. ${why ?? "No buyer rationale recorded"}.`,
    `What they do (from their own site, read ${IMPORTED_ON}): ${site.what_they_do ?? name}.`,
  ]
  if (site.promise) lines.push(`Belofte in eigen woorden: "${site.promise}".`)
  if (site.size_signal) lines.push(`Size signal from the page: ${site.size_signal}.`)
  if (site.latest_dated_item)
    lines.push(`Latest dated item: ${site.latest_dated_item}${site.latest_date ? ` (${site.latest_date})` : ""}.`)
  if (site.contact_email) lines.push(`Public contact: ${site.contact_email}.`)
  if (f.kvkNumber) lines.push(`KvK: ${f.kvkName} — ${f.kvkNumber}${f.city ? `, ${f.city}` : ""}.`)
  lines.push(`Source: https://${domain}`)
  return lines.join("\n")
}

const write = process.argv.includes("--write")
// Four at a time: the whole batch at once trips the rate limit and turns research into refusals.
const findings: Finding[] = []
for (let i = 0; i < CANDIDATES.length; i += 4) {
  findings.push(...(await Promise.all(CANDIDATES.slice(i, i + 4).map(research))))
}
const passed = findings.filter(f => !f.refusal)
const refused = findings.filter(f => f.refusal)

for (const f of refused) console.log(`REFUSED ${f.candidate[0]} — ${f.refusal}`)
console.log("")

if (!write) {
  for (const f of passed) console.log(`+ ${f.candidate[0]} (${f.candidate[1]})\n${describe(f)}\n`)
  console.log(`${passed.length} verified, ${refused.length} refused. Re-run with --write to import.`)
  process.exit(0)
}

const client = turso()
const existing = new Set(
  textColumn(
    (await client.execute("select alive_source_key from companies where alive_source_key is not null")).rows,
    "alive_source_key",
  ),
)

let written = 0
let skipped = 0
for (const f of passed) {
  const [name, domain] = f.candidate
  const key = `leadgen:${SOURCE}:${domain}`
  if (existing.has(key)) {
    skipped++
    continue
  }
  const recordId = crypto.randomUUID()
  await client.batch([
    {
      sql: `insert into companies (record_id, name, description, primary_location_locality, primary_location_country_code,
			        created_at, created_by_actor_type, alive_source_key, alive_source_ids)
			      values (?, ?, ?, ?, 'NL', ?, 'api-token', ?, ?)`,
      args: [
        recordId,
        name,
        describe(f),
        f.city ?? null,
        new Date().toISOString(),
        key,
        `leadgen:${SOURCE}:${IMPORTED_ON}:${domain}`,
      ],
    },
    {
      sql: "insert into companies__domains (record_id, position, value, value_root_domain) values (?, 0, ?, ?)",
      args: [recordId, domain, domain],
    },
  ])
  written++
}

console.log(`wrote ${written} companies, skipped ${skipped} already present, refused ${refused.length}`)
