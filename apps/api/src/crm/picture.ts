/**
 * A person's or a company's picture, as a link to somebody else's server.
 *
 * We store a URL and never a file. That is the cheap part and it is not the risky part: an external
 * image URL rots, and **a dead image on a record looks exactly like a working one** until somebody
 * opens the page. `RecordAvatar` absorbs that at render time by falling back to the favicon and then
 * to initials, so a broken picture is a working state rather than a hole.
 *
 * What cannot be absorbed at render time is a URL that was never going to survive being written down,
 * so that check lives here and runs before anything is stored. One function, shared by the write
 * endpoint and by any script that fills these columns, because a rule enforced in one of the two
 * places is a rule the other one walks around.
 *
 * **It lives in `apps/api`, and that is not a filing preference.** The api image is built from
 * `apps/api` and never sees `apps/web`. This file once started in the client's `src/lib`, the build
 * stayed green because `tsc` and `vite` both read the whole repo, and the container then died on the
 * first boot with `Cannot find module '../src/lib/picture'`. Nothing in `apps/api` may import out of
 * `apps/web`.
 */
import type { PictureHostRule } from "./picture-rules"

/** The columns that hold a picture. Both are plain text columns holding an external URL. */
export const PICTURE_COLUMNS = new Set(["avatar_url", "logo_url"])

/**
 * Why this picture URL cannot be stored, or `null` when it can be.
 *
 * Deliberately permissive about *what* it points at: we cannot tell a portrait from a logo from a cat
 * by reading a URL. It refuses only the two things a string check can actually establish — that it is
 * not a URL we can put in an `src`, and that it is from a host known to expire what it serves.
 */
export function pictureUrlProblem(value: unknown, rules: readonly PictureHostRule[]): string | null {
  if (value === null || value === undefined || value === "") return null
  if (typeof value !== "string") return "a picture must be a URL, as text"

  const url = value.trim()
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return `not a URL: ${url.slice(0, 80)}`
  }

  // An http image on an https page is blocked by the browser and renders as nothing, which is the
  // same silent hole as a dead link.
  if (parsed.protocol !== "https:") return "a picture URL must start with https://"

  const expiring = rules.find(entry => parsed.hostname === entry.host || parsed.hostname.endsWith(`.${entry.host}`))
  if (expiring) return `${expiring.host} links die. ${expiring.why}`

  return null
}
