/**
 * Mail from the inbox, mirrored onto the company it belongs to.
 *
 * The CRM knew about notes, tasks, deals and projects, and nothing at all about the one thing a
 * salesperson actually asks first: did they ever write to us, and did we answer. That lived in
 * Gmail, three tabs away, so a company page could look silent while a live thread was running.
 *
 * This is a mirror, not a mail client. It stores the envelope — who, when, subject, snippet, thread
 * — and never the body: enough to see that a conversation exists and to open it, without turning the
 * CRM into a second inbox that goes stale in a different way than the first one.
 *
 * A message is filed against a company by the domain of the counterpart address, which is why it can
 * only ever be as good as `companies__domains`. A message it cannot place is dropped rather than
 * guessed onto the nearest name.
 *
 * The `email_message` table is created by `apps/api/scripts/migrate.ts`, not here. It used to be created on
 * every run, which meant a data-loading script was quietly the thing that defined a table — and a
 * typo in the DDL would have been discovered by whoever ran a sync, not by whoever ran a migration.
 *
 * Run: `bun apps/api/scripts/mail-sync.ts <file.json>` where the file is an array of
 * `{ messageId, threadId, date, from, to, subject, snippet }`. The Gmail search itself happens
 * outside this script, because the inbox is reachable from the assistant and not from the server.
 */
import { z } from "zod"
import { text } from "../src/crm/row"
import { turso } from "../src/crm/turso"

/**
 * The envelope file this script is pointed at. Parsed rather than assumed: it is written by whatever
 * is exporting the mailbox, so a renamed field would otherwise show up as every message being
 * unmatched, which reads as "we have never spoken to any of them".
 */
const Message = z.object({
  messageId: z.string(),
  threadId: z.string(),
  date: z.string(),
  from: z.string(),
  to: z.string(),
  subject: z.string().optional(),
  snippet: z.string().optional(),
})

const MessageFile = z.array(Message)

const file = process.argv[2]
if (!file) throw new Error("usage: bun apps/api/scripts/mail-sync.ts <file.json>")

const client = turso()

/** Domains as the CRM holds them: `https://` prefixes and a stray path are stripped off. */
const rows = await client.execute(
  "select d.value as domain, c.record_id as id from companies__domains d join companies c on c.record_id = d.record_id",
)
const byDomain = new Map<string, string>()
for (const row of rows.rows) {
  const [host] = String(row.domain)
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")
  const domain = host?.toLowerCase()
  const id = text(row.id)
  if (domain && id) byDomain.set(domain, id)
}

/**
 * Our own addresses, so direction is read off the message rather than assumed.
 *
 * `OUR_ADDRESSES` is a comma-separated list of addresses or `@domain` suffixes. These used to be
 * three literals in this line, which put two people's personal mailboxes in the repo; whose inbox is
 * being mirrored is per-install config, not a fact about the code.
 *
 * No default and no empty fallback. An empty pattern matches nothing, every message would read as
 * inbound, and the counterpart would be picked from our own side — a mirror that is quietly wrong
 * about who said what is worse than one that refuses to run.
 */
const patterns = (process.env.OUR_ADDRESSES ?? "")
  .split(",")
  .map(entry => entry.trim())
  .filter(Boolean)

if (patterns.length === 0) {
  throw new Error(
    "OUR_ADDRESSES is not set. It lists our own addresses (e.g. 'me@example.com,@mycompany.com') and " +
      "decides whether a message is inbound. Without it every message reads as incoming.",
  )
}

const OURS = new RegExp(patterns.map(entry => entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i")

const address = (value: string) => (value.match(/[\w.+-]+@[\w.-]+/g) ?? []).map(mail => mail.toLowerCase())
const companyFor = (mail: string) => {
  const host = mail.split("@")[1] ?? ""
  // A subdomain (mail.company.nl) still belongs to the company.
  for (const [domain, id] of byDomain) if (host === domain || host.endsWith(`.${domain}`)) return id
  return null
}

const messages = MessageFile.parse(await Bun.file(file).json())
const now = new Date().toISOString()
let written = 0
let unmatched = 0

for (const message of messages) {
  const senders = address(message.from)
  const recipients = address(message.to)
  const inbound = !OURS.test(message.from)
  // The counterpart is whoever is not us, on whichever side of the message they sit.
  const counterpart = (inbound ? senders : recipients).find(mail => !OURS.test(mail))
  const companyId = counterpart ? companyFor(counterpart) : null

  if (!companyId) {
    unmatched++
    continue
  }

  await client.execute({
    sql: `insert into email_message (message_id, thread_id, company_record_id, direction, from_address,
		        to_address, subject, snippet, sent_at, synced_at)
		      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		      on conflict(message_id) do update set thread_id = excluded.thread_id, subject = excluded.subject,
		        snippet = excluded.snippet, synced_at = excluded.synced_at`,
    args: [
      message.messageId,
      message.threadId,
      companyId,
      inbound ? "inbound" : "outbound",
      message.from,
      message.to,
      message.subject ?? null,
      message.snippet ?? null,
      new Date(message.date).toISOString(),
      now,
    ],
  })
  written++
}

console.log(`filed ${written} messages, ${unmatched} could not be placed on a company and were dropped`)
