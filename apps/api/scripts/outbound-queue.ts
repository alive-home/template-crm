/**
 * Picks the next companies for an outbound touch, hardest-working accounts first.
 *
 * This is the deterministic half of the outbound loop: *who* is worked today is a SQL decision, not a
 * judgement made in a prompt. The agent that runs after it does the research and the writing.
 *
 * Rules:
 * - **Priority leads.** `prospect_priority` on the deal is the scoring a human already did, so P0 is
 *   worked before P1 and P1 before everything else. Starting at the top of the list every day is the
 *   whole point: an alphabetical queue spends its best attention on whoever begins with A.
 * - A company is due if it has a domain and no outbound note inside the cooldown window. Already
 *   drafted means already worked, so the queue moves down the priority band rather than round again.
 * - **A company already in a conversation is not cold-outbound material.** A deal past Prospect or an
 *   open task means a colleague is mid-thread. Those are withheld and counted, never silently skipped.
 * - Output is a compact brief by default. The agent reading this pays for every token of it, and a
 *   pretty-printed dump of seven objects is a tax on the part of the run that should be thinking.
 *
 * Run: `bun apps/api/scripts/outbound-queue.ts [--limit N] [--cooldown DAYS] [--priority P0,P1] [--json]`
 */
import { numOr, type Row, textColumn, textOr } from "../src/crm/row"
import { query, queryOne, turso } from "../src/crm/turso"
import { integerSetting, listSetting, textSetting } from "./settings"

function arg(name: string): number | null {
  const i = process.argv.indexOf(`--${name}`)
  const value = i === -1 ? Number.NaN : Number(process.argv[i + 1])
  return Number.isFinite(value) && value > 0 ? value : null
}

const limit = arg("limit") ?? (await integerSetting("outbound.queue_limit"))
const cooldownDays = arg("cooldown") ?? (await integerSetting("outbound.cooldown_days"))
const outboundNotePrefix = await textSetting("outbound.note_prefix")
const liveStages = await listSetting("outbound.live_stages")
const asJson = process.argv.includes("--json")
const cutoff = new Date(Date.now() - cooldownDays * 86_400_000).toISOString()

const bandArg = process.argv[process.argv.indexOf("--priority") + 1]
const bands =
  process.argv.includes("--priority") && bandArg ? bandArg.split(",").map(b => b.trim().toUpperCase()) : null

/** Stages that mean somebody is already talking to them. `Prospect` is the only cold stage. */
const stages = liveStages.map(() => "?").join(",")

/** `prospect_priority` is free text, so rank on its prefix rather than the whole label. */
const PRIORITY_RANK = `case
    when d.prospect_priority like 'P0%' then 0 when d.prospect_priority like 'P1%' then 1
    when d.prospect_priority like 'P2%' then 2 when d.prospect_priority like 'P3%' then 3 else 4 end`

const IN_CONVERSATION = `(exists (select 1 from deals dl where dl.associated_company_record_id = c.record_id
                                    and dl.stage in (${stages}))
                          or exists (select 1 from task t join task_linked_record l on l.task_id = t.task_id
                                      where l.target_object = 'companies' and l.target_record_id = c.record_id
                                        and t.is_completed = 0))`

const client = turso()

const companies = await query<Row>(
  `select c.record_id, c.name, c.description, dm.value as domain, c.primary_location_locality as locality,
	             c.primary_location_country_code as country, c.employee_range, c.linkedin,
	             d.prospect_priority as priority, d.outreach_readiness as readiness, d.need, d.next_step,
	             d.prospect_primary_contact as deal_contact, d.prospect_contact_route as route,
	             ${PRIORITY_RANK} as rank
	        from companies c
	        join companies__domains dm on dm.record_id = c.record_id and dm.position = 0
	        left join deals d on d.associated_company_record_id = c.record_id
	       where c.name is not null
	         and not ${IN_CONVERSATION}
	         and coalesce((select max(n.created_at) from note n
	                        where n.parent_object = 'companies' and n.parent_record_id = c.record_id
	                          and n.title like ?), '') < ?
	         ${bands ? `and (${bands.map(() => "d.prospect_priority like ?").join(" or ")})` : ""}
	    order by rank asc,
	             case when d.outreach_readiness like 'Ready%' then 0 else 1 end,
	             (select count(*) from people p where p.company_record_id = c.record_id) > 0 desc,
	             c.created_at desc
	       limit ?`,
  [...liveStages, `${outboundNotePrefix}%`, cutoff, ...(bands?.map(b => `${b}%`) ?? []), limit],
)

const ids = textColumn(companies, "record_id")
const holes = ids.map(() => "?").join(",")

const withheld = numOr(
  (
    await queryOne<Row>(
      `select count(*) as n from companies c where c.name is not null and ${IN_CONVERSATION}`,
      liveStages,
    )
  )?.n,
)

const contacts = ids.length
  ? (
      await client.execute({
        sql: `select p.company_record_id as cid, p.name_full_name as name, p.job_title as title, p.decision_maker as dm,
			             (select e.value from people__email_addresses e where e.record_id = p.record_id order by e.position limit 1) as email
			        from people p where p.company_record_id in (${holes})
			    order by p.decision_maker desc nulls last, p.name_full_name limit 40`,
        args: ids,
      })
    ).rows
  : []

const notes = ids.length
  ? (
      await client.execute({
        sql: `select parent_record_id as cid, title, created_at, substr(replace(content_plaintext, char(10), ' '), 1, 300) as excerpt
			        from note where parent_object = 'companies' and parent_record_id in (${holes})
			    order by created_at desc limit 20`,
        args: ids,
      })
    ).rows
  : []

/** The brief. Plain lines, no JSON scaffolding, because the reader is billed per token. */
function brief(): string {
  const out: (string | null)[] = [
    `QUEUE ${new Date().toISOString().slice(0, 10)} | ${companies.length} due | ${withheld} withheld (in conversation)`,
  ]

  for (const c of companies) {
    const mine = contacts.filter(p => p.cid === c.record_id).slice(0, 4)
    const history = notes.filter(n => n.cid === c.record_id)
    out.push(
      "",
      `## ${c.name} (${c.record_id})`,
      `${c.priority ?? "unscored"} | ${c.readiness ?? "readiness unknown"} | ${c.domain} | ${[c.locality, c.country].filter(Boolean).join(", ") || "location unknown"} | ${c.employee_range ?? "size unknown"}`,
      c.description ? `about: ${c.description}` : "about: nothing on the record",
      c.need ? `need (colleague's research): ${c.need}` : "need: not researched",
      c.next_step ? `next step (written down, execute it): ${c.next_step}` : "next step: none written",
      c.route ? `route: ${c.route}` : null,
      mine.length
        ? `contacts: ${mine.map(p => `${p.name}${p.title ? ` (${p.title})` : ""}${p.email ? ` <${p.email}>` : " <no email>"}${p.dm === 1 ? " [DM]" : ""}`).join("; ")}`
        : `contacts: none on record${c.deal_contact ? `, deal names ${c.deal_contact}` : ""}`,
      history.length
        ? `history: ${history.map(n => `${textOr(n.created_at).slice(0, 10)} ${n.title}: ${n.excerpt}`).join(" || ")}`
        : "history: nothing. Never contacted.",
    )
  }
  return out.filter(l => l !== null).join("\n")
}

console.log(asJson ? JSON.stringify({ companies, contacts, notes, withheld }) : brief())
