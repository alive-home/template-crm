/**
 * Read the private guides and settings from the database that now owns them.
 *
 * Agents used to open ignored markdown files directly. That worked only on the one machine carrying
 * those files and failed silently in a fresh clone, where an absent guide could be mistaken for a
 * guide with nothing to say. This command makes absence explicit: a missing or unreachable seed is
 * a non-zero refusal naming the command that fills it.
 *
 * The default view is deliberately metadata only. Choosing a slug prints that document's body raw,
 * with no framing around the markdown, so it can replace reading the old file byte for byte.
 *
 * Run: `bun apps/api/scripts/playbook.ts`, `bun apps/api/scripts/playbook.ts <slug>`, or `bun apps/api/scripts/playbook.ts --settings`.
 */
import { query, queryOne } from "../src/crm/turso"

type DocListRow = { doc_id: string; title: string; kind: string; summary: string | null }
type DocBodyRow = { body: string }
type SettingRow = { key: string; value: string; note: string | null }

const SEED_MESSAGE = "The playbook seed has not been run. Run bun apps/api/scripts/seed-turso.ts."

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

async function listDocs(): Promise<DocListRow[]> {
  const rows = await query<DocListRow>("SELECT doc_id, title, kind, summary FROM doc ORDER BY position, title").catch(
    error => {
      const reason = error instanceof Error ? error.message : String(error)
      return fail(`${SEED_MESSAGE} The database could not be read: ${reason}`)
    },
  )
  if (rows.length === 0) fail(SEED_MESSAGE)
  return rows
}

async function printSettings(): Promise<void> {
  const rows = await query<SettingRow>("SELECT key, value, note FROM app_setting ORDER BY key").catch(error => {
    const reason = error instanceof Error ? error.message : String(error)
    return fail(`${SEED_MESSAGE} The database could not be read: ${reason}`)
  })
  if (rows.length === 0) fail(SEED_MESSAGE)
  for (const row of rows) console.log(`${row.key} = ${row.value}${row.note ? `  # ${row.note}` : ""}`)
}

async function main(): Promise<void> {
  if (process.argv.includes("--settings")) {
    await printSettings()
    return
  }

  const slug = process.argv[2]
  if (!slug) {
    const docs = await listDocs()
    for (const doc of docs) console.log(`${doc.doc_id} | ${doc.title} | ${doc.kind} | ${doc.summary ?? ""}`)
    return
  }

  const document = await queryOne<DocBodyRow>("SELECT body FROM doc WHERE doc_id = ?", [slug]).catch(error => {
    const reason = error instanceof Error ? error.message : String(error)
    return fail(`${SEED_MESSAGE} The database could not be read: ${reason}`)
  })
  if (!document) {
    const docs = await listDocs()
    fail(`Unknown playbook slug: ${slug}. Available slugs: ${docs.map(doc => doc.doc_id).join(", ")}`)
  }
  process.stdout.write(document.body)
}

await main()
