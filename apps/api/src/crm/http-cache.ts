import type { MiddlewareHandler } from "hono"

/**
 * What a CRM read costs on the wire, and what it costs the second time you ask for it.
 *
 * The companies list was 787,341 bytes of JSON and 93,196 once gzipped, so the wire was carrying
 * nine bytes for every one it needed to. Nothing here changes a single response body; it changes how
 * many of them travel and how often.
 */

/** Bodies below this are not worth a compression pass or the header that announces one. */
const MIN_COMPRESS_BYTES = 1024

/** What gzip actually helps with. Images, fonts and archives are already compressed. */
const COMPRESSIBLE = /^(?:text\/|application\/(?:json|javascript|xml|manifest|wasm)|image\/svg)/i

/**
 * Statuses that describe a real read. Anything else must not be labelled cacheable.
 *
 * A 500 can still arrive carrying these headers regardless of what happens here, because Hono's
 * `Context` copies headers from the previous response when a later one replaces it and `app.onError`
 * builds its response above every middleware. `no-cache` is what makes that harmless: the browser
 * has to revalidate before reusing anything, so a stale label cannot turn into a stale read.
 */
function isCacheableRead(method: string, status: number): boolean {
  return method === "GET" && (status === 200 || status === 304)
}

/**
 * Gzip, written against Bun rather than the web stream API.
 *
 * `hono/compress` is the obvious answer and it cannot be used here: it builds a `CompressionStream`,
 * which **Bun 1.2.12 does not define**. Nothing says so until a request arrives — the import
 * resolves, the middleware registers, the server boots clean, and then the first response over a
 * kilobyte dies with `CompressionStream is not defined`, which `app.onError` faithfully returns as a
 * 500 with an ETag on it. The failure looks like a broken API rather than a missing global, so this
 * is a note worth keeping: check the runtime has the primitive before reaching for the middleware.
 *
 * `Bun.gzipSync` is native zlib and buffers, which is the right trade here anyway. Every response
 * this wraps is already assembled in memory — they are JSON built from query results, not streamed
 * files — so there is no stream to preserve and nothing gained by pretending otherwise.
 */
export function gzipResponses(): MiddlewareHandler {
  return async (c, next) => {
    await next()

    const res = c.res
    if (c.req.method === "HEAD" || res.status === 204 || res.status === 304 || res.status === 206) return
    if (res.headers.has("Content-Encoding") || !res.body) return
    if (!COMPRESSIBLE.test(res.headers.get("Content-Type") ?? "")) return
    if (!/\bgzip\b/i.test(c.req.header("Accept-Encoding") ?? "")) return

    const body = new Uint8Array(await res.arrayBuffer())
    if (body.byteLength < MIN_COMPRESS_BYTES) {
      c.res = new Response(body, res)
      return
    }

    const compressed = Bun.gzipSync(body)
    c.res = new Response(compressed, { status: res.status, statusText: res.statusText, headers: res.headers })

    /*
     * Set after the assignment, not before, and that is not a style choice.
     *
     * Hono's `Context` res setter copies every header off the outgoing response onto the replacement
     * one, overwriting as it goes — so anything decided here before the assignment is silently undone
     * by the values it is meant to be correcting. The ETag is the one that shows it: written into the
     * `Headers` up front, the strong tag from the middleware below wins and a gzipped body ships
     * claiming to be byte-identical to the JSON it is not.
     */
    c.res.headers.set("Content-Encoding", "gzip")
    c.res.headers.set("Content-Length", String(compressed.byteLength))
    c.res.headers.append("Vary", "Accept-Encoding")

    // A compressed body is not byte-identical to the one the digest was taken over, which is what a
    // weak validator means. The ETag middleware strips `W/` from both sides when it compares, so the
    // same record set still answers 304 whether or not the client asked for gzip this time.
    const tag = c.res.headers.get("ETag")
    if (tag && !tag.startsWith("W/")) c.res.headers.set("ETag", `W/${tag}`)
  }
}

/**
 * Marks CRM reads as revalidate-every-time, so the ETag beneath can answer 304.
 *
 * **Revalidation, never expiry.** A `max-age` would let the browser serve a CRM list out of its own
 * cache without asking, and a record somebody changed thirty seconds ago would keep rendering the
 * old value with nothing on screen admitting it. `no-cache` is the opposite of what the name
 * suggests: store it, but ask every time. Paired with an ETag the ask costs a couple of hundred
 * bytes and answers 304 when nothing moved, so a revisit is free *and* honest — there is no window
 * in which the screen is knowingly wrong.
 *
 * `private` because all of this is behind the password gate and none of it may land in a shared
 * cache.
 */
export function revalidateReads(): MiddlewareHandler {
  return async (c, next) => {
    await next()

    if (!isCacheableRead(c.req.method, c.res.status)) {
      c.res.headers.delete("Cache-Control")
      return
    }
    c.res.headers.set("Cache-Control", "private, no-cache")
  }
}
