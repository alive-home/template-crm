import { type Client, createClient, type InValue } from "@libsql/client"
import { crmEnv } from "./env"

/**
 * Connection to the hosted CRM database.
 *
 * Both halves of the connection come from the environment and neither has a default. The URL used
 * to be a literal in this file, which named the tenant in every clone of the repo; it is config
 * now. What must not be lost with it is the reason it was a literal: an app that boots against the
 * wrong database looks exactly like an app that lost its data.
 *
 * A default is what would make that possible, so there isn't one. Missing config throws, and the
 * message says which variable is absent rather than falling back to something plausible.
 */
const URL_VAR = "TURSO_DATABASE_URL_CRM"
const TOKEN_VAR = "TURSO_API_KEY_CRM"

let client: Client | null = null

/**
 * The configured URL, written the way the libsql client will actually accept it.
 *
 * Two shapes arrive here that name a perfectly good database and are refused anyway:
 *
 * - **`turso://`**, which is how the vendor's own console and CLI print the connection string. The
 *   client takes `libsql:`, `ws(s):`, `http(s):` and `file:` and nothing else, so a URL pasted
 *   straight from the dashboard dies at the first query with `URL_SCHEME_NOT_SUPPORTED`. It is the
 *   same host over the same protocol under a vendor-branded alias, so the scheme is rewritten.
 * - **Surrounding whitespace**, from a copy that took the trailing newline with it. That one arrives
 *   percent-encoded and fails as `"https://….turso.io%20" cannot be parsed as a URL`, which reads
 *   like a broken database rather than a stray keystroke.
 *
 * Neither is a default and neither invents a target: an absent variable still throws below and names
 * itself. This only accepts *the same database* spelled the way the vendor hands it to you.
 */
function resolvedUrl(): string | undefined {
  const raw = crmEnv.TURSO_DATABASE_URL_CRM?.trim()
  if (!raw) return undefined
  return raw.replace(/^turso:\/\//i, "libsql://")
}

/**
 * Which CRM this process will talk to, for the boot log — `null` when it is not configured.
 *
 * Read on every call rather than captured at import, so it cannot report a value the connection
 * above would not actually use. Boot must be able to say "no CRM configured" out loud: silence
 * there is how you find out at the first request instead of at startup.
 */
export function crmTarget(): string | null {
  return resolvedUrl() ?? null
}

/** Lazily built so importing this module never throws — the failure surfaces on first query. */
export function turso(): Client {
  if (client) return client

  const url = resolvedUrl()
  const authToken = crmEnv.TURSO_API_KEY_CRM?.trim()

  const missing = [!url && URL_VAR, !authToken && TOKEN_VAR].filter(name => name !== false)
  if (!url || !authToken) {
    throw new Error(
      `${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} not set. The CRM lives in Turso and ` +
        "there is no local fallback and no default URL: incomplete config must fail loudly rather than " +
        "serve, or write to, the wrong database.",
    )
  }

  client = createClient({ url, authToken })
  return client
}

/**
 * The single unchecked step between libsql and the typed code above it.
 *
 * A driver hands back rows the type system cannot know the shape of, so *somewhere* a shape has to
 * be taken on the caller's word. This is that somewhere, and it is the only one: `as` is banned
 * repo-wide (`config/biome/no-as.grit`) precisely so this decision is made once, in a named function
 * with this comment on it, rather than in fifty anonymous casts spread through the query layer.
 *
 * It checks nothing and is not meant to. Values read out of a row still go through the guards in
 * `apps/api/src/crm/row.ts`; this only says which columns the query asked for.
 */
const trustShape: <T>(rows: unknown[]) => asserts rows is T[] = () => {}

/**
 * Failures that are about the connection rather than the statement.
 *
 * libsql here is a network client, so a query can fail for reasons that have nothing to do with the
 * SQL: a dropped socket, a gateway blip, an hrana stream the server has since forgotten. Those are
 * worth asking again. A syntax error, a missing column or a constraint violation are the database
 * answering, and asking twice only makes the same answer arrive later.
 */
const TRANSIENT =
  /stream (?:expired|not found)|hrana|websocket|socket|network|fetch failed|econn|etimedout|503|502|504/i

function isTransient(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  // A real SQL complaint carries a code naming it. Those never get a second attempt.
  if ("code" in error && typeof error.code === "string") {
    if (/SQL_INPUT_ERROR|SQLITE_CONSTRAINT|ARGS_INVALID|NOT_FOUND/i.test(error.code)) return false
    if (/STREAM_EXPIRED|SERVER_ERROR|INTERNAL|UNAVAILABLE/i.test(error.code)) return true
  }
  return TRANSIENT.test(error.message)
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Three attempts at a read, backing off, and no attempts at anything else.
 *
 * **Reads only, deliberately.** A retried `SELECT` costs a round trip; a retried `INSERT` can write
 * the row twice, because a connection that dies mid-statement gives no way to tell "never arrived"
 * from "applied, and the acknowledgement was lost". So `execute` below is left bare and a failed
 * write surfaces as a failed write, which the caller can decide about with the context to do it
 * safely. Guessing on the database's behalf is how you get two of something.
 */
async function retryRead<T>(run: () => Promise<T>): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; ; attempt++) {
    try {
      return await run()
    } catch (error) {
      lastError = error
      if (attempt >= 2 || !isTransient(error)) break
      await sleep(100 * 2 ** attempt)
    }
  }
  throw lastError
}

/**
 * Run a query and return typed rows.
 *
 * libsql hands back `Row` objects that are array-like as well as keyed, which serialise to JSON as
 * arrays. Spreading each row into a plain object is what makes `c.json(rows)` return objects.
 */
export async function query<T>(sql: string, args: InValue[] = []): Promise<T[]> {
  const result = await retryRead(() => turso().execute({ sql, args }))
  const rows: unknown[] = result.rows.map(row => ({ ...row }))
  trustShape<T>(rows)
  return rows
}

/** First row, or null. */
export async function queryOne<T>(sql: string, args: InValue[] = []): Promise<T | null> {
  const rows = await query<T>(sql, args)
  return rows[0] ?? null
}

/** Write helper — returns the number of rows the statement touched. Not retried; see `retryRead`. */
export async function execute(sql: string, args: InValue[] = []): Promise<number> {
  const result = await turso().execute({ sql, args })
  return result.rowsAffected
}
