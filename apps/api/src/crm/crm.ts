import { query } from "./turso"

/**
 * The CRM schema registry.
 *
 * The database in Turso is *relational*: one table per object with a real column per attribute
 * (164 of them), plus a child table per multi-value attribute. That is a deliberate reversal of the
 * earlier local staging copy, which stuffed every attribute into one JSON blob. A blob was the right
 * shape while the data was still being loaded; it is the wrong shape now that this is the system of
 * record, because it makes every field untyped and every filter a scan.
 *
 * This file is the only place that knows which table backs which object, so a route never
 * interpolates a caller-supplied name into SQL.
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

/** A multi-value attribute, stored as its own table keyed back to the parent record. */
type ChildTable = {
  /** Table name in Turso. */
  table: string
  /** Key this collection appears under in the JSON response. */
  key: string
  /** Column holding the scalar value, for plain lists like domains and email addresses. */
  value?: string
  /** Object this collection points at, for reference lists like a company's team. */
  ref?: CrmObject
}

/**
 * A single-value reference stored as a bare id column.
 *
 * The table holds `company_record_id` and nothing else, so a list of people would otherwise show a
 * column of UUIDs. Resolving it to `{ id, object, label }` makes it render and link like any other
 * reference.
 */
type Lookup = { column: string; ref: CrmObject; key: string }

type CrmObjectDef = {
  table: string
  /** SQL expression producing the human label for a row. */
  label: string
  singular: string
  /** Columns a free-text `?q=` searches. */
  search: string[]
  children: ChildTable[]
  lookups?: Lookup[]
}

export const CRM_SCHEMA: Record<CrmObject, CrmObjectDef> = {
  companies: {
    table: "companies",
    label: "name",
    singular: "Company",
    search: ["name", "description", "primary_location_locality"],
    children: [
      { table: "companies__domains", key: "domains", value: "value" },
      { table: "companies__categories", key: "categories", value: "value" },
      { table: "companies__team", key: "team", ref: "people" },
      { table: "companies__associated_deals", key: "deals", ref: "deals" },
      { table: "companies__associated_workspaces", key: "workspaces", ref: "workspaces" },
    ],
  },
  people: {
    table: "people",
    label: "name_full_name",
    singular: "Person",
    search: ["name_full_name", "job_title", "description"],
    children: [
      { table: "people__email_addresses", key: "emailAddresses", value: "value" },
      { table: "people__phone_numbers", key: "phoneNumbers", value: "value" },
      { table: "people__associated_deals", key: "deals", ref: "deals" },
      { table: "people__associated_users", key: "users", ref: "users" },
    ],
    lookups: [{ column: "company_record_id", ref: "companies", key: "company" }],
  },
  deals: {
    table: "deals",
    label: "name",
    singular: "Deal",
    search: ["name", "need", "next_step", "risk", "prospect_primary_contact"],
    children: [{ table: "deals__associated_people", key: "people", ref: "people" }],
    lookups: [{ column: "associated_company_record_id", ref: "companies", key: "company" }],
  },
  projects: {
    table: "projects",
    label: "name",
    singular: "Project",
    search: ["name", "domain", "tech_stack", "notes"],
    children: [],
    lookups: [{ column: "company_record_id", ref: "companies", key: "company" }],
  },
  customer_feedback: {
    table: "customer_feedback",
    label: "name",
    singular: "Feedback",
    search: ["name", "what", "why_it_matters", "could_become"],
    children: [],
  },
  users: {
    table: "users",
    label: "COALESCE(display_name, primary_email_address)",
    singular: "User",
    search: ["display_name", "primary_email_address"],
    children: [{ table: "users__workspace", key: "workspaces", ref: "workspaces" }],
  },
  workspaces: {
    table: "workspaces",
    label: "name",
    singular: "Workspace",
    search: ["name"],
    children: [{ table: "workspaces__users", key: "users", ref: "users" }],
  },
}

export const isCrmObject = (value: string): value is CrmObject => value in CRM_SCHEMA

/**
 * Columns a PATCH is allowed to write.
 *
 * Read from the live table rather than hardcoded, so adding a column in Turso does not need a code
 * change — but identity and provenance are subtracted. `record_id` is the row's identity and
 * `created_*` records who made it and when; letting an HTTP body rewrite either would turn the audit
 * trail into a suggestion.
 */
const IMMUTABLE = new Set(["record_id", "created_at", "created_by_actor_id", "created_by_actor_type"])

const columnCache = new Map<CrmObject, Set<string>>()

/**
 * Every column the table actually has, immutable ones included.
 *
 * Separate from `writableColumns` because the two questions are different and conflating them was
 * wrong in one direction: `created_at` is not writable and *is* sortable — it is the "Added" column
 * in the default view of every object — so a sort validated against the writable set would have
 * rejected the one column most likely to be clicked.
 */
export async function tableColumns(object: CrmObject): Promise<Set<string>> {
  const cached = columnCache.get(object)
  if (cached) return cached

  const rows = await query<{ name: string }>(`SELECT name FROM pragma_table_info('${CRM_SCHEMA[object].table}')`)
  const columns = new Set(rows.map(row => row.name))
  columnCache.set(object, columns)
  return columns
}

export async function writableColumns(object: CrmObject): Promise<Set<string>> {
  const columns = await tableColumns(object)
  return new Set([...columns].filter(name => !IMMUTABLE.has(name)))
}

/**
 * Columns the catalog calls a checkbox.
 *
 * SQLite has no boolean, so they are stored as 0 and 1. Left alone they reach the UI as
 * numbers and render as "0" — a column of zeros under a heading like "Decision maker" reads as a
 * count of nothing rather than "no". The catalog already knows the real type, so the API converts
 * them once here instead of every renderer guessing that a 0/1 column means yes/no.
 */
const checkboxCache = new Map<CrmObject, Set<string>>()

export async function checkboxColumns(object: CrmObject): Promise<Set<string>> {
  const cached = checkboxCache.get(object)
  if (cached) return cached

  const rows = await query<{ api_slug: string }>(
    "SELECT api_slug FROM catalog_attribute WHERE object_slug = ? AND type = 'checkbox' AND is_archived = 0",
    [object],
  )
  const columns = new Set(rows.map(row => row.api_slug))
  checkboxCache.set(object, columns)
  return columns
}

/** Attribute metadata straight from the catalog tables — titles, types, select options. */
export type AttributeMeta = {
  api_slug: string
  title: string | null
  type: string
  is_system_attribute: number
  is_multiselect: number
  options: string[]
}

export async function attributesFor(object: CrmObject): Promise<AttributeMeta[]> {
  const attributes = await query<Omit<AttributeMeta, "options"> & { attribute_id: string }>(
    `SELECT attribute_id, api_slug, title, type, is_system_attribute, is_multiselect
		 FROM catalog_attribute WHERE object_slug = ? AND is_archived = 0 ORDER BY is_system_attribute DESC, api_slug`,
    [object],
  )

  // Select and status attributes carry their allowed values in two sibling tables. Fetching all of
  // them in one pass keeps this to three round trips regardless of how many attributes there are.
  const [selects, statuses] = await Promise.all([
    query<{ attribute_id: string; title: string }>(
      "SELECT attribute_id, title FROM catalog_select_option WHERE is_archived = 0",
    ),
    query<{ attribute_id: string; title: string }>(
      "SELECT attribute_id, title FROM catalog_status WHERE is_archived = 0",
    ),
  ])

  const byAttribute = new Map<string, string[]>()
  for (const row of [...selects, ...statuses]) {
    const list = byAttribute.get(row.attribute_id) ?? []
    list.push(row.title)
    byAttribute.set(row.attribute_id, list)
  }

  return attributes.map(({ attribute_id, ...attribute }) => ({
    ...attribute,
    options: byAttribute.get(attribute_id) ?? [],
  }))
}
