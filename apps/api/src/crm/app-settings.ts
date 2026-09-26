/**
 * Typed access to application settings in Turso.
 *
 * Settings are memoised for one process so a command sees one coherent rule set. There are no
 * defaults here: a missing commercial threshold is an error carrying both its key and the repair.
 */
import { query } from "./turso"

export type SettingKey =
  | "outbound.note_prefix"
  | "outbound.cooldown_days"
  | "outbound.queue_limit"
  | "outbound.live_stages"
  | "outbound.review_backlog_limit"
  | "outbound.max_words"
  | "outbound.banned_dashes"

type SettingRow = { key: string; value: string }

let loaded: Promise<Map<string, string>> | null = null
const SEED_COMMAND = "bun apps/api/scripts/seed-turso.ts"

/** One table read per process; every getter below shares this promise. */
function settings(): Promise<Map<string, string>> {
  loaded ??= query<SettingRow>("SELECT key, value FROM app_setting").then(
    rows => new Map(rows.map(row => [row.key, row.value])),
  )
  return loaded
}

/** Text exactly as stored. Empty text is a value, not a missing key. */
export async function textSetting(key: SettingKey): Promise<string> {
  let values: Map<string, string>
  try {
    values = await settings()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/no such table/i.test(message)) throw error
    values = new Map()
  }
  const value = values.get(key)
  if (value === undefined) throw new Error(`Missing app setting '${key}'. Run ${SEED_COMMAND}.`)
  return value
}

/** A positive integer, with the key in every refusal. */
export async function integerSetting(key: SettingKey): Promise<number> {
  const raw = await textSetting(key)
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`App setting '${key}' must be a positive integer, got '${raw}'. Run ${SEED_COMMAND}.`)
  }
  return value
}

/** A comma-separated non-empty list. Whitespace around entries is not content. */
export async function listSetting(key: SettingKey): Promise<string[]> {
  const values = (await textSetting(key))
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
  if (values.length === 0) throw new Error(`App setting '${key}' must contain at least one value. Run ${SEED_COMMAND}.`)
  return values
}

/** A JavaScript regex source, compiled once by the caller that asks for it. */
export async function regexSetting(key: SettingKey): Promise<RegExp> {
  const source = await textSetting(key)
  try {
    return new RegExp(source)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`App setting '${key}' is not a valid regular expression: ${reason}. Run ${SEED_COMMAND}.`)
  }
}
