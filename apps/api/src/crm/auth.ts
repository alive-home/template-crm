import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import { Hono, type MiddlewareHandler } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import { crmEnv } from "./env"
import { loginPage } from "./login-page"

/**
 * One password in front of everything.
 *
 * The CRM holds companies and people with their email addresses and phone numbers, served from a
 * machine on the public internet. There is no user table and no reason to build one — a single
 * shared password held as a platform secret is the whole model.
 *
 * Two properties are deliberate:
 *
 * - **It fails closed in production.** `CRM_PASSWORD` has no default, exactly like the two Turso
 *   variables, and a production deploy without it serves nothing at all rather than serving the
 *   records to anyone who loads the page. A gate that quietly disables itself when its secret goes
 *   missing is not a gate. Locally there is no secret and no gate: dev binds to localhost.
 * - **The session is signed with the password itself.** No second secret to set, and rotating the
 *   password signs everyone out, which is the thing you actually want a rotation to do.
 */

const COOKIE = "crm_session"
const PASSWORD_VAR = "CRM_PASSWORD"
const SESSION_DAYS = 30

/** The sentence the API answers with, which `fetchApi` surfaces verbatim. */
const EXPIRED = "Session expired. Sign in again."

function configuredPassword(): string | undefined {
  const value = crmEnv.CRM_PASSWORD
  return value !== undefined && value.length > 0 ? value : undefined
}

const isProduction = () => crmEnv.NODE_ENV === "production"

/** Compared as digests so the fixed length carries no information about the real password. */
function matches(supplied: string, secret: string): boolean {
  const left = createHash("sha256").update(supplied).digest()
  const right = createHash("sha256").update(secret).digest()
  return timingSafeEqual(left, right)
}

function sign(expiresAt: number, secret: string): string {
  return createHmac("sha256", secret).update(String(expiresAt)).digest("hex")
}

function signedIn(cookie: string | undefined, secret: string): boolean {
  const [expiresRaw, signature] = (cookie ?? "").split(".")
  if (!expiresRaw || !signature) return false

  const expiresAt = Number(expiresRaw)
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false

  const expected = Buffer.from(sign(expiresAt, secret))
  const given = Buffer.from(signature)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

/**
 * Where to go after signing in.
 *
 * Only a path on this host: `next=https://elsewhere.example` would turn the login form into an open
 * redirect, and a login form is precisely the page a phishing link wants to borrow.
 */
function safeNext(value: string | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/"
  return value
}

/** Five wrong guesses buys a ten-minute pause. One password on a public URL is worth guessing at. */
const failures = new Map<string, { count: number; until: number }>()
const LOCK_MS = 10 * 60 * 1000

/**
 * The client, as the web image's nginx names it: it sets `X-Real-IP` from the connection, over
 * whatever the caller sent, so the key cannot be forged to dodge the pause. Behind another proxy (a
 * hosting edge) that connection is the proxy, and without nginx (Vite in dev) every caller is
 * "unknown": one shared counter, where five wrong guesses pause sign-in for everyone. That is the
 * failure to prefer over a header a guesser can rotate for unlimited attempts.
 */
function clientKey(header: string | undefined): string {
  return header ?? "unknown"
}

function lockedOut(key: string): boolean {
  const entry = failures.get(key)
  if (!entry) return false
  if (entry.until < Date.now()) {
    failures.delete(key)
    return false
  }
  return entry.count >= 5
}

function recordFailure(key: string): void {
  const entry = failures.get(key)
  const count = entry && entry.until > Date.now() ? entry.count + 1 : 1
  failures.set(key, { count, until: Date.now() + LOCK_MS })
}

/**
 * The gate itself.
 *
 * `/health` stays open because a health checker cannot sign in, and it answers `{ ok: true }` about the
 * process rather than anything out of the database.
 */
export function crmAuth(): MiddlewareHandler {
  return async (c, next) => {
    const path = c.req.path
    if (path === "/health") return next()

    const secret = configuredPassword()
    if (!secret) {
      if (!isProduction()) return next()
      return c.json({ error: `${PASSWORD_VAR} is not set, so this deployment serves nothing.` }, 503)
    }

    if (path === "/login" || path === "/logout") return next()
    if (signedIn(getCookie(c, COOKIE), secret)) return next()

    // An API caller gets the sentence; a browser gets the door. oRPC is an API caller: a redirect
    // would hand its fetch the login page's HTML to parse.
    if (path.startsWith("/api/") || path.startsWith("/rpc/")) return c.json({ error: EXPIRED }, 401)
    return c.redirect(`/login?next=${encodeURIComponent(path)}`, 302)
  }
}

/** `/login` and `/logout`. Mounted at the root, and reached before the gate lets anything else past. */
export function authRoutes(): Hono {
  const routes = new Hono()

  routes.get("/login", c => {
    const secret = configuredPassword()
    if (secret && signedIn(getCookie(c, COOKIE), secret)) return c.redirect(safeNext(c.req.query("next")), 302)
    return c.html(loginPage({ next: safeNext(c.req.query("next")) }))
  })

  routes.post("/login", async c => {
    const secret = configuredPassword()
    if (!secret) return c.redirect("/", 302)

    const body = await c.req.parseBody()
    const supplied = body.password
    const next = safeNext(typeof body.next === "string" ? body.next : undefined)
    const key = clientKey(c.req.header("x-real-ip"))

    if (lockedOut(key)) {
      return c.html(loginPage({ next, error: "Too many attempts. Try again in ten minutes." }), 429)
    }

    if (typeof supplied !== "string" || !matches(supplied, secret)) {
      recordFailure(key)
      return c.html(loginPage({ next, error: "That password is not right." }), 401)
    }

    failures.delete(key)
    const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
    setCookie(c, COOKIE, `${expiresAt}.${sign(expiresAt, secret)}`, {
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: isProduction(),
      maxAge: SESSION_DAYS * 24 * 60 * 60,
    })

    return c.redirect(next, 302)
  })

  routes.post("/logout", c => {
    deleteCookie(c, COOKIE, { path: "/" })
    return c.redirect("/login", 302)
  })

  return routes
}
