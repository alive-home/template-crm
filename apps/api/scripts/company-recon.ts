/**
 * Everything the outbound run needs to know about one company's live site, in one command.
 *
 * The research step used to be three or four web searches per company, and it still came back empty
 * on any site behind Cloudflare: a protected site answers 403 to a plain fetch, so the run reported "no
 * signal" about a company that publishes plenty. This goes through the stealth browser instead and
 * asks the page directly for the four things the gate actually needs:
 *
 * - the **promise**: what they say about how they work, in their own words. That is a premise even
 *   when there is no news, which for an agency is most of the time.
 * - the **latest dated thing** on the site, so an event premise can be checked for staleness.
 * - a **contact address and named people**, because "no email on file" is the single most common
 *   reason a P0 account goes unworked.
 * - whether the site still describes the company we hold in the CRM.
 *
 * For Dutch companies it also checks the KvK register, because a company that is not there under the
 * name we hold is a record to fix rather than a company to write to.
 *
 * Run: `bun apps/api/scripts/company-recon.ts <domain> [--nl]`
 */
import { extract, kvk } from "./services"

const domain = process.argv[2]
if (!domain) {
  console.error("usage: bun apps/api/scripts/company-recon.ts <domain> [--nl]")
  process.exit(1)
}

const url = domain.startsWith("http") ? domain : `https://${domain}`

const data = await extract(
  url,
  {
    what_they_do: "string",
    promise: "string",
    promise_quote: "string",
    latest_dated_item: "string",
    latest_date: "string",
    contact_email: "string",
    people: "string[]",
    hiring: "string[]",
  },
  [
    "promise: how this company says it works or what it guarantees, in its own words.",
    "promise_quote: the exact sentence, verbatim, no paraphrase.",
    "latest_dated_item and latest_date: the most recent thing on the page that carries a date. Empty string if nothing is dated.",
    "people: named individuals with their role. contact_email: only an address printed on the page, never a guess.",
    "Leave a field as an empty string rather than inventing a value.",
  ].join(" "),
)

console.log(`RECON ${domain}`)
for (const [key, value] of Object.entries(data)) {
  const text = Array.isArray(value) ? value.join("; ") : String(value ?? "")
  console.log(`${key}: ${text.trim() || "(none found)"}`)
}

if (process.argv.includes("--nl")) {
  const name = String(data.what_they_do ?? domain).split(/[.,]/)[0]
  const hits = await kvk(domain.replace(/^www\.|\.\w+$/g, ""))
  console.log(
    hits.length
      ? `kvk: ${hits.map(h => `${h.naam} (${h.kvkNummer}, ${h.adres?.plaats ?? "plaats onbekend"})`).join(" | ")}`
      : `kvk: no register hit for "${name}". Treat the record as unverified before writing`,
  )
}
