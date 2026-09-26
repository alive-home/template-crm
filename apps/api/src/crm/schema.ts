/**
 * The database, declared once.
 *
 * The CRM's columns are read at runtime — `pragma_table_info` decides what is writable and
 * `catalog_attribute` decides what type each column is — which is what lets a column added in Turso
 * reach the UI with no code change. That works beautifully on a database that already exists and not
 * at all on an empty one, where nothing has ever created a table. Someone arriving with a fresh Turso
 * database had no way in.
 *
 * So this file states the minimum the code itself requires: every table `apps/api/src/crm/crm.ts` maps an
 * object to, every child table it joins, every column named in SQL anywhere in `apps/api/src/crm/` or
 * `apps/api/scripts/`. It is deliberately *not* a copy of the 164-attribute catalog that the original database
 * carries. Those extra columns are data, they are discovered at runtime, and re-declaring them here
 * would create a second definition to keep in sync with the first.
 *
 * `apps/api/scripts/migrate.ts` turns this into DDL and into the catalog rows that describe it. Nothing else
 * reads it at runtime.
 *
 * **Adding a column:** add it here and re-run the migration. It is added to the table if the table
 * already exists, and described in the catalog either way. Renaming or retyping an existing column is
 * not something this file can do — the migration only ever adds — and that is on purpose, because a
 * migration that rewrites columns is a migration that can lose a database.
 */

import { PLAYBOOK_TABLES } from "./schema-playbook"
import * as supportSchema from "./schema-support"
import { IDENTITY, type ObjectTable } from "./schema-types"

export { PLAYBOOK_TABLES } from "./schema-playbook"
export { CATALOG_TABLES } from "./schema-support"
export {
  attributeId,
  type Child,
  type Column,
  childColumns,
  childDdl,
  type ObjectTable,
  objectDdl,
} from "./schema-types"

/** All non-object tables, kept as one migration input even though their declarations have two homes. */
export const SUPPORT_TABLES = [...supportSchema.SUPPORT_TABLES, ...PLAYBOOK_TABLES]

/**
 * The seven objects.
 *
 * Ordered as `CRM_OBJECTS` orders them, because the overview counts them in that order and a reader
 * comparing the two files should not have to sort in their head.
 */
export const OBJECTS: ObjectTable[] = [
  {
    table: "companies",
    singular: "Company",
    plural: "Companies",
    columns: [
      ...IDENTITY,
      { name: "name", store: "text", type: "text" },
      { name: "description", store: "text", type: "text" },
      { name: "primary_location_locality", store: "text", type: "location", title: "Location" },
      { name: "primary_location_country_code", store: "text", type: "location", title: "Country" },
      // Read by `apps/api/src/crm/crm-map.ts`, and only ever written by an import. A record that has these is
      // an address somebody checked; a record that does not is placed by its city name instead.
      { name: "primary_location_latitude", store: "real", type: "location", title: "Latitude", system: true },
      { name: "primary_location_longitude", store: "real", type: "location", title: "Longitude", system: true },
      { name: "employee_range", store: "text", type: "text", title: "Size" },
      { name: "foundation_date", store: "text", type: "date", title: "Founded" },
      { name: "linkedin", store: "text", type: "text", title: "LinkedIn" },
      // An external URL, never a file. Checked by `apps/api/src/crm/picture.ts` before it is written.
      { name: "logo_url", store: "text", type: "text", title: "Logo" },
      { name: "alive_time_saved_score", store: "real", type: "number", title: "Time saved" },
      // Import provenance: which run wrote this row, and which source ids it came from. Written by
      // scripts, never by a person, and hidden on the record page.
      { name: "alive_source_key", store: "text", type: "text", system: true },
      { name: "alive_source_ids", store: "text", type: "text", system: true },
    ],
    children: [
      {
        table: "companies__domains",
        slug: "domains",
        kind: "value",
        type: "domain",
        // The registrable domain, so `mail.acme.co.uk` and `acme.co.uk` group together. Written by
        // the importer; nothing derives it at read time.
        extra: [{ name: "value_root_domain", store: "text", type: "domain", system: true }],
      },
      { table: "companies__categories", slug: "categories", kind: "value", type: "select" },
      { table: "companies__team", slug: "team", kind: "reference", type: "record-reference" },
      { table: "companies__associated_deals", slug: "deals", kind: "reference", type: "record-reference" },
      {
        table: "companies__associated_workspaces",
        slug: "workspaces",
        kind: "reference",
        type: "record-reference",
      },
    ],
  },
  {
    table: "people",
    singular: "Person",
    plural: "People",
    columns: [
      ...IDENTITY,
      { name: "name_full_name", store: "text", type: "personal-name", title: "Name" },
      { name: "name_first_name", store: "text", type: "personal-name", title: "First name" },
      { name: "name_last_name", store: "text", type: "personal-name", title: "Last name" },
      { name: "job_title", store: "text", type: "text" },
      { name: "description", store: "text", type: "text" },
      { name: "decision_maker", store: "integer", type: "checkbox" },
      // An external URL, never a file. Checked by `apps/api/src/crm/picture.ts` before it is written.
      { name: "avatar_url", store: "text", type: "text", title: "Photo" },
      { name: "company_record_id", store: "text", type: "record-reference", title: "Company", system: true },
    ],
    children: [
      {
        table: "people__email_addresses",
        slug: "emailAddresses",
        kind: "value",
        type: "email-address",
        title: "Email",
      },
      { table: "people__phone_numbers", slug: "phoneNumbers", kind: "value", type: "phone-number", title: "Phone" },
      { table: "people__associated_deals", slug: "deals", kind: "reference", type: "record-reference" },
      { table: "people__associated_users", slug: "users", kind: "reference", type: "record-reference" },
    ],
  },
  {
    table: "deals",
    singular: "Deal",
    plural: "Deals",
    columns: [
      ...IDENTITY,
      { name: "name", store: "text", type: "text" },
      // The only column with a closed set the code relies on: `outbound-queue.ts` treats these three
      // stages as "somebody is already talking to them" and withholds the company.
      {
        name: "stage",
        store: "text",
        type: "status",
        options: ["Prospect", "Contacted", "Proposal", "Won 🎉"],
      },
      { name: "need", store: "text", type: "text" },
      { name: "next_step", store: "text", type: "text" },
      { name: "risk", store: "text", type: "text" },
      // Free text, not a select: the outbound scripts rank on the `P0`/`P1` prefix precisely because
      // the rest of the label is a sentence somebody wrote.
      { name: "prospect_priority", store: "text", type: "text", title: "Priority" },
      { name: "outreach_readiness", store: "text", type: "text", title: "Readiness" },
      { name: "prospect_segment", store: "text", type: "text", title: "Segment" },
      { name: "prospect_primary_contact", store: "text", type: "text", title: "Primary contact" },
      { name: "prospect_contact_route", store: "text", type: "text", title: "Contact route" },
      { name: "prospect_location", store: "text", type: "location", title: "Location" },
      { name: "prospect_verification_sources", store: "text", type: "text", title: "Verification sources" },
      { name: "revenue_status", store: "text", type: "text", title: "Revenue" },
      { name: "committed_eur", store: "real", type: "currency", title: "Committed" },
      { name: "paid_eur", store: "real", type: "currency", title: "Paid" },
      { name: "outstanding_eur", store: "real", type: "currency", title: "Outstanding" },
      { name: "alive_time_saved_score", store: "real", type: "number", title: "Time saved" },
      {
        name: "associated_company_record_id",
        store: "text",
        type: "record-reference",
        title: "Company",
        system: true,
      },
    ],
    children: [{ table: "deals__associated_people", slug: "people", kind: "reference", type: "record-reference" }],
  },
  {
    table: "projects",
    singular: "Project",
    plural: "Projects",
    columns: [
      ...IDENTITY,
      { name: "name", store: "text", type: "text" },
      { name: "domain", store: "text", type: "domain" },
      { name: "status", store: "text", type: "text" },
      { name: "hosting", store: "text", type: "text" },
      { name: "tech_stack", store: "text", type: "text", title: "Stack" },
      { name: "notes", store: "text", type: "text" },
      { name: "company_record_id", store: "text", type: "record-reference", title: "Company", system: true },
      // `crm-market.ts` selects the market cases by `alive_source_id LIKE 'market-case:%'`, so this is
      // load-bearing rather than bookkeeping.
      { name: "alive_source_id", store: "text", type: "text", system: true },
    ],
    children: [],
  },
  {
    table: "customer_feedback",
    singular: "Feedback",
    plural: "Customer feedback",
    columns: [
      ...IDENTITY,
      { name: "name", store: "text", type: "text" },
      { name: "what", store: "text", type: "text" },
      { name: "why_it_matters", store: "text", type: "text" },
      { name: "could_become", store: "text", type: "text" },
      { name: "temperature", store: "text", type: "text" },
      { name: "spotted_at", store: "text", type: "date", title: "Spotted" },
      { name: "acted_on", store: "integer", type: "checkbox" },
      { name: "tags", store: "text", type: "text" },
    ],
    children: [],
  },
  {
    table: "users",
    singular: "User",
    plural: "Users",
    columns: [
      ...IDENTITY,
      { name: "display_name", store: "text", type: "text", title: "Name" },
      { name: "primary_email_address", store: "text", type: "email-address", title: "Email" },
      { name: "product_status", store: "text", type: "text", title: "Status" },
    ],
    children: [{ table: "users__workspace", slug: "workspaces", kind: "reference", type: "record-reference" }],
  },
  {
    table: "workspaces",
    singular: "Workspace",
    plural: "Workspaces",
    columns: [...IDENTITY, { name: "name", store: "text", type: "text" }],
    children: [{ table: "workspaces__users", slug: "users", kind: "reference", type: "record-reference" }],
  },
]
