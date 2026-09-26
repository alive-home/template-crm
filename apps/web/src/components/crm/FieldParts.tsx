import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { badgeVariants } from "#/components/ui/badge.tsx"
import type { CrmRef } from "#/lib/crm-types.ts"
import { cn } from "#/lib/utils.ts"

/**
 * How a CRM value is dressed, once `FieldValue` has decided what it is.
 *
 * Every piece here draws one shape: a score pill, a row of reference chips, an outbound link, a
 * clamped paragraph. None of them decides *which* shape a value gets — that is one narrowing chain
 * and it stays in one file next door, where it can be read top to bottom.
 */

/** Full ISO with nanoseconds, plus the bare `2026-03-01` that date-only columns come back as. */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/

/** Columns whose strings are addresses on the web. */
export const LINK_SLUG = /url|domain|website|linkedin|twitter|facebook|instagram|angellist/i

/**
 * A value only becomes a link if it also looks like one. `twitter_follower_count` matches the slug
 * test, and linking a follower count to `https://1234` is worse than rendering the number.
 */
export const LINKABLE = /^[\w-]+(\.[\w-]+)+([/?#]|$)/

/** Past this a value is a paragraph rather than a field, and gets clamped. */
export const CLAMP_AT = 180

/**
 * A 0-100 judgement, drawn as a pill rather than a bare number.
 *
 * The only slug-keyed *visual* rule in this file, and it earns the exception: these columns are
 * scores on one shared scale, so a reader compares them down the column, and a tint says "high" in
 * one glance where a number has to be read. The banding is coarse — three steps, not a gradient —
 * because the underlying figure is a judgement and a smooth ramp would imply a precision it lacks.
 */
export const SCORE_SLUG = /_score$/

export function Score({ value }: { value: number }) {
  const tone =
    value >= 70
      ? "border-success/30 bg-success/10 text-success"
      : value >= 40
        ? "border-warning/30 bg-warning/10 text-warning"
        : "border-border bg-muted text-muted-foreground"

  return (
    <span className={cn("inline-flex rounded-md border px-1.5 py-0.5 font-medium text-[12px] tabular-nums", tone)}>
      {Math.round(value)}
    </span>
  )
}

export const DECIMAL = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 })
export const CURRENCY = {
  USD: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }),
  EUR: new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }),
}

export function Empty() {
  return <span className="text-muted-foreground">—</span>
}

/** Only a `_usd` / `_eur` suffix or an explicit currency column buys a currency format. */
export function currencyOf(slug: string): keyof typeof CURRENCY | null {
  const name = slug.toLowerCase()
  if (name.endsWith("_eur")) return "EUR"
  if (name.endsWith("_usd") || name.includes("currency")) return "USD"
  return null
}

/**
 * Chips for the values a collection holds, capped.
 *
 * A list view passes a small `limit`: a company with nine categories would otherwise make its row
 * three lines tall and wreck the rhythm of the table. The overflow is counted, never hidden — "+7"
 * says there is more, which a silent truncation does not.
 */
export function Overflow({ n }: { n: number }) {
  return (
    <span className={cn(badgeVariants({ variant: "outline" }), "shrink-0 tabular-nums")} title={`${n} more`}>
      +{n}
    </span>
  )
}

export function RefChips({ refs, limit }: { refs: CrmRef[]; limit?: number }) {
  const shown = limit ? refs.slice(0, limit) : refs
  const hidden = refs.length - shown.length

  return (
    // A chip has to be allowed to shrink or the cell clips it mid-character instead of ellipsising
    // it — but not below a floor, because "Account…" tells you less than the space it saves.
    <div className={cn("flex min-w-0 items-center gap-1", limit ? "flex-nowrap overflow-hidden" : "flex-wrap")}>
      {shown.map(ref => (
        <Link
          key={ref.id}
          to="/crm/$object/$id"
          params={{ object: ref.object, id: ref.id }}
          className={cn(
            badgeVariants({ variant: "secondary" }),
            "hover:underline",
            limit && "block max-w-[14rem] truncate",
            // The floor only applies when chips compete for the width. A lone chip padded out to
            // 6rem is just a wide grey box around a short word.
            limit && (shown.length > 1 ? "min-w-[6rem]" : "min-w-0"),
          )}
          title={ref.label ?? undefined}
        >
          {/* A reference with no resolved label still has to be reachable, so the id stands in. */}
          {ref.label ?? ref.id}
        </Link>
      ))}
      {hidden > 0 ? <Overflow n={hidden} /> : null}
    </div>
  )
}

/**
 * The address a value points at, or null if it does not point anywhere.
 *
 * One decision for every caller, because a domain is a domain whether it arrives as a lone string
 * or as one of three chips in a collection — and until now only the lone string was clickable, so
 * `companies.domains`, the column the whole list is scanned by, was dead text.
 *
 * The catalog's `domain` type counts as evidence alongside the slug: a column the catalog calls a
 * domain is one, whatever it happens to be named.
 */
export function webHref(value: string, slug: string, kind?: string): string | null {
  // `deals.prospect_verification_sources` packs several URLs into one string, and one anchor
  // pointing at all of them concatenated is a link that goes nowhere.
  if (/\s/.test(value)) return null
  if (value.startsWith("http")) return value
  if ((kind === "domain" || LINK_SLUG.test(slug)) && LINKABLE.test(value)) return `https://${value}`
  return null
}

/** Everything on the open web opens in a new tab: this table is the thing you are working from. */
export function ExternalValue({ href, value }: { href: string; value: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-foreground underline underline-offset-2 hover:text-muted-foreground"
    >
      {value.replace(/^https?:\/\//, "")}
    </a>
  )
}

/**
 * Its own component because it holds state. Inlining the toggle would put a hook behind a length
 * check, and a hook cannot be called conditionally.
 */
export function LongText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="max-w-prose">
      <p className={cn("whitespace-pre-wrap text-foreground", !expanded && "line-clamp-3")}>{text}</p>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="mt-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {expanded ? "Show less" : "Show more"}
      </button>
    </div>
  )
}
