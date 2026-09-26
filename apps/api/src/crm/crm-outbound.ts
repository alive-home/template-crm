import { Hono } from "hono"
import { textSetting } from "./app-settings"
import { query } from "./turso"

/**
 * The outbound drafts feed.
 *
 * The automation writes a touch as a company note carrying the configured prefix and date, plus a
 * review task. That is the right shape for the CRM — the record carries its own history — but it is
 * the wrong shape for reading drafts in a row, which is a mail client's job. This endpoint
 * reassembles them: one row per draft, with the company, message and reasoning that produced it.
 *
 * It reads what the automation already wrote and invents nothing. A note whose body does not parse
 * still comes back, with its raw text as the message — a draft you cannot see is worse than an ugly
 * one, and a silent drop would hide a broken run rather than surface it.
 */

type NoteRow = {
  note_id: string
  created_at: string
  title: string
  content_plaintext: string | null
  company_id: string
  company_name: string | null
  domain: string | null
  logo_url: string | null
}

type TaskRow = {
  task_id: string
  target_record_id: string
  is_completed: number
  deadline_at: string | null
  created_at: string
}

/**
 * Pull the labelled lines out of a note body.
 *
 * The body is written by `apps/api/scripts/outbound-log.ts` in a fixed order, but it is still plain text in a
 * text column — a hand-edited note is a normal thing to find. So every field is optional and the
 * message falls back to the whole body rather than to nothing.
 */
function parse(content: string): {
  signal: string | null
  source: string | null
  priorContact: string | null
  angle: string | null
  channel: string | null
  to: string | null
  needsReview: string | null
  subject: string | null
  body: string
} {
  const field = (label: string): string | null => {
    const match = content.match(new RegExp(`^${label}:[ \\t]*(.+)$`, "m"))
    return match?.[1]?.trim() || null
  }

  // Everything after the Subject line is the message itself, minus the trailing provenance line the
  // logger adds. Splitting on the marker keeps the body intact even when it contains blank lines.
  const afterSubject = content.split(/^Subject:.*$/m)[1] ?? ""
  const body = afterSubject
    .replace(/^\s*Drafted by the outbound automation\..*$/ms, "")
    .replace(/\n\s*Drafted by the outbound automation\..*$/s, "")
    .trim()

  return {
    signal: field("Signal"),
    source: field("Source"),
    // What we had already said to this company. "none" is a real answer and is shown as one.
    priorContact: field("Prior contact"),
    angle: field("Angle"),
    channel: field("Channel"),
    to: field("To"),
    // A draft can name its own blocker: something only the sender can supply, per the draft contract.
    // It is a line in the note rather than a column, because the note is the record.
    needsReview: field("Needs review"),
    subject: field("Subject"),
    body: body || content.trim(),
  }
}

/** The recipient is written as free text ("Name <a@b.com>"); pull an address out when there is one. */
function emailOf(to: string | null): string | null {
  return to?.match(/[\w.+-]+@[\w.-]+\.\w+/)?.[0] ?? null
}

export function crmOutboundRoutes(): Hono {
  const app = new Hono()

  app.get("/outbound", async c => {
    const notePrefix = await textSetting("outbound.note_prefix")
    const notes = await query<NoteRow>(
      `SELECT n.note_id, n.created_at, n.title, n.content_plaintext,
			        c.record_id AS company_id, c.name AS company_name,
			        (SELECT d.value FROM companies__domains d WHERE d.record_id = c.record_id ORDER BY d.position LIMIT 1) AS domain,
			        c.logo_url
			   FROM note n
			   JOIN companies c ON c.record_id = n.parent_record_id
			  WHERE n.parent_object = 'companies' AND n.title LIKE ?
			  ORDER BY n.created_at DESC`,
      [`${notePrefix}%`],
    )

    // The review task is matched by company and creation date: the logger writes note and task in one
    // batch, so same company on the same day is the same touch.
    const tasks = notes.length
      ? await query<TaskRow>(
          `SELECT t.task_id, l.target_record_id, t.is_completed, t.deadline_at, t.created_at
				   FROM task t
				   JOIN task_linked_record l ON l.task_id = t.task_id
				  WHERE l.target_object = 'companies' AND t.content_plaintext LIKE 'Review and send outbound%'`,
        )
      : []

    const drafts = notes.map(note => {
      const day = note.created_at.slice(0, 10)
      const task = tasks.find(t => t.target_record_id === note.company_id && t.created_at.slice(0, 10) === day)
      const parsed = parse(note.content_plaintext ?? "")

      return {
        id: note.note_id,
        createdAt: note.created_at,
        company: { id: note.company_id, name: note.company_name, domain: note.domain, logo: note.logo_url },
        ...parsed,
        email: emailOf(parsed.to),
        task: task ? { id: task.task_id, isCompleted: task.is_completed === 1, deadlineAt: task.deadline_at } : null,
      }
    })

    // One row per day the automation produced something: the run log, derived from its own output
    // rather than from a separate table that could disagree with it.
    const runs = [...new Map(drafts.map(d => [d.createdAt.slice(0, 10), 0])).keys()]
      .sort((a, b) => b.localeCompare(a))
      .slice(0, 14)
      .map(date => ({
        date,
        drafts: drafts.filter(d => d.createdAt.slice(0, 10) === date).length,
        sent: drafts.filter(d => d.createdAt.slice(0, 10) === date && d.task?.isCompleted).length,
      }))

    return c.json({
      drafts,
      runs,
      awaitingReview: drafts.filter(d => !d.task?.isCompleted).length,
    })
  })

  return app
}
