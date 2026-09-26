/**
 * The private seed payload at the filesystem boundary.
 *
 * The importer cannot trust a file merely because it sits under `private/`: a half-written JSON
 * document is more likely during a manual transfer than in committed code, and sending its fields
 * to Turso unchecked turns a local typo into durable data. These schemas describe only the transfer
 * envelope. They are not a second model for rows already inside the application.
 */
import { z } from "zod"

export const DocsFile = z.array(
  z.object({
    doc_id: z.string().min(1),
    title: z.string().min(1),
    /**
     * What sort of document this is, so a reader can tell a rule from a finding.
     *
     * A closed set rather than free text: `kind` is what an agent reaches for when it needs "the
     * contract" and must not get an essay instead. Widen it deliberately when a genuinely new sort
     * of document arrives; do not relabel a document to fit the list.
     */
    kind: z.enum(["offer", "contract", "style", "playbook", "method", "craft", "evidence", "strategy"]),
    summary: z.string().nullable(),
    position: z.number().int(),
    file: z.string().min(1),
  }),
)

export const ProspectsFile = z.array(
  z.object({
    domain: z.string().min(1),
    name: z.string().min(1),
    sector: z.string().nullable().optional(),
    why: z.string().nullable().optional(),
  }),
)

const Cluster = z.object({
  cluster_id: z.string().min(1),
  label: z.string().min(1),
  what: z.string().min(1),
  position: z.number().int(),
})

const Route = z.object({
  route_id: z.string().min(1),
  label: z.string().min(1),
  why: z.string().min(1),
  move: z.string().min(1),
  channel_id: z.string().min(1),
  channel_label: z.string().min(1),
  channel_icon: z.string().min(1),
  channel_what: z.string().min(1),
  inbound: z.number().int(),
  is_fallback: z.number().int(),
  position: z.number().int(),
})

const RouteRule = z.object({
  rule_id: z.string().min(1),
  route_id: z.string().min(1),
  field: z.enum(["client", "sector", "who"]),
  pattern: z.string().min(1),
  flags: z.string(),
  position: z.number().int(),
})

export const MarketFile = z.object({
  clusters: z.array(Cluster),
  routes: z.array(Route),
  rules: z.array(RouteRule),
})

export const PipelineFile = z.array(
  z.object({
    title: z.string().min(1),
    position: z.number().int(),
    note: z.string().nullable(),
  }),
)

export const PictureHostsFile = z.array(
  z.object({
    host: z.string().min(1),
    why: z.string().min(1),
  }),
)

export const VoiceRulesFile = z.array(
  z.object({
    rule_id: z.string().min(1),
    kind: z.enum(["assumption", "calendar-ask", "work-in-return", "placeholder"]),
    pattern: z.string().min(1),
    flags: z.string(),
    why: z.string().min(1),
    position: z.number().int(),
  }),
)

export const SettingsFile = z.array(
  z.object({
    key: z.string().min(1),
    value: z.string(),
    note: z.string().nullable(),
  }),
)

export const MarkdownFile = z.string()
