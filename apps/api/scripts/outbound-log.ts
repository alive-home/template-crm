/**
 * Writes a researched outbound touch back into the CRM: one note on the company, one review task.
 *
 * The drafting happens in the automation prompt; this is the only thing that touches the database, so
 * every touch lands in the same shape and the CRM stays the record of what was said to whom. Nothing
 * here sends anything. A draft becomes an email when a human sends it — that boundary is the point,
 * because an agent that can both write and send is one bad research hop away from a public mistake.
 *
 * Rules:
 * - **Idempotent per company per day.** A second run on the same date skips a company that already
 *   has today's note rather than stacking duplicates on the record.
 * - **A draft without a signal is rejected.** The whole premise is a reason to reach out *now*; a
 *   message with no cited signal is generic outreach wearing a costume.
 * - **A draft without a `priorContact` finding is rejected.** The queue ships every note, deal and
 *   task we hold on that company, so there is no excuse for a first line that ignores a conversation
 *   we already had. Writing "none" is a valid answer; leaving it blank means nobody looked.
 * - **A draft longer than the configured word cap is rejected.** A cold email that has to be
 *   scrolled does not get read, and the rejection names the current cap.
 * - **A draft is read back as its recipient.** `outbound-voice.ts` rejects a message that tells the
 *   reader how they feel, asks for a slot in their calendar, or still contains a placeholder. Those
 *   three came from readers describing what a message like this feels like to receive.
 * - **A draft containing a dash character is rejected.** Em dashes, en dashes and the double-hyphen
 *   are the loudest tell that a machine wrote a sentence, and no amount of prompt wording has stopped
 *   models reaching for them. So it is a check, not an instruction: the write fails and the run has to
 *   rewrite the sentence with a comma, a full stop or a colon, which is what a person would have typed.
 * - **The source URL is kept in the note.** Every claim in the draft has to be checkable later.
 *
 * Run: `bun apps/api/scripts/outbound-log.ts < drafts.json` (add `--dry` to print without writing).
 * Input: { "drafts": [ { recordId, company, signal, signalSource, priorContact, angle, channel,
 *                        contact?, subject, body, needsReview?, reviewBy? } ] }
 */
import { z } from "zod"
import { textColumn } from "../src/crm/row"
import { turso } from "../src/crm/turso"
import { loadVoiceRules, readAsRecipient } from "./outbound-voice"
import { integerSetting, regexSetting, textSetting } from "./settings"

/**
 * One drafted touch, as it arrives on stdin.
 *
 * Structure only: every field but the record id is optional here, because what a draft *must* say to
 * be worth writing down is decided further below, one draft at a time, with a message that tells the
 * writer what to do about it. A schema that demanded `signal` would reject the batch with an issue
 * path where the loop rejects one draft with a sentence.
 */
const Draft = z.object({
  recordId: z.string(),
  company: z.string().optional(),
  signal: z.string().optional(),
  signalSource: z.string().optional(),
  priorContact: z.string().optional(),
  angle: z.string().optional(),
  channel: z.string().optional(),
  contact: z.string().optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
  needsReview: z.string().optional(),
  reviewBy: z.string().optional(),
})

type Draft = z.infer<typeof Draft>

/** The envelope. A draft that is not even shaped like one is a rejection, not a crashed run. */
const Stdin = z.object({ drafts: z.array(z.unknown()).optional() })

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/** Point at the offending sentence rather than just saying no: the fix has to be obvious. */
function dashContext(text: string, bannedDashes: RegExp): string {
  const at = text.search(bannedDashes)
  if (at < 0) return ""
  return text.slice(Math.max(0, at - 40), at + 40).replace(/\s+/g, " ")
}

const dryRun = process.argv.includes("--dry")
const today = new Date().toISOString().slice(0, 10)
const now = new Date().toISOString()

const input = Stdin.parse(JSON.parse(await Bun.stdin.text()))
const drafts = input.drafts ?? []
if (!drafts.length) {
  console.log("no drafts on stdin — nothing to log")
  process.exit(0)
}

const [outboundNotePrefix, maxWords, bannedDashes, voiceRules] = await Promise.all([
  textSetting("outbound.note_prefix"),
  integerSetting("outbound.max_words"),
  regexSetting("outbound.banned_dashes"),
  loadVoiceRules(),
])
// An empty check would silently certify drafts nobody read. That is worse than no check at all.
if (voiceRules.length === 0) {
  console.error("The recipient voice rules have not been seeded. Run bun apps/api/scripts/seed-turso.ts.")
  process.exit(1)
}

/** Default review deadline: end of the next working day. Outbound goes stale fast. */
function nextWorkingDay(): string {
  const d = new Date()
  do {
    d.setUTCDate(d.getUTCDate() + 1)
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6)
  d.setUTCHours(17, 0, 0, 0)
  return d.toISOString()
}

/** A draft that has cleared the checks below: the fields a note needs are known to be there. */
type CheckedDraft = Draft & { body: string }

function noteBody(draft: CheckedDraft): string {
  const blocker =
    draft.needsReview ?? (draft.contact ? null : "No named contact on the record. Find one before sending.")
  return [
    `Signal: ${draft.signal}`,
    `Source: ${draft.signalSource}`,
    `Prior contact: ${draft.priorContact}`,
    draft.angle ? `Angle: ${draft.angle}` : null,
    `Channel: ${draft.channel ?? "email"}`,
    `To: ${draft.contact ?? "no named contact"}`,
    blocker ? `Needs review: ${blocker}` : null,
    "",
    `Subject: ${draft.subject}`,
    "",
    draft.body.trim(),
    "",
    "Drafted by the outbound automation. Not sent. A human reviews and sends.",
  ]
    .filter(l => l !== null)
    .join("\n")
}

const client = turso()
const title = `${outboundNotePrefix} ${today}`

const existing = new Set(
  textColumn(
    (
      await client.execute({
        sql: "select parent_record_id from note where parent_object = 'companies' and title = ?",
        args: [title],
      })
    ).rows,
    "parent_record_id",
  ),
)

let written = 0
let skipped = 0
const rejected: string[] = []

for (const raw of drafts) {
  const parsed = Draft.safeParse(raw)
  if (!parsed.success) {
    rejected.push(`a draft is not shaped like one: ${parsed.error.issues.map(i => i.path.join(".")).join(", ")}`)
    continue
  }
  const label = parsed.data.company ?? parsed.data.recordId

  const body = parsed.data.body?.trim()
  if (!parsed.data.signal?.trim() || !parsed.data.signalSource?.trim() || !body) {
    rejected.push(`${label}: missing recordId, signal, source or body`)
    continue
  }
  const draft: CheckedDraft = { ...parsed.data, body }
  if (!draft.priorContact?.trim()) {
    rejected.push(
      `${label}: no priorContact. Read the company's notes, deals and tasks in the queue output and say what you found, or write "none" if we have never spoken.`,
    )
    continue
  }

  const findings = readAsRecipient(draft.subject ?? "", draft.body, voiceRules)
  if (findings.length) {
    for (const f of findings) rejected.push(`${label}: ${f.rule}. ${f.why}: "…${f.quote}…"`)
    continue
  }

  const words = wordCount(draft.body)
  if (words > maxWords) {
    rejected.push(
      `${label}: body is ${words} words, the ceiling is ${maxWords}. Cut it to the signal, one idea and the ask.`,
    )
    continue
  }

  const dashed = [
    { field: "subject", text: draft.subject ?? "" },
    { field: "body", text: draft.body },
  ].find(part => bannedDashes.test(part.text))
  if (dashed) {
    rejected.push(
      `${label}: dash character in the ${dashed.field}. Rewrite with a comma, a full stop or a colon: "…${dashContext(dashed.text, bannedDashes)}…"`,
    )
    continue
  }
  if (existing.has(draft.recordId)) {
    skipped++
    continue
  }

  if (dryRun) {
    console.log(`+ ${label}\n${noteBody(draft)}\n`)
    written++
    continue
  }

  const taskId = crypto.randomUUID()
  await client.batch([
    {
      sql: `insert into note (note_id, parent_object, parent_record_id, title, content_plaintext, created_at)
			      values (?, 'companies', ?, ?, ?, ?)`,
      args: [crypto.randomUUID(), draft.recordId, title, noteBody(draft), now],
    },
    {
      sql: "insert into task (task_id, content_plaintext, is_completed, deadline_at, created_at) values (?, ?, 0, ?, ?)",
      args: [
        taskId,
        `Review and send outbound to ${label}${draft.contact ? ` (${draft.contact})` : ""}: ${draft.signal}`,
        draft.reviewBy ?? nextWorkingDay(),
        now,
      ],
    },
    {
      sql: "insert into task_linked_record (task_id, target_object, target_record_id) values (?, 'companies', ?)",
      args: [taskId, draft.recordId],
    },
  ])
  written++
  existing.add(draft.recordId)
}

console.log(`${dryRun ? "would log" : "logged"} ${written} drafts, skipped ${skipped} already touched today`)
for (const r of rejected) console.log(`rejected: ${r}`)
// A rejected draft is a failed run, not a footnote: exit non-zero so the automation reports it.
if (rejected.length) process.exit(1)
