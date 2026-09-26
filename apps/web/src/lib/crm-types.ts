/**
 * Shapes returned by the CRM API in `apps/api/src/crm/crm-routes.ts`.
 *
 * Records are deliberately loosely typed. The database has 164 attribute columns across seven
 * objects and the set is not fixed — writing an interface per object here would be a second copy of
 * the schema that silently rots the moment a column is added in Turso. The attribute *catalog*
 * (`CrmAttribute`) is fetched instead, so the UI renders what the database actually has.
 */

export const CRM_OBJECTS = [
  "companies",
  "people",
  "deals",
  "projects",
  "customer_feedback",
  "users",
  "workspaces",
] as const

export type CrmObject = (typeof CRM_OBJECTS)[number]

/** Is this string one of the seven objects? The check every route param and every ref goes through. */
export function isCrmObject(value: string): value is CrmObject {
  return CRM_OBJECTS.some(object => object === value)
}

/** A link to another record, as returned inside multi-value reference fields. */
export type CrmRef = { id: string; object: CrmObject; label: string | null }

/**
 * Is this value a reference to another record?
 *
 * The API returns loosely-typed columns, so a reference is recognised by its shape rather than by a
 * declared type. Both halves are checked: an id with an object slug this CRM does not have would
 * otherwise become a link to a page that cannot exist.
 */
export function isCrmRef(value: unknown): value is CrmRef {
  if (typeof value !== "object" || value === null) return false
  if (!("id" in value) || !("object" in value)) return false
  if (typeof value.id !== "string" || typeof value.object !== "string") return false
  return isCrmObject(value.object)
}

/** A row: every column of the underlying table, plus a resolved label and its collections. */
export type CrmRecord = Record<string, unknown> & {
  record_id: string
  label: string | null
  noteCount?: number
}

/**
 * One page of a list, and how many rows there are behind it.
 *
 * The list endpoint used to answer with a bare array, which is fine right up to the point where it
 * stops returning everything — and then a page of a hundred is indistinguishable from a complete
 * list of a hundred. `total` is what lets the grid say what it is not showing.
 */
export type CrmPage = { rows: CrmRecord[]; total: number; limit: number; offset: number }

export type CrmNote = { id: string; title: string | null; content: string | null; createdAt: string }

export type CrmTask = {
  id: string
  content: string | null
  isCompleted: boolean
  deadlineAt: string | null
  createdAt?: string
  record?: CrmRef | null
}

/** Work delivered at this company, whoever delivered it. Backlinked from `projects`. */
export type CrmProject = {
  id: string
  name: string | null
  status: string | null
  stack: string | null
  notes: string | null
}

export type CrmRecordDetail = CrmRecord & { notes: CrmNote[]; tasks: CrmTask[]; projects?: CrmProject[] }

/**
 * One drafted outbound email, reassembled from the note the automation wrote.
 *
 * Every field except `id`, `createdAt`, `company` and `body` is nullable on purpose: the note is
 * plain text and may have been hand-edited, so the page renders what is there rather than assuming
 * the automation's exact shape.
 */
export type OutboundDraft = {
  id: string
  createdAt: string
  company: { id: string; name: string | null; domain: string | null; logo: string | null }
  signal: string | null
  source: string | null
  priorContact: string | null
  angle: string | null
  channel: string | null
  to: string | null
  needsReview: string | null
  subject: string | null
  body: string
  email: string | null
  task: { id: string; isCompleted: boolean; deadlineAt: string | null } | null
}

export type OutboundFeed = {
  drafts: OutboundDraft[]
  runs: { date: string; drafts: number; sent: number }[]
  awaitingReview: number
}

export type CrmAttribute = {
  slug: string
  title: string | null
  type: string
  isSystem: boolean
  isMultiselect: boolean
  options: string[]
}

export type CrmSchema = { object: CrmObject; singular: string; attributes: CrmAttribute[] }

/**
 * The overview aggregate from `apps/api/src/crm/crm-summary.ts`.
 *
 * Counted in SQL rather than in the browser — the alternative is fetching every deal so the client
 * can add up a column. Breakdown lists are already sorted and already have their long tail folded
 * into an "Other" row, so the page renders them in the order it receives them.
 */
export type CrmSummary = {
  source: string
  objects: { object: CrmObject; singular: string; count: number }[]
  notes: number
  tasks: number
  openTasks: number
  overdueTasks: number
  coverage: { deals: number; withNextStep: number; withCompany: number }
  revenue: { committed: number; paid: number; outstanding: number }
  stages: { stage: string; count: number; committed: number }[]
  priorities: { name: string; count: number }[]
  readiness: { name: string; count: number }[]
  recentNotes: { id: string; title: string | null; createdAt: string | null; record: CrmRef | null }[]
  upcomingTasks: { id: string; content: string | null; deadlineAt: string | null }[]
}

/** Plural display name per object, for nav and headings. */
export const OBJECT_LABELS: Record<CrmObject, string> = {
  companies: "Companies",
  people: "People",
  deals: "Deals",
  projects: "Projects",
  customer_feedback: "Feedback",
  users: "Users",
  workspaces: "Workspaces",
}

/**
 * Columns worth showing in a list, per object, in order.
 *
 * Chosen from what the database actually *has*, not from what the schema allows: every column below
 * is filled on a meaningful share of that object's rows. A column that is null on 95% of records is
 * a column of em-dashes, and it costs the width that tells one row from another. The rest of the
 * sixty-odd columns stay on the record page, where you are looking at one thing.
 *
 * `created_at` is last on every object on purpose. It is the one column that means the same thing
 * everywhere — when this row arrived — so it reads as a consistent right-hand edge rather than
 * something you hunt for in a different place per list.
 */
export const LIST_COLUMNS: Record<CrmObject, string[]> = {
  // Size and founding year are only known for some companies, but "unknown" is a
  // fact worth seeing next to a lead, and both sort — so the gaps cluster instead of hiding.
  companies: [
    "label",
    "domains",
    "categories",
    "primary_location_locality",
    "employee_range",
    "foundation_date",
    "alive_time_saved_score",
    "deals",
    "created_at",
  ],
  // `company` is resolved server-side from `company_record_id`; the raw column is a UUID.
  people: ["label", "job_title", "company", "emailAddresses", "decision_maker", "deals", "created_at"],
  // The widest list, because deals carry the most decided-on fields: the prospect research block is
  // filled on nearly every deal and it is what you actually sort and triage by.
  deals: [
    "label",
    "company",
    "stage",
    "prospect_priority",
    "outreach_readiness",
    "prospect_segment",
    "next_step",
    "revenue_status",
    "alive_time_saved_score",
    "created_at",
  ],
  projects: ["label", "domain", "status", "hosting", "tech_stack", "created_at"],
  customer_feedback: ["label", "temperature", "what", "spotted_at", "acted_on", "tags", "created_at"],
  users: ["label", "primary_email_address", "product_status", "workspaces", "created_at"],
  workspaces: ["label", "users", "created_at"],
}

/**
 * Headings that read better than the column name does.
 *
 * Only where the derived label is wrong or clumsy — `next_step` already becomes "Next step" on its
 * own, and a map entry for it would be a second place to keep the same string.
 */
const COLUMN_LABELS: Record<string, string> = {
  created_at: "Added",
  alive_time_saved_score: "Time saved",
  primary_location_locality: "Location",
  prospect_location: "Location",
  employee_range: "Size",
  foundation_date: "Founded",
  emailAddresses: "Email",
  primary_email_address: "Email",
  prospect_priority: "Priority",
  outreach_readiness: "Readiness",
  prospect_segment: "Segment",
  revenue_status: "Revenue",
  product_status: "Status",
  spotted_at: "Spotted",
  tech_stack: "Stack",
}

/** Columns that are plumbing, never worth rendering as a field on a record page. */
export const HIDDEN_FIELDS = new Set([
  "record_id",
  "label",
  "noteCount",
  "notes",
  "tasks",
  // Delivered work is its own panel on the record page. Left in the field list it renders as the
  // string "[object Object]", which is a value nobody can read and a fact nobody can check.
  "projects",
  "created_by_actor_id",
  "created_by_actor_type",
  "alive_source_key",
  "alive_source_ids",
  "alive_source_id",
  // The full name is the page title already, and first/last are the parts it was built from.
  "name_full_name",
])

/**
 * Plumbing columns, hidden by pattern rather than by name.
 *
 * `company_record_id` is a UUID and `company_target_object` is the word "companies" — neither is a
 * fact about the person, and the resolved `company` reference says the same thing readably. Showing
 * them made the record page look like a database dump, which is what it was.
 */
const PLUMBING = /(_record_id|_target_object|_actor_id|_actor_type|_currency_code)$/

export function isPlumbing(slug: string): boolean {
  return HIDDEN_FIELDS.has(slug) || PLUMBING.test(slug)
}

/** Turn a column name into a human heading: `prospect_priority` -> `Prospect priority`. */
export function fieldLabel(slug: string): string {
  if (slug === "label") return "Name"
  const override = COLUMN_LABELS[slug]
  if (override) return override
  const spaced = slug
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
