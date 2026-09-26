import { RPCHandler } from "@orpc/server/fetch"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { etag } from "hono/etag"
import { logger } from "hono/logger"
import { authRoutes, crmAuth } from "./crm/auth.ts"
import { crmDocRoutes } from "./crm/crm-docs.ts"
import { crmRoutes } from "./crm/crm-routes.ts"
import { gzipResponses, revalidateReads } from "./crm/http-cache.ts"
import { crmTarget } from "./crm/turso.ts"
import { env } from "./env.ts"
import { appRouter } from "./router.ts"

/**
 * The API server: the CRM's routes over Turso, the password gate in front of them, and the oRPC
 * handler. It seeds nothing and stores nothing. The web app is served elsewhere (Vite in dev, nginx
 * in the image, static files when Alive publishes it), and reaches this process through a proxy on
 * `/api`, `/login`, `/logout` and `/rpc`.
 */

// The CRM does not live here. It is a hosted Turso database — relational, one column per attribute —
// and it is the system of record.
console.log(`CRM: ${crmTarget() ?? "not configured — TURSO_DATABASE_URL_CRM is unset, /api/crm/* will fail"}`)

const app = new Hono()

app.use("*", logger())
app.use(
  "*",
  cors({
    origin: env.WEB_BASE_URL,
    allowHeaders: ["Content-Type", "Authorization"],
  }),
)

/**
 * Gzip, above everything, including the gate.
 *
 * This was simply missing, and it was the single largest thing wrong with the app: `/api/crm/companies`
 * answered 787,341 bytes to a request that said `Accept-Encoding: gzip`, where the same body gzips to
 * 93,196. CRM JSON is mostly repeated column names and nulls — 76% of the fields in that response are
 * empty — which is the shape gzip is best at, so this is an 89% cut with no behaviour change.
 *
 * It is registered above the ETag below it on purpose. Hono runs the first-registered middleware
 * outermost, so the digest is taken over the *uncompressed* body and this re-labels it `W/` on the
 * way out. That ordering is what keeps one ETag per record set; the other way round, the same rows
 * under two encodings would be two different tags.
 */
app.use("*", gzipResponses())

app.get("/health", c => c.json({ ok: true }))

/**
 * The password gate, registered before anything it protects.
 *
 * Order is the whole of it. Hono runs middleware in the order it is added, so this sits above
 * `/api/crm` and `/rpc`: no record leaves this process before signing in. The client bundle is not
 * served from here, so it is not behind this gate; it holds no records, and its first API call
 * answers 401, which `fetchApi` turns into a trip to `/login`.
 */
app.use("*", crmAuth())
app.route("/", authRoutes())

/**
 * A thrown error still answers in the `{ error }` shape the routes use deliberately.
 *
 * Without this, missing CRM config reached the browser as a bare "Internal Server Error": the
 * connection throws a sentence naming the variable that is unset, and Hono's default handler
 * dropped it. That is the same failure the routes refuse to commit when they reject an unknown
 * field with a 400 rather than a silent no-op, and `fetchApi` is already written to read it.
 */
app.onError((err, c) => c.json({ error: err.message }, 500))

/**
 * A repeat read costs a 304, not the records again.
 *
 * These lists are re-fetched constantly — every navigation back to a list, every mutation that
 * invalidates one — and the overwhelming majority of those reads return exactly what the browser
 * already has. The ETag turns that into a couple of hundred bytes. It sits below the gate, so an
 * unauthenticated request is still refused and never a 304 that would hand a signed-out browser
 * its own cached records back.
 *
 * `revalidateReads` is outside `etag` so it can label the 304 as well as the 200 — see http-cache.ts.
 */
app.use("/api/crm/*", revalidateReads())
app.use("/api/crm/*", etag())

// Literal playbook paths are registered before the generic `/:object` CRM routes.
app.route("/api/crm", crmDocRoutes())
app.route("/api/crm", crmRoutes())

const rpcHandler = new RPCHandler(appRouter)

app.use("/rpc/*", async (c, next) => {
  const { matched, response } = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context: { headers: c.req.raw.headers },
  })
  if (matched) return c.newResponse(response.body, response)
  await next()
})

export default {
  port: env.PORT,
  fetch: app.fetch,
}

console.log(`api → ${env.API_BASE_URL} (port ${env.PORT})`)
