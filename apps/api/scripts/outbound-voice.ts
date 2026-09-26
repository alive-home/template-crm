/**
 * The three checks that come from reading the mail as its recipient, not as its sender.
 *
 * Readers were asked what a message like this feels like to receive. They forgave the research and
 * refused the mail anyway, for reasons mechanical enough to catch here rather than hope for in a
 * prompt:
 *
 * - **Nobody may be told how they feel.** A line that opens by naming a state of someone's week
 *   invents it and then leans on it. It reads as empathy and lands as presumption, and it is the kind
 *   of sentence that turns a reader from cool to closed. You may cite what someone published. Their
 *   tiredness, their busyness and their loneliness are not published.
 * - **A first message may not put a task on someone's desk.** "Worth fifteen minutes?" is small to
 *   send and large to receive, twelve times a day. Say the useful thing and let the reply be
 *   voluntary; a question answerable in one line is fine, a calendar is not. An ask that leaves the
 *   reader with finished work whatever they answer is asymmetric in their favour, so the check passes
 *   it when the message actually promises that output. A meeting that only produces a meeting stays
 *   rejected.
 * - **An unfinished draft is never logged.** A bracketed placeholder means the hook was written
 *   before the sender knew what they were offering, which is the whole disease in one artefact.
 */
import { query } from "../src/crm/turso"

export type VoiceRuleKind = "assumption" | "calendar-ask" | "work-in-return" | "placeholder"
export type VoiceRule = { id: string; kind: VoiceRuleKind; pattern: RegExp; why: string }
type VoiceRuleRow = { rule_id: string; kind: string; pattern: string; flags: string; why: string }

export type Finding = { rule: string; why: string; quote: string }

function quoteAround(text: string, index: number): string {
  return text
    .slice(Math.max(0, index - 40), index + 60)
    .replace(/\s+/g, " ")
    .trim()
}

function matchRule(rule: VoiceRule, text: string): RegExpExecArray | null {
  rule.pattern.lastIndex = 0
  return rule.pattern.exec(text)
}

/** Load and compile the recipient's ordered vetoes once for this process. */
export async function loadVoiceRules(): Promise<VoiceRule[]> {
  let rows: VoiceRuleRow[]
  try {
    rows = await query<VoiceRuleRow>(
      "SELECT rule_id, kind, pattern, flags, why FROM voice_rule ORDER BY kind, position, rule_id",
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/no such table/i.test(message)) return []
    throw error
  }

  return rows.map(row => {
    if (!isVoiceRuleKind(row.kind)) {
      throw new Error(`Voice rule '${row.rule_id}' has unknown kind '${row.kind}'`)
    }
    try {
      return { id: row.rule_id, kind: row.kind, pattern: new RegExp(row.pattern, row.flags), why: row.why }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`Voice rule '${row.rule_id}' has an invalid regular expression: ${reason}`)
    }
  })
}

function isVoiceRuleKind(value: string): value is VoiceRuleKind {
  return value === "assumption" || value === "calendar-ask" || value === "work-in-return" || value === "placeholder"
}

/**
 * Read a draft the way its recipient would. Returns everything wrong, not just the first thing,
 * because a rewrite that fixes one line and trips the next check wastes a whole run.
 */
export function readAsRecipient(subject: string, body: string, rules: VoiceRule[]): Finding[] {
  const findings: Finding[] = []
  const whole = `${subject}\n${body}`

  for (const rule of rules.filter(rule => rule.kind === "assumption")) {
    const match = matchRule(rule, whole)
    if (match?.index !== undefined) {
      findings.push({ rule: "assumption about the reader", why: rule.why, quote: quoteAround(whole, match.index) })
    }
  }

  const calendar = rules
    .filter(rule => rule.kind === "calendar-ask")
    .map(rule => ({ rule, match: matchRule(rule, whole) }))
    .find(result => result.match !== null)
  const workInReturn = rules
    .filter(rule => rule.kind === "work-in-return")
    .some(rule => matchRule(rule, whole) !== null)
  if (calendar?.match?.index !== undefined && !workInReturn) {
    findings.push({
      rule: "calendar ask in a first message",
      why: calendar.rule.why,
      quote: quoteAround(whole, calendar.match.index),
    })
  }

  const placeholder = rules
    .filter(rule => rule.kind === "placeholder")
    .map(rule => ({ rule, match: matchRule(rule, whole) }))
    .find(result => result.match !== null)
  if (placeholder?.match?.index !== undefined) {
    findings.push({
      rule: "unfinished draft",
      why: placeholder.rule.why,
      quote: quoteAround(whole, placeholder.match.index),
    })
  }

  return findings
}
