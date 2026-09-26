import {
  AtSign,
  Braces,
  Calendar,
  CircleDot,
  Clock,
  Globe,
  Hash,
  Link2,
  MapPin,
  Phone,
  Signal,
  SquareCheck,
  Star,
  Tag,
  Type,
  User,
  Wallet,
} from "lucide-react"
import { type CrmAttribute, type CrmObject, type CrmRecord, fieldLabel, isPlumbing, LIST_COLUMNS } from "./crm-types"

/**
 * What a column *is*, so the grid can show its type the way a spreadsheet does.
 *
 * The answer already exists: `catalog_attribute` lives in Turso and carries a real type per
 * attribute. Reading it here means the icon on a header is a fact from the catalog rather than a
 * guess from the column name — and a new column in Turso gets the right icon with no code change.
 */

export type ColumnKind =
  | "text"
  | "number"
  | "checkbox"
  | "date"
  | "timestamp"
  | "select"
  | "status"
  | "record-reference"
  | "actor-reference"
  | "email-address"
  | "phone-number"
  | "domain"
  | "currency"
  | "location"
  | "rating"
  | "interaction"
  | "personal-name"

const ICONS: Record<string, typeof Type> = {
  text: Type,
  number: Hash,
  checkbox: SquareCheck,
  date: Calendar,
  timestamp: Clock,
  select: CircleDot,
  status: Tag,
  "record-reference": Link2,
  "actor-reference": User,
  "personal-name": User,
  "email-address": AtSign,
  "phone-number": Phone,
  domain: Globe,
  currency: Wallet,
  location: MapPin,
  rating: Star,
  interaction: Signal,
}

export function columnIcon(kind: string | undefined) {
  return ICONS[kind ?? "text"] ?? Braces
}

/**
 * The type, in the one word a header has room for.
 *
 * A header shows the type beside the name the way a table editor does, because "is this column a
 * date or a sentence" changes what you expect of the values under it — and an icon alone makes that
 * a guess. Only the names that do not fit are shortened; the rest are the catalog's own words.
 */
const TYPE_LABELS: Record<string, string> = {
  "record-reference": "link",
  "actor-reference": "user",
  "personal-name": "text",
  "email-address": "email",
  "phone-number": "phone",
  checkbox: "bool",
  timestamp: "time",
  interaction: "event",
}

export function columnTypeLabel(kind: string | undefined): string {
  const key = kind ?? "text"
  return TYPE_LABELS[key] ?? key
}

/**
 * Derived response keys that have no column of their own.
 *
 * `emailAddresses` is assembled from a child table and `company` is resolved from a bare
 * `*_record_id`, so neither name appears in the catalog. Everything else resolves by walking the
 * column name back to its attribute — `primary_location_locality` is part of the `primary_location`
 * attribute, `first_interaction_interacted_at` part of `first_interaction`.
 */
const ALIASES: Record<string, string> = {
  label: "name",
  company: "company",
  deals: "associated_deals",
  people: "associated_people",
  workspaces: "associated_workspaces",
  emailAddresses: "email_addresses",
  phoneNumbers: "phone_numbers",
}

/** Keys the API adds that are not attributes at all. */
const SYNTHETIC: Record<string, ColumnKind> = {
  label: "text",
  company: "record-reference",
  deals: "record-reference",
  people: "record-reference",
  users: "record-reference",
  workspaces: "record-reference",
  team: "record-reference",
  emailAddresses: "email-address",
  phoneNumbers: "phone-number",
}

/**
 * The attribute type behind a response key.
 *
 * Falls back through: the catalog, the alias map, then progressively shorter prefixes of the column
 * name. A key that matches nothing is text, which is what an unrecognised column renders as anyway.
 */
export function columnKind(key: string, attributes: CrmAttribute[]): string {
  const byslug = new Map(attributes.map(attribute => [attribute.slug, attribute.type]))

  const direct = byslug.get(key) ?? byslug.get(ALIASES[key] ?? "")
  if (direct) return direct

  const parts = key.split("_")
  for (let length = parts.length - 1; length > 0; length--) {
    const found = byslug.get(parts.slice(0, length).join("_"))
    if (found) return found
  }

  return SYNTHETIC[key] ?? "text"
}

/** Roomier for the columns that hold sentences, tighter for the ones that hold a word or a date. */
const WIDTHS: Record<string, string> = {
  number: "min-w-[7rem]",
  checkbox: "min-w-[7rem]",
  date: "min-w-[9rem]",
  timestamp: "min-w-[9rem]",
  select: "min-w-[11rem]",
  status: "min-w-[11rem]",
  currency: "min-w-[9rem]",
  domain: "min-w-[13rem]",
  "email-address": "min-w-[15rem]",
  "record-reference": "min-w-[13rem]",
  location: "min-w-[10rem]",
}

export function columnWidth(kind: string): string {
  return WIDTHS[kind] ?? "min-w-[14rem]"
}

/**
 * Every column the grid could show for an object, in the order the picker lists them.
 *
 * Derived from the rows the API actually returned rather than from the schema, because the response
 * carries assembled keys (`domains`, `company`) that no attribute describes — and because a column
 * the API does not return is a column the picker must not offer.
 */
export function availableColumns(object: CrmObject, rows: CrmRecord[], attributes: string[] = []): string[] {
  const keys = new Set<string>()

  /*
   * The catalog first, then whatever the rows add.
   *
   * Sampling rows was the whole census while a list was the whole table. Now that it is the first
   * page, a column nobody has filled in until row 400 is simply not offered — the picker would
   * quietly shrink to whatever the opening hundred records happen to have in common, and it would
   * change as you scrolled. The catalog knows every real attribute regardless of who filled it in.
   *
   * The rows are still read, because they carry keys the catalog has no row for: the collections
   * assembled from child tables and the references resolved into `{ id, object, label }`.
   */
  for (const slug of attributes) keys.add(slug)
  for (const row of rows.slice(0, 50)) for (const key of Object.keys(row)) keys.add(key)

  keys.delete("label")
  const rest = [...keys].filter(key => !isPlumbing(key) && !LIST_COLUMNS[object].includes(key))
  rest.sort((a, b) => fieldLabel(a).localeCompare(fieldLabel(b)))

  // Defaults keep their curated order at the top; the long tail follows alphabetically.
  return [...LIST_COLUMNS[object], ...rest]
}
