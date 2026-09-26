/**
 * Reading a team out of raw markup, for when the extractor cannot read the page at all.
 *
 * **A blocked fetch is a tooling failure, never a finding.** One agency is the case this exists for: a
 * 227 000-character about page that answers `502` on `/scraper/extract` and `524` on `/scraper/fetch`,
 * run after run, while a plain `fetch` returns it instantly with three co-founders named in the markup.
 * Recording that as "the page names nobody" would file a tooling timeout as a fact about the company,
 * which is the same mistake as reading a 403 as a dead business.
 *
 * It is a fallback and not the main path on purpose. The extractor understands a page; this only
 * understands a shape — a name on one line, a job title on the next — which is how nearly every team
 * section renders once the tags are stripped, and is worth nothing on a page laid out differently.
 * So it runs only when the extractor has already refused, and it is deliberately strict: it would
 * rather return an empty list than a plausible stranger.
 */
import { decodeEntities } from "./team-html"

/** A line that reads as somebody's job here. The list is the roles these sites actually print. */
const ROLE =
  /founder|oprichter|owner|eigenaar|ceo\b|cto\b|coo\b|cfo\b|director|directeur|partner|manager|designer|developer|engineer|strateeg|strategist|marketeer|consultant|architect|fiscalist|accountant|head of|lead\b/i

/**
 * A line that reads as a person's name: one to four words, each capitalised, with the Dutch particles
 * allowed in the middle. First names alone are kept because half these sites publish only those.
 */
const NAME = /^\p{Lu}[\p{L}''-]+(?: (?:van|de|den|der|ter|te|von|el|di))*(?: \p{Lu}[\p{L}''-]+){0,2}$/u

/**
 * A role that belongs to somebody at *another* company.
 *
 * A testimonial has exactly this shape — a name, then a job title — and the person is a client rather
 * than staff. One studio's page yielded five of them and every one would have been imported as an
 * employee: `Firstname Lastname | CEO, Their Client`. **The tell is a capital letter after the comma.**
 * A role that continues into a company name is somebody else's role, while a team page writes `Managing
 * Director, co-founder` and carries on in lower case. That one distinction separates one agency's three
 * founders from another's client quotes on pages that are otherwise identical in shape.
 */
const ELSEWHERE = /\b(?:at|bij|van)\s+\p{Lu}|@|,\s*\p{Lu}/u

/**
 * A capitalised line that is a label rather than a person.
 *
 * `Official Framer Expert` sat directly above `Premium Partner` on one agency's page and satisfied both
 * shapes exactly — a badge reading as a name reading as a job. Nobody is called Partner or Expert, so
 * the word itself is the check.
 */
const NOT_A_PERSON =
  /\b(?:official|premium|certified|expert|partner|agency|studio|team|award|winner|client|group|company|solutions|services|marketing|digital|webflow|shopify)\b/i

/**
 * An acronym in a name means it is not a name.
 *
 * `Acme AI | Partnerships` is a partner brand on one of these pages, and it satisfies both shapes:
 * two capitalised words, then a word this file counts as a role. A person's name is capitalised, never
 * shouted, so a token of two or more consecutive capitals (AI, BV, NV, IT) marks a company.
 */
const ACRONYM = /(?:^|\s)\p{Lu}{2,}(?:$|\s)/u

export type FoundPerson = { name: string; role: string }

/** The page as the lines a reader would see, tags gone and entities decoded. */
function textLines(html: string): string[] {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, "\n"),
  )
    .split("\n")
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
}

/** Every name that has a job title printed directly under it. */
export function peopleFromHtmlText(html: string): FoundPerson[] {
  const lines = textLines(html)
  const found: FoundPerson[] = []
  const seen = new Set<string>()

  for (let i = 0; i < lines.length - 1; i++) {
    const name = lines[i] ?? ""
    const role = lines[i + 1] ?? ""
    if (name.length > 48 || !NAME.test(name) || NOT_A_PERSON.test(name) || ACRONYM.test(name)) continue
    if (role.length > 60 || !ROLE.test(role) || ELSEWHERE.test(role)) continue

    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    found.push({ name, role })
  }
  return found
}
