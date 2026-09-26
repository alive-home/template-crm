/**
 * What is actually blocking outbound today, and the one command that addresses it.
 *
 * The run used to open by asking for a queue, which quietly assumed the answer was always "write more
 * mail". It is not. If the configured backlog is sitting unreviewed, another draft is not work, it
 * is inventory. If every P0 has been written to and the P1s have no email address on file, the
 * bottleneck is contact data and drafting around it just spends the good hours on weaker accounts.
 *
 * So this runs first and cheaply: a dozen lines of state, then one BOTTLENECK line and one COMMAND to
 * fix it. The expensive agent downstream reads the answer instead of deriving it, which is both fewer
 * tokens and a more reliable decision, because a threshold in SQL does not have an off day.
 *
 * Run: `bun apps/api/scripts/outbound-state.ts`
 */
import type { InValue } from "@libsql/client"
import { numOr, type Row, textOr } from "../src/crm/row"
import { query, queryOne } from "../src/crm/turso"
import { integerSetting, listSetting, textSetting } from "./settings"

const reviewBacklogLimit = await integerSetting("outbound.review_backlog_limit")
const queueLimit = await integerSetting("outbound.queue_limit")
const liveStages = await listSetting("outbound.live_stages")
const outboundNotePrefix = await textSetting("outbound.note_prefix")
const stages = liveStages.map(() => "?").join(",")
const today = new Date().toISOString().slice(0, 10)

/** One aggregate row, or an empty one. Every column off it is read through a guard, never asserted. */
const one = async (sql: string, args: InValue[] = []): Promise<Row> => (await queryOne<Row>(sql, args)) ?? {}

const review = await one(
  `select count(*) as open,
	        sum(case when deadline_at is not null and substr(deadline_at, 1, 10) < ? then 1 else 0 end) as overdue,
	        min(substr(created_at, 1, 10)) as oldest
	   from task where is_completed = 0 and content_plaintext like 'Review and send outbound%'`,
  [today],
)

/**
 * Coverage per priority band: how many companies carry that score, and how many have already been
 * written to. "Already drafted" is the definition of worked, so the remainder is the real queue.
 */
type Band = { band: string; total: number; drafted: number; in_conversation: number; no_email: number }

const bands = await query<Band>(
  `select case when d.prospect_priority like 'P0%' then 'P0' when d.prospect_priority like 'P1%' then 'P1'
	                      when d.prospect_priority like 'P2%' then 'P2' when d.prospect_priority like 'P3%' then 'P3'
	                      else 'unscored' end as band,
	             count(distinct c.record_id) as total,
	             count(distinct case when exists (select 1 from note n where n.parent_record_id = c.record_id
	                                                and n.title like ?) then c.record_id end) as drafted,
	             count(distinct case when (exists (select 1 from deals dl
	                                                 where dl.associated_company_record_id = c.record_id
	                                                   and dl.stage in (${stages}))
	                                        or exists (select 1 from task t join task_linked_record l on l.task_id = t.task_id
	                                                    where l.target_object = 'companies' and l.target_record_id = c.record_id
	                                                      and t.is_completed = 0)) then c.record_id end) as in_conversation,
	             count(distinct case when not exists (select 1 from people p
	                                                    join people__email_addresses e on e.record_id = p.record_id
	                                                   where p.company_record_id = c.record_id) then c.record_id end) as no_email
	        from companies c
	        join companies__domains dm on dm.record_id = c.record_id and dm.position = 0
	        left join deals d on d.associated_company_record_id = c.record_id
	       where c.name is not null
	    group by band order by band`,
  [`${outboundNotePrefix}%`, ...liveStages],
)

const open = (b: { total: number; drafted: number; in_conversation: number }) => b.total - b.drafted - b.in_conversation
const band = (name: string) => bands.find(b => b.band === name)

const openReviews = numOr(review.open)
const overdueReviews = numOr(review.overdue)

const lines = [
  `OUTBOUND STATE ${today}`,
  `review queue: ${openReviews} open, ${overdueReviews} overdue, oldest ${textOr(review.oldest, "n/a")}`,
]
for (const b of bands) {
  lines.push(
    `${b.band}: ${b.total} scored | ${b.drafted} drafted | ${b.in_conversation} in conversation | ${open(b)} open | ${b.no_email} without an email address`,
  )
}

/**
 * One bottleneck, one command. Order matters: clearing what is already written beats writing more,
 * and working the strongest band beats working a weaker one that happens to be easier.
 */
const next = ["P0", "P1", "P2", "P3", "unscored"].map(band).find(b => b && open(b) > 0)
const backlog = openReviews >= reviewBacklogLimit
const overdue = overdueReviews > 0

const [bottleneck, action, command] = backlog
  ? [
      `${openReviews} drafts are waiting for a human. Writing a ${openReviews + 1}th is inventory, not progress`,
      "Draft nothing today. Report the backlog and the oldest item so it gets reviewed",
      "none",
    ]
  : overdue
    ? [
        `${overdueReviews} review task(s) are past their deadline`,
        "Work the strongest open band, but lead the report with the overdue reviews",
        `bun apps/api/scripts/outbound-queue.ts --limit ${queueLimit} --priority ${next?.band ?? "P0"}`,
      ]
    : next
      ? [
          `${open(next)} companies in ${next.band} have never been written to${next.no_email ? `, ${next.no_email} of them with no email address on file` : ""}`,
          `Work ${next.band}. Do not drop to a weaker band while this one has open accounts`,
          `bun apps/api/scripts/outbound-queue.ts --limit ${queueLimit} --priority ${next.band}`,
        ]
      : [
          "Every scored company has been worked. The bottleneck is upstream: scoring and contact data",
          "Draft nothing. Report which companies need a priority score or an email address",
          "none",
        ]

console.log([...lines, "", `BOTTLENECK: ${bottleneck}`, `ACTION: ${action}`, `COMMAND: ${command}`].join("\n"))
