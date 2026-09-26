import { format, isValid, parseISO } from "date-fns"
import type * as React from "react"
import {
  CLAMP_AT,
  CURRENCY,
  currencyOf,
  DECIMAL,
  Empty,
  ExternalValue,
  ISO_DATE,
  LongText,
  Overflow,
  RefChips,
  SCORE_SLUG,
  Score,
  webHref,
} from "#/components/crm/FieldParts.tsx"
import { Badge, badgeVariants } from "#/components/ui/badge.tsx"
import { isCrmRef } from "#/lib/crm-types.ts"
import { cn } from "#/lib/utils.ts"

/**
 * One CRM value, rendered.
 *
 * It narrows on the *shape* of the value rather than on a map of column names, because the database
 * has 164 attribute columns across seven objects and the set is not fixed — a renderer keyed by
 * column would be a second copy of the schema that rots the moment Turso gains a column. `slug` is a
 * hint and never the decision: it only picks a currency and tells a link column from a plain string.
 *
 * Null-heavy rows are the norm, so the em-dash is the most common thing this file draws.
 */

function StringValue({ value, slug, kind, inList }: { value: string; slug: string; kind?: string; inList?: boolean }) {
  if (ISO_DATE.test(value)) {
    const parsed = parseISO(value)
    // A string that looks like a date but will not parse renders as itself, never "Invalid Date".
    if (isValid(parsed)) {
      return <span className="whitespace-nowrap text-foreground">{format(parsed, "d MMM yyyy")}</span>
    }
  }

  const href = webHref(value, slug, kind)
  if (href) return <ExternalValue href={href} value={value} />

  // In a grid a paragraph is one truncated line and nothing else. The three-line clamp with its
  // "Show more" toggle belongs on the record page — in a table it makes one row twice the height of
  // its neighbours and puts a control in a cell you were only scanning.
  if (value.length > CLAMP_AT && !inList) return <LongText text={value} />

  return (
    <span className="text-foreground" title={inList && value.length > CLAMP_AT ? value : undefined}>
      {value}
    </span>
  )
}

export function FieldValue({
  value,
  slug,
  kind,
  limit,
}: {
  value: unknown
  slug: string
  /**
   * The attribute's declared type from the catalog, when the caller knows it.
   *
   * Shape still decides how a value is *read*; this only decides how one is *dressed*. A select or
   * status holds one of a fixed set of values, and drawing those as chips is what makes a column of
   * them scannable — but nothing here depends on the hint arriving, because it often does not.
   */
  kind?: string
  /**
   * Cap on how many chips a collection shows. Unset means all of them, which is the record page.
   * Setting it also declares list context, where a paragraph renders as one truncated line.
   */
  limit?: number
}): React.ReactNode {
  if (value === null || value === undefined) return <Empty />

  if (typeof value === "boolean") return <Badge variant="secondary">{value ? "Yes" : "No"}</Badge>

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return <Empty />
    if (SCORE_SLUG.test(slug) && value >= 0 && value <= 100) return <Score value={value} />
    const code = currencyOf(slug)
    return <span className="tabular-nums text-foreground">{(code ? CURRENCY[code] : DECIMAL).format(value)}</span>
  }

  // A lone reference is rare but cheap to cover, and it is the same chip either way.
  if (isCrmRef(value)) return <RefChips refs={[value]} />

  if (Array.isArray(value)) {
    if (value.length === 0) return <Empty />
    if (value.every(isCrmRef)) return <RefChips refs={value} limit={limit} />

    const shown = limit ? value.slice(0, limit) : value
    const hidden = value.length - shown.length

    return (
      <div className={cn("flex min-w-0 items-center gap-1", limit ? "flex-nowrap overflow-hidden" : "flex-wrap")}>
        {shown.map(item => {
          const text = String(item)
          const href = webHref(text, slug, kind)
          // A domain column carries the scheme in the data; the chip drops it, since `https://` is
          // the same on every row and costs the width that tells one domain from another.
          const label = text.replace(/^https?:\/\//, "")
          const shape = cn(
            limit && "block max-w-[14rem] truncate",
            limit && (shown.length > 1 ? "min-w-[6rem]" : "min-w-0"),
          )

          // A chip you can open is still a chip — it reads the same in the column and only
          // declares itself on hover, so a row of them does not turn into a row of links.
          return href ? (
            <a
              key={text}
              href={href}
              target="_blank"
              rel="noreferrer"
              title={text}
              className={cn(badgeVariants({ variant: "secondary" }), shape, "hover:underline")}
            >
              {label}
            </a>
          ) : (
            <Badge key={text} variant="secondary" title={text} className={shape}>
              {label}
            </Badge>
          )
        })}
        {hidden > 0 ? <Overflow n={hidden} /> : null}
      </div>
    )
  }

  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return <Empty />

    // A one-of-a-fixed-set value, drawn as a chip. Guarded on length so a text column that the
    // catalog happens to call a select does not turn a sentence into an outsized badge.
    if ((kind === "select" || kind === "status") && trimmed.length <= 40) {
      return (
        <Badge variant="outline" className="max-w-full truncate font-normal">
          {trimmed}
        </Badge>
      )
    }

    return <StringValue value={trimmed} slug={slug} kind={kind} inList={limit !== undefined} />
  }

  return <span className="text-foreground">{typeof value === "object" ? JSON.stringify(value) : String(value)}</span>
}

export default FieldValue
