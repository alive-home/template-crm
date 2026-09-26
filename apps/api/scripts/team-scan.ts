/**
 * The people behind the companies in one city: founders first, four at most, with a photograph where
 * the site publishes one.
 *
 * A CRM full of companies and empty of people is a list you cannot write to. This fills that in from
 * the one source that is both public and current — the company's own team page — and it keeps to four
 * per company on purpose: past the founders and the one or two people who would actually answer, a
 * team page turns into a staff directory, and a directory is volume rather than knowledge.
 *
 * **Two facts, two readers.** The names and roles are prose, so `/scraper/extract` reads them. The
 * photograph is an `<img src>`, which an LLM reading page *text* never sees, so `team-html.ts` matches
 * it out of the raw markup against the names the extractor found. Neither one guesses on behalf of the
 * other: a person with no matchable picture is written without one, because the name and the role are
 * the part you need to send an email and the face is the part that helps you recognise them.
 *
 * **Nothing here invents a person.** The extractor is told to return only names printed on the page,
 * an empty list is a valid answer, and a company whose site names nobody is reported as such rather
 * than filled in from memory or from a search. The same rule the outbound loop runs on: an unverifiable
 * person is a record to leave empty, not one to guess at.
 *
 * Run: `bun apps/api/scripts/team-scan.ts` researches and prints. `--write` saves. `--city=Utrecht` for another
 * city, `--limit=4` for how many people a company may contribute.
 */
import { z } from "zod"
import { pictureUrlProblem } from "../src/crm/picture"
import { loadPictureRules } from "../src/crm/picture-rules"
import { textColumn } from "../src/crm/row"
import { turso } from "../src/crm/turso"
import { extract, fetchPage } from "./services"
import { peopleFromHtmlText } from "./team-fallback"
import {
  collectImages,
  fetchHtml,
  imageResolves,
  imagesFromMarkdown,
  matchLinkedin,
  matchPhoto,
  teamPageCandidates,
} from "./team-html"
import { saveTeams, type TeamCompany, type TeamPerson, type TeamResult } from "./team-write"

const CITY = process.argv.find(arg => arg.startsWith("--city="))?.slice(7) ?? "Amsterdam"
const PER_COMPANY = Number(process.argv.find(arg => arg.startsWith("--limit="))?.slice(8)) || 4
const WRITE = process.argv.includes("--write")
const TODAY = new Date().toISOString().slice(0, 10)
const PICTURE_RULES = await loadPictureRules()

/**
 * The extract endpoint takes a flat field/type map, so a list of people has to arrive as one string
 * each. Two parallel `string[]`s would drift the moment the model dropped a role, and a name lined up
 * against somebody else's job title is a wrong fact rather than a missing one.
 */
const SCHEMA = { people: "string[]" }

const PROMPT =
  "List the people who work at this company as they are printed on this page. " +
  "Each entry must be exactly 'Full Name | Job title', using the person's real name as shown. " +
  "Put founders, owners and directors first. Use only names printed on this page: do not add people " +
  "from memory, do not include client names, testimonial authors, or authors of linked articles. " +
  "If the page names nobody who works there, return an empty list."

/** What comes back is somebody else's shape, so it is parsed rather than read on trust. */
const Extracted = z.object({ people: z.array(z.string()).optional() })

/** A role that makes somebody worth keeping when the page names more people than we want. */
const SENIOR = /founder|oprichter|owner|eigenaar|ceo|cto|coo|cfo|managing|director|directeur|partner|head of/i

/** Rate limits are refusals in disguise: wait the time the service names rather than blaming the site. */
async function extractWithBackoff(url: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await extract(url, SCHEMA, PROMPT, 100000)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const retry = message.match(/"retryAfter":(\d+)/)
      // A 502 from the extractor is the same class of thing as a rate limit: it says nothing about
      // the company, and treating it as "this site names nobody" refused two good agencies outright.
      const transient =
        retry !== null || /"(?:50\d) |Bad Gateway|Gateway Time-?out|Service Unavailable|50\d/.test(message)
      if (attempt >= 2 || !transient) throw error
      await new Promise(resolve => setTimeout(resolve, (retry ? Number(retry[1]) + 2 : 8) * 1000))
    }
  }
}

/**
 * Which page to read.
 *
 * Scored on the markup before anything is sent to the model, because the extract call is the expensive
 * one and reading the wrong page costs it twice. A team page is the one with faces on it and job
 * titles beside them; a small studio often has both on the homepage, so the homepage stays in the race.
 */
/**
 * How much a page looks like the team page.
 *
 * **The path decides, not the picture count.** Scoring on images alone sent this at the homepage every
 * time — a marketing front page carries an order of magnitude more of them than a team page does, so company
 * after company was read off a landing page and reported as naming nobody, while the CRM already held
 * people from the very page that lost. Role words and pictures only break a tie
 * between two pages whose paths say the same thing.
 */
function pageScore(page: { url: string; html: string }): number {
  const path = new URL(page.url).pathname.toLowerCase()
  const named = /team|onze-mensen|ons-team|people|crew|medewerkers/.test(path) ? 100 : 0
  const about = named === 0 && /over-ons|about|wie-we|over\b/.test(path) ? 70 : 0
  const roles = (page.html.match(/founder|oprichter|ceo|cto|directeur|eigenaar|partner|manager/gi) ?? []).length
  return named + about + Math.min(roles, 15) * 3 + Math.min(collectImages(page.html, page.url).length, 15)
}

async function pickTeamPage(site: string): Promise<{ url: string; html: string } | null> {
  const home = await fetchHtml(site)
  if (!home || !home.html) return null

  const pages = [{ url: home.url, html: home.html }]
  for (const candidate of teamPageCandidates(home.html, home.url).slice(0, 5)) {
    if (candidate.replace(/\/$/, "") === home.url.replace(/\/$/, "")) continue
    const page = await fetchHtml(candidate)
    if (page?.html) pages.push({ url: page.url, html: page.html })
  }

  let best: { url: string; html: string; score: number } | null = null
  for (const page of pages) {
    if (!best || pageScore(page) > best.score) best = { ...page, score: pageScore(page) }
  }
  return best ? { url: best.url, html: best.html } : (pages[0] ?? null)
}

/** One company's team, or the reason there is not one. */
async function scan(company: TeamCompany): Promise<TeamResult> {
  const page = await pickTeamPage(company.site)
  if (!page) return { company, people: [], refusal: "site did not answer" }

  let raw: string[]
  let note: string | undefined
  try {
    raw = Extracted.parse(await extractWithBackoff(page.url)).people ?? []
  } catch (error) {
    // The extractor is down for this page, which says nothing about the company. Read the markup
    // ourselves before giving up, and say so in the report: this reading is weaker than the other one.
    const message = error instanceof Error ? error.message : String(error)
    const salvaged = peopleFromHtmlText(page.html)
    if (salvaged.length === 0) {
      return { company, page: page.url, people: [], refusal: `page unreadable: ${message.slice(0, 110)}` }
    }
    raw = salvaged.map(person => `${person.name} | ${person.role}`)
    note = "read from markup, the extractor refused this page"
  }

  // An empty answer earns the same second look. The extractor read one about page without
  // complaining and returned nobody, while the markup names eight — an empty list is a valid finding
  // often enough that it cannot be trusted on its own when the page plainly disagrees.
  if (raw.length === 0) {
    const salvaged = peopleFromHtmlText(page.html)
    if (salvaged.length > 0) {
      raw = salvaged.map(person => `${person.name} | ${person.role}`)
      note = "read from markup, the extractor returned nothing"
    }
  }

  const images = collectImages(page.html, page.url)
  const seen = new Set<string>()
  const people: TeamPerson[] = []
  for (const entry of raw) {
    const [namePart, ...rest] = entry.split("|")
    const name = (namePart ?? "").trim().replace(/^[-•*\s]+/, "")
    const role = rest.join("|").trim()
    // A single word is a first name at a small studio and a heading everywhere else; four or more
    // words is a sentence the model folded into the name field.
    const words = name.split(/\s+/).filter(Boolean).length
    if (!name || words > 4 || name.length > 60) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    people.push({ name, role, photo: matchPhoto(name, images), linkedin: matchLinkedin(name, page.html) })
  }

  // Founders before staff, and among equals the ones we can put a face to, because that is the half of
  // this the CRM cannot get anywhere else.
  people.sort((a, b) => {
    const rank = (p: TeamPerson) => (SENIOR.test(p.role) ? 0 : 1) * 2 + (p.photo ? 0 : 1)
    return rank(a) - rank(b)
  })

  if (people.length === 0) return { company, page: page.url, people: [], refusal: "page names nobody who works there" }
  const kept = people.slice(0, PER_COMPANY)

  // A team section built in JavaScript leaves no `<img>` in the delivered HTML, so a page with faces
  // all over it yields nothing above. Only then is the slow renderer worth its minute.
  if (!kept.some(person => person.photo)) {
    const rendered = await fetchPage(page.url).catch(() => null)
    if (rendered) {
      const renderedImages = imagesFromMarkdown(rendered, page.url)
      for (const person of kept) person.photo = matchPhoto(person.name, renderedImages)
    }
  }

  // Checked before it is reported, not before it is written, so the dry run and the saved record say
  // the same thing about who we can put a face to.
  await Promise.all(
    kept.map(async person => {
      // The same rule the write endpoint enforces, applied where it is *reported* too. Without this the
      // run printed a photo for one person that the write then refused, and the two disagreed about
      // what we hold: the portrait is real, but it is served from Instagram's CDN with an expiry on it.
      if (person.photo && pictureUrlProblem(person.photo, PICTURE_RULES) !== null) person.photo = null
      if (person.photo && !(await imageResolves(person.photo))) person.photo = null
    }),
  )
  return { company, page: page.url, people: kept, note }
}

const client = turso()
const rows = (
  await client.execute({
    sql: `select c.record_id, c.name,
            (select d.value from companies__domains d where d.record_id = c.record_id order by d.position limit 1) as domain
          from companies c
          where lower(coalesce(c.primary_location_locality, '')) like ?
          order by c.name`,
    args: [`%${CITY.toLowerCase()}%`],
  })
).rows

const companies: TeamCompany[] = []
for (const row of rows) {
  const id = textColumn([row], "record_id")[0]
  const name = textColumn([row], "name")[0]
  const domain = textColumn([row], "domain")[0]
  if (!id || !name || !domain) continue
  companies.push({ id, name, site: `https://${domain.replace(/^https?:\/\//, "").replace(/\/+$/, "")}/` })
}

if (companies.length === 0) throw new Error(`No companies in ${CITY} with a domain to read.`)
console.log(`${companies.length} companies in ${CITY}. Reading their team pages.\n`)

// Four at a time: the whole list at once trips the extractor's rate limit, and a 429 read as "this
// site names nobody" would refuse a company for a reason that has nothing to do with the company.
const results: TeamResult[] = []
for (let i = 0; i < companies.length; i += 4) {
  results.push(...(await Promise.all(companies.slice(i, i + 4).map(scan))))
}

for (const result of results) {
  if (result.refusal) {
    console.log(`— ${result.company.name}: ${result.refusal}`)
    continue
  }
  console.log(`${result.company.name} (${result.page})${result.note ? ` — ${result.note}` : ""}`)
  for (const person of result.people) {
    console.log(`   ${person.name} | ${person.role || "role not stated"} | ${person.photo ? "photo" : "no photo"}`)
  }
}

const found = results.reduce((sum, result) => sum + result.people.length, 0)
const withPhoto = results.reduce((sum, r) => sum + r.people.filter(p => p.photo).length, 0)
console.log(`\n${found} people, ${withPhoto} with a photo, across ${results.filter(r => !r.refusal).length} companies.`)

if (!WRITE) {
  console.log("Nothing written. Re-run with --write to save.")
  process.exit(0)
}

const saved = await saveTeams(client, results, CITY, TODAY)
console.log(
  `wrote ${saved.inserted} new people, filled gaps on ${saved.updated} existing, ${saved.photosStored} photos stored.`,
)
