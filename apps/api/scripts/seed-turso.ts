/**
 * Transfer a private playbook payload into the tables declared by the CRM skeleton.
 *
 * The repository must know how to store and import this material without knowing any of the
 * material itself. Every title, rule, setting and document body therefore comes from the source
 * directory. The default lives under gitignored `private/`, while `--from` makes the same importer
 * usable for a payload restored somewhere else.
 *
 * A transfer is allowed to be partial. One damaged file is named and refused while independent
 * files still produce their plans; a missing source directory is the only hard stop. Every row is
 * an upsert and no statement deletes anything. `--dry-run` builds and prints the complete plan
 * without asking the Turso module for a client, which makes the importer verifiable offline.
 *
 * Run: `bun apps/api/scripts/seed-turso.ts [--from <dir>] [--dry-run]`
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { resolve, sep } from "node:path"
import type { InValue } from "@libsql/client"
import type { ZodType } from "zod"
import { execute } from "../src/crm/turso"
import {
  DocsFile,
  MarkdownFile,
  MarketFile,
  PictureHostsFile,
  PipelineFile,
  ProspectsFile,
  SettingsFile,
  VoiceRulesFile,
} from "./seed-turso-shapes"

const TABLES = [
  "doc",
  "app_setting",
  "prospect_candidate",
  "market_cluster",
  "market_route",
  "market_route_rule",
  "pipeline_stage",
  "picture_host_rule",
  "voice_rule",
] as const

type TableName = (typeof TABLES)[number]
type PlannedStatement = { table: TableName; sql: string; args: InValue[] }
type Summary = { read: number; written: number; planned: number }

const dryRun = process.argv.includes("--dry-run")
const plans: PlannedStatement[] = []
const summaries = new Map<TableName, Summary>(TABLES.map(table => [table, { read: 0, written: 0, planned: 0 }]))

function sourceDirectory(): string {
  const position = process.argv.indexOf("--from")
  if (position === -1) return resolve("private/turso-seed")
  const value = process.argv[position + 1]
  if (!value || value.startsWith("--")) throw new Error("--from requires a source directory")
  return resolve(value)
}

function summaryFor(table: TableName): Summary {
  const summary = summaries.get(table)
  if (!summary) throw new Error(`missing summary for ${table}`)
  return summary
}

function add(table: TableName, sql: string, args: InValue[]): void {
  plans.push({ table, sql, args })
  const summary = summaryFor(table)
  summary.read++
  summary.planned++
}

function refusal(file: string, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error)
  console.error(`refused ${file}: ${reason}`)
}

function readJson<T>(root: string, file: string, schema: ZodType<T>): T | null {
  const path = resolve(root, file)
  try {
    return schema.parse(JSON.parse(readFileSync(path, "utf8")))
  } catch (error) {
    refusal(file, error)
    return null
  }
}

function timestamp(path: string): string {
  return statSync(path).mtime.toISOString()
}

function readDocument(root: string, file: string): { body: string; updatedAt: string } | null {
  const path = resolve(root, file)
  if (!path.startsWith(`${root}${sep}`)) {
    refusal(file, "document path leaves the source directory")
    return null
  }
  try {
    return { body: MarkdownFile.parse(readFileSync(path, "utf8")), updatedAt: timestamp(path) }
  } catch (error) {
    refusal(file, error)
    return null
  }
}

function loadDocs(root: string): void {
  const rows = readJson(root, "docs.json", DocsFile)
  if (!rows) return
  for (const row of rows) {
    const document = readDocument(root, row.file)
    if (!document) continue
    add(
      "doc",
      `insert into doc (doc_id, title, kind, body, summary, position, updated_at) values (?, ?, ?, ?, ?, ?, ?)
       on conflict(doc_id) do update set title = excluded.title, kind = excluded.kind, body = excluded.body,
       summary = excluded.summary, position = excluded.position, updated_at = excluded.updated_at`,
      [row.doc_id, row.title, row.kind, document.body, row.summary, row.position, document.updatedAt],
    )
  }
}

function loadProspects(root: string): void {
  const rows = readJson(root, "prospects.json", ProspectsFile)
  if (!rows) return
  const addedAt = timestamp(resolve(root, "prospects.json"))
  for (const row of rows) {
    add(
      "prospect_candidate",
      `insert into prospect_candidate (domain, name, sector, why, added_at) values (?, ?, ?, ?, ?)
       on conflict(domain) do update set name = excluded.name, sector = excluded.sector, why = excluded.why,
       added_at = excluded.added_at`,
      [row.domain, row.name, row.sector ?? null, row.why ?? null, addedAt],
    )
  }
}

function loadMarket(root: string): void {
  const market = readJson(root, "market.json", MarketFile)
  if (!market) return
  for (const row of market.clusters) {
    add(
      "market_cluster",
      `insert into market_cluster (cluster_id, label, what, position) values (?, ?, ?, ?)
       on conflict(cluster_id) do update set label = excluded.label, what = excluded.what, position = excluded.position`,
      [row.cluster_id, row.label, row.what, row.position],
    )
  }
  for (const row of market.routes) {
    add(
      "market_route",
      `insert into market_route (route_id, label, why, move, channel_id, channel_label, channel_icon,
       channel_what, inbound, is_fallback, position) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(route_id) do update set label = excluded.label, why = excluded.why, move = excluded.move,
       channel_id = excluded.channel_id, channel_label = excluded.channel_label,
       channel_icon = excluded.channel_icon, channel_what = excluded.channel_what, inbound = excluded.inbound,
       is_fallback = excluded.is_fallback, position = excluded.position`,
      [
        row.route_id,
        row.label,
        row.why,
        row.move,
        row.channel_id,
        row.channel_label,
        row.channel_icon,
        row.channel_what,
        row.inbound,
        row.is_fallback,
        row.position,
      ],
    )
  }
  for (const row of market.rules) {
    add(
      "market_route_rule",
      `insert into market_route_rule (rule_id, route_id, field, pattern, flags, position) values (?, ?, ?, ?, ?, ?)
       on conflict(rule_id) do update set route_id = excluded.route_id, field = excluded.field,
       pattern = excluded.pattern, flags = excluded.flags, position = excluded.position`,
      [row.rule_id, row.route_id, row.field, row.pattern, row.flags, row.position],
    )
  }
}

function loadSimpleFiles(root: string): void {
  const pipeline = readJson(root, "pipeline.json", PipelineFile)
  for (const row of pipeline ?? []) {
    add(
      "pipeline_stage",
      `insert into pipeline_stage (title, position, note) values (?, ?, ?)
       on conflict(title) do update set position = excluded.position, note = excluded.note`,
      [row.title, row.position, row.note],
    )
  }
  const hosts = readJson(root, "picture-hosts.json", PictureHostsFile)
  for (const row of hosts ?? []) {
    add(
      "picture_host_rule",
      `insert into picture_host_rule (host, why) values (?, ?)
       on conflict(host) do update set why = excluded.why`,
      [row.host, row.why],
    )
  }
  const rules = readJson(root, "voice-rules.json", VoiceRulesFile)
  for (const row of rules ?? []) {
    add(
      "voice_rule",
      `insert into voice_rule (rule_id, kind, pattern, flags, why, position) values (?, ?, ?, ?, ?, ?)
       on conflict(rule_id) do update set kind = excluded.kind, pattern = excluded.pattern,
       flags = excluded.flags, why = excluded.why, position = excluded.position`,
      [row.rule_id, row.kind, row.pattern, row.flags, row.why, row.position],
    )
  }
  const settings = readJson(root, "settings.json", SettingsFile)
  for (const row of settings ?? []) {
    add(
      "app_setting",
      `insert into app_setting (key, value, note) values (?, ?, ?)
       on conflict(key) do update set value = excluded.value, note = excluded.note`,
      [row.key, row.value, row.note],
    )
  }
}

async function main(): Promise<void> {
  const root = sourceDirectory()
  if (!existsSync(root) || !statSync(root).isDirectory())
    throw new Error(`seed source directory does not exist: ${root}`)

  loadDocs(root)
  loadProspects(root)
  loadMarket(root)
  loadSimpleFiles(root)

  if (dryRun) {
    for (const plan of plans) {
      console.log(`[${plan.table}] ${plan.sql};`)
      console.log(`args: ${JSON.stringify(plan.args)}\n`)
    }
  } else {
    for (const plan of plans) {
      summaryFor(plan.table).written += await execute(plan.sql, plan.args)
    }
  }

  console.log(dryRun ? "DRY RUN: no connection opened and nothing executed." : "Seed complete.")
  for (const table of TABLES) {
    const summary = summaryFor(table)
    console.log(`${table}: ${summary.read} rows read, ${summary.written} rows written, ${summary.planned} planned`)
  }
}

await main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
