/**
 * Reading a team page as HTML: where it is, and which picture on it belongs to which person.
 *
 * The people on a company's team page are two facts in two different places. The **names and roles**
 * are prose, which is what `/scraper/extract` is good at. The **photograph** is an `<img src>`, which
 * is markup, and an LLM reading the page as text never sees it — the extract endpoint is documented as
 * sending "page text" to the model, and a URL that only exists as an attribute does not survive that.
 * So the photo is matched here, out of the raw HTML, against the names the extractor found.
 *
 * The match is deliberately conservative: a picture is only claimed for a person when the alt text or
 * the file name says their name. Anything weaker (position on the page, order of appearance) would put
 * a stranger's face on a record, and a wrong photo is worse than no photo — it reads as a fact for as
 * long as nobody who knows the person opens the page.
 *
 * Plain `fetch` rather than the stealth browser, because these sites answer it: the browser
 * costs about a minute a page and is the thing to reach for when a plain fetch is refused, not before.
 */

/** A browser user-agent. Several of these sites answer a bare fetch with a challenge page otherwise. */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"

/** Paths a Dutch or English team page tends to live at, tried when the homepage links to none. */
const TEAM_PATHS = ["/team", "/about", "/about-us", "/over-ons", "/ons-team", "/over", "/people", "/wie-we-zijn"]

/** Words that mark a link as pointing at the team, in both languages this list is written in. */
const TEAM_LINK = /team|about|over-?ons|wie-we|people|crew|mensen|founders|onze-mensen/i

/**
 * Images that are furniture rather than portraits.
 *
 * A team page carries a logo, a set of client marks and a row of social icons, and every one of them
 * is an `<img>` with a name in the alt text sometimes. None of them is a person.
 */
const NOT_A_PORTRAIT = /logo|icon|favicon|sprite|badge|arrow|chevron|placeholder|pattern|background|client|award/i

export type PageImage = { src: string; alt: string }

export type Fetched = { url: string; html: string; status: number }

/** One page, or the reason there is none. Never throws: a dead site is a finding, not a crash. */
export async function fetchHtml(url: string, timeoutMs = 12000): Promise<Fetched | null> {
  const control = new AbortController()
  const timer = setTimeout(() => control.abort(), timeoutMs)
  try {
    const res = await fetch(url, { headers: { "user-agent": UA }, signal: control.signal, redirect: "follow" })
    if (!res.ok) return { url: res.url, html: "", status: res.status }
    return { url: res.url, html: await res.text(), status: res.status }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Whether the picture actually answers, and answers with an image.
 *
 * `pictureUrlProblem` refuses what a string check can establish; this is the other half, and it is
 * cheap here in a way it never is later. A matched `<img src>` can still be a hotlink the CDN blocks,
 * a path that 404s behind a soft error page, or an HTML page where a photograph was expected — and all
 * three land in the column looking exactly like a working portrait until somebody opens the record.
 */
export async function imageResolves(url: string, timeoutMs = 8000): Promise<boolean> {
  const control = new AbortController()
  const timer = setTimeout(() => control.abort(), timeoutMs)
  const headers = { "user-agent": UA }
  try {
    let res = await fetch(url, { method: "HEAD", headers, signal: control.signal, redirect: "follow" })
    // Plenty of servers answer HEAD with a 405 and the same URL is fine on GET, so a refusal of the
    // method is not a refusal of the file. One small ranged read settles it.
    if (!res.ok) {
      res = await fetch(url, {
        headers: { ...headers, range: "bytes=0-1024" },
        signal: control.signal,
        redirect: "follow",
      })
    }
    return res.ok && (res.headers.get("content-type") ?? "").toLowerCase().startsWith("image/")
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** Absolute, https, and same-site. A protocol-relative or root-relative href is still this company. */
function absolute(href: string, base: string): string | null {
  try {
    const url = new URL(href, base)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    url.hash = ""
    return url.toString()
  } catch {
    return null
  }
}

/**
 * Where the team might be, best guess first.
 *
 * The homepage's own links come before the guessed paths, because a site that links to `/company/team`
 * is telling us where it is and a guessed `/team` would 404 next to it.
 */
export function teamPageCandidates(html: string, siteUrl: string): string[] {
  const host = new URL(siteUrl).hostname.replace(/^www\./, "")
  const linked = [...html.matchAll(/href="([^"#]+)"/g)]
    .map(match => match[1] ?? "")
    .filter(href => TEAM_LINK.test(href))
    .map(href => absolute(href, siteUrl))
    .filter((href): href is string => href !== null)
    // A link to an AI chat prefilled with a sales pitch is not a team page. Same-host only.
    .filter(href => new URL(href).hostname.replace(/^www\./, "") === host)
    .filter(href => new URL(href).pathname.split("/").filter(Boolean).length <= 3)

  const guessed = TEAM_PATHS.map(path => absolute(path, siteUrl)).filter((url): url is string => url !== null)
  return [...new Set([...linked, ...guessed])].slice(0, 8)
}

/** The largest URL in a srcset, which is the one worth storing. */
function widestFromSrcset(srcset: string): string | null {
  const entries = srcset
    .split(",")
    .map(part => part.trim().split(/\s+/))
    .map(parts => ({ url: parts[0] ?? "", width: Number((parts[1] ?? "").replace(/[wx]$/, "")) || 0 }))
    .filter(entry => entry.url !== "")
  if (entries.length === 0) return null
  return entries.reduce((best, entry) => (entry.width > best.width ? entry : best), entries[0]!).url
}

/**
 * `&amp;` back into `&`.
 *
 * An attribute in HTML is entity-encoded, so a resized image arrives as `?width=2150&amp;height=2900`
 * and every one of a studio's portraits answered 400 with a JSON complaint — a URL that is present,
 * plausible and wrong in a way only the origin can see. Read the attribute, decode it, then treat it
 * as a URL.
 */
export function decodeEntities(value: string): string {
  return value
    .replace(/&(?:amp|#38|#x26);/gi, "&")
    .replace(/&(?:quot|#34);/gi, '"')
    .replace(/&(?:apos|#39);/gi, "'")
    .replace(/&(?:lt|#60);/gi, "<")
    .replace(/&(?:gt|#62);/gi, ">")
    .replace(/&#(?:x2F|47);/gi, "/")
}

/** The filters a candidate picture has to survive, shared by the HTML and the rendered-markdown reader. */
function keepImage(src: string, alt: string): boolean {
  if (!src.startsWith("https:")) return false
  if (/\.svg($|\?)/i.test(src)) return false
  return !NOT_A_PORTRAIT.test(src) && !NOT_A_PORTRAIT.test(alt)
}

/**
 * Pictures out of a page the stealth browser rendered.
 *
 * The fallback for a site that builds its team section in JavaScript: the raw HTML holds an empty
 * `<div>` and every portrait arrives after the framework runs, so `collectImages` finds nothing on a
 * page that visibly has faces on it. `fetchPage` renders first and hands back markdown, where an image
 * survives as `![alt](url)`.
 */
export function imagesFromMarkdown(markdown: string, pageUrl: string): PageImage[] {
  const images: PageImage[] = []
  for (const match of markdown.matchAll(/!\[([^\]]*)\]\(([^)\s]+)/g)) {
    const src = absolute(decodeEntities(match[2] ?? ""), pageUrl)
    const alt = decodeEntities(match[1] ?? "")
    if (src && keepImage(src, alt)) images.push({ src, alt })
  }
  return images
}

/** Every picture on the page that could plausibly be a person, absolute and https. */
export function collectImages(html: string, pageUrl: string): PageImage[] {
  const images: PageImage[] = []
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const attr = (name: string) => decodeEntities(tag.match(new RegExp(`${name}="([^"]*)"`, "i"))?.[1] ?? "")
    const srcset = attr("srcset") || attr("data-srcset")
    const raw = (srcset ? widestFromSrcset(srcset) : "") || attr("src") || attr("data-src") || attr("data-lazy-src")
    if (!raw || raw.startsWith("data:")) continue

    const src = absolute(raw, pageUrl)
    const alt = attr("alt")
    // An http image is blocked on an https page and renders as nothing, which `pictureUrlProblem`
    // refuses later anyway. Dropping it here keeps it from winning the match over a usable one.
    if (!src || !keepImage(src, alt)) continue

    const width = Number(attr("width")) || 0
    const height = Number(attr("height")) || 0
    if ((width > 0 && width < 64) || (height > 0 && height < 64)) continue

    images.push({ src, alt })
  }
  return images
}

/**
 * This person's LinkedIn, when the page links it beside their name.
 *
 * Matched on the profile slug rather than on where the link sits in the markup, for the same reason
 * the photo is: a link taken from the wrong card is a wrong fact that looks like a checked one. The
 * profile URL itself is kept, never the picture behind it — social-network CDN images are signed and
 * expire, which is why `pictureUrlProblem` applies its database-backed host rules.
 */
export function matchLinkedin(fullName: string, html: string): string | null {
  const parts = fullName.split(/\s+/).filter(Boolean)
  const first = slug(parts[0] ?? "")
  const last = slug(parts[parts.length - 1] ?? "")
  if (!first) return null

  for (const match of html.matchAll(/https:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([a-zA-Z0-9%\-_]+)/g)) {
    const handle = slug(decodeURIComponent(match[1] ?? ""))
    const hitsFirst = handle.includes(first)
    const hitsLast = last.length >= 3 && handle.includes(last)
    if ((hitsFirst && hitsLast) || (hitsFirst && first.length >= 5 && parts.length === 1)) {
      return `https://www.linkedin.com/in/${match[1]}`
    }
  }
  return null
}

/** `José Márquez` -> `jose-marquez`, and accents folded, because a file name rarely carries them. */
function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

/**
 * The picture that belongs to this person, or null.
 *
 * Scored rather than first-match, because a page often holds several images whose file name contains a
 * common first name. Null is a perfectly good answer and the common one on a page that renders its
 * team from a background image or a canvas.
 */
export function matchPhoto(fullName: string, images: PageImage[]): string | null {
  const parts = fullName.split(/\s+/).filter(Boolean)
  const first = slug(parts[0] ?? "")
  const last = slug(parts[parts.length - 1] ?? "")
  const full = slug(fullName)
  if (!full) return null

  let best: { src: string; score: number } | null = null
  for (const image of images) {
    const altSlug = slug(image.alt)
    const srcSlug = slug(decodeURIComponent(new URL(image.src).pathname))
    let score = 0

    if (altSlug === full) score = 100
    else if (altSlug.includes(full)) score = 95
    else if (srcSlug.includes(full)) score = 90
    else if (first && last && first !== last && srcSlug.includes(`${last}-${first}`)) score = 85
    else if (first && last && first !== last && altSlug.includes(first) && altSlug.includes(last)) score = 80
    else if (last.length >= 4 && srcSlug.includes(last)) score = 60
    // A bare first name in a file name is the weakest signal that is still worth having: `ruben.jpeg`
    // on a five-person agency site is that person. Short names are excluded, being too easy to hit.
    else if (first.length >= 4 && srcSlug.includes(first)) score = 55

    if (score > 0 && (!best || score > best.score)) best = { src: image.src, score }
  }
  return best ? best.src : null
}
