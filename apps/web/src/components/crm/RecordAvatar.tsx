import { useState } from "react"
import type { CrmObject, CrmRecordDetail } from "#/lib/crm-types.ts"
import { bareDomain, faviconUrl } from "#/lib/format.ts"
import { cn } from "#/lib/utils.ts"

/**
 * The mark in front of a record's name.
 *
 * A record with a stored picture shows it: some companies carry a `logo_url` and some people an
 * `avatar_url`. A company without one falls back to its real favicon, because recognising a logo is
 * faster than reading a name. Everything else gets initials on a neutral surface — deliberately
 * neutral, since a colour derived from the name would look like it encodes something and encodes
 * nothing.
 *
 * **The box is the same size for every record, and that is a grid decision.** A person's photograph
 * is worth more pixels than a favicon is, and the version of this component upstream draws people at
 * 36px for exactly that reason. Here it does not: `DataGrid` has a fixed row height on purpose, so a
 * People list whose marks are half again as tall is a column you can no longer scan. Call sites where
 * the picture *is* the screen ask for the room themselves, through `className`.
 */

/** "Jan-Willem de Vries" -> "JV"; a single word gives one letter rather than two from the middle. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const first = words[0]
  const last = words[words.length - 1]
  if (!first || !last) return "?"
  if (words.length === 1) return first.slice(0, 2).toUpperCase()
  return (first.slice(0, 1) + last.slice(0, 1)).toUpperCase()
}

/**
 * First domain off a company row, if the collection came back with one, as a bare host.
 *
 * Half the callers of this turn the answer into an `https://` link, and the column holds both a
 * bare host and a full URL depending on which import wrote the row, so the shape is settled here
 * rather than at each of them.
 */
export function firstDomain(value: unknown): string | null {
  if (!Array.isArray(value)) return null
  const first = value.find(item => typeof item === "string" && item.trim())
  return typeof first === "string" ? bareDomain(first) || null : null
}

/**
 * A picture column off a record row.
 *
 * `avatar_url` and `logo_url` are plain text columns, but every list row here is loosely typed and
 * some columns arrive as collections, so this takes either shape rather than assuming one.
 *
 * It reads the first value itself rather than borrowing `firstDomain`: a picture is an address the
 * browser loads as it stands, and the scheme that gets stripped off a domain is load-bearing here.
 */
export function pictureOf(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null
  if (!Array.isArray(value)) return null
  const first = value.find(item => typeof item === "string" && item.trim())
  return typeof first === "string" ? first.trim() : null
}

export function RecordAvatar({
  object,
  name,
  domain,
  picture,
  className,
}: {
  object: CrmObject
  name: string | null
  domain?: string | null
  /** The record's own `logo_url` or `avatar_url`, when it has one. */
  picture?: string | null
  className?: string
}) {
  /*
   * The sources are tried in order and a failure moves to the next one, rather than dropping straight
   * to initials. A stored picture is a link to somebody else's CDN and those rot: some of the badges
   * in the export already 404, and one dead image should not cost the favicon that would have worked.
   */
  const sources = [picture, object === "companies" && domain ? faviconUrl(domain, 64) : null].filter(
    (source): source is string => Boolean(source),
  )
  const [failed, setFailed] = useState(0)
  const source = sources[failed] ?? null

  /*
   * A face fills its frame; a logo sits inside one.
   *
   * The 72% inset and `object-contain` are for favicons, which are drawings that come with their own
   * margins and must not be cropped. A photograph obeying the same rule is letterboxed inside a box
   * with air around it, which reads as a stamp rather than a person — and the head, the only part you
   * are looking at, ends up a handful of pixels wide.
   */
  const portrait = object === "people" && Boolean(picture) && source === picture

  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center overflow-hidden border border-border bg-muted/60",
        // A person is a circle and a company is a rounded square. It is the one piece of shape
        // vocabulary this CRM has, and the drafts list and the People panel mix both in one column.
        object === "people" ? "rounded-full" : "rounded-md",
        "font-medium text-[10px] text-muted-foreground",
        className,
      )}
    >
      {source ? (
        <img
          // Keyed so a fallback is a fresh element: React would otherwise reuse the node, keep the
          // broken image in place and never fire load again.
          key={source}
          src={source}
          alt=""
          loading="lazy"
          // Proportional rather than a fixed 16px: the same mark is 24px in the grid and 36px on a
          // record page, and a favicon pinned to 16px in the big one is a dot in a box.
          className={cn(portrait ? "size-full object-cover" : "size-[72%] object-contain")}
          onError={() => setFailed(index => index + 1)}
        />
      ) : (
        initials(name ?? "?")
      )}
    </span>
  )
}

export default RecordAvatar

/**
 * The picture itself, where the picture is the point of the screen.
 *
 * `RecordAvatar` is a *mark*: a fixed box, cropped to fill, the same size on every row so a column
 * stays a column. That is right in a list and wrong on a record, and the difference is not only size.
 * A circle crops a photograph to its middle, which is a decision somebody's camera already made once
 * — a face shot slightly off centre loses an ear, a shoulder or the top of a head, and there is no
 * version of "the whole photo" inside a circle.
 *
 * So this renders the file as it was uploaded: full width, natural aspect ratio, nothing cropped,
 * corners rounded to say it is a picture in an interface rather than a picture pasted onto one. The
 * height follows the image, which is why this can never be used in a grid row.
 *
 * The fallback is not "no picture": it is a box of the same width holding the initials, so the layout
 * does not jump between a person with a photo and one without.
 */
export function RecordPortrait({
  name,
  src,
  className,
}: {
  name: string | null
  src?: string | null
  className?: string
}) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <span
        className={cn(
          "flex aspect-4/5 w-40 shrink-0 items-center justify-center rounded-2xl border border-border bg-muted/60 font-medium text-[32px] text-muted-foreground",
          className,
        )}
      >
        {initials(name ?? "?")}
      </span>
    )
  }

  return (
    <img
      // Keyed for the same reason the mark is: React would otherwise keep the broken node in place.
      key={src}
      src={src}
      alt={name ?? ""}
      className={cn("block h-auto w-40 shrink-0 rounded-2xl border border-border bg-muted/60", className)}
      onError={() => setFailed(true)}
    />
  )
}

/**
 * The mark beside the name, except for a person who has a photograph.
 *
 * A face is the thing you came to this page to see, and a 36px circle crops it to the middle of
 * whatever framing the camera chose. Where there is a picture of a person, it is shown whole and at a
 * size worth looking at; everything else keeps the mark, because a favicon gains nothing from room.
 */
export function RecordMark({ object, record }: { object: CrmObject; record: CrmRecordDetail }) {
  const picture = pictureOf(record.avatar_url ?? record.logo_url)
  if (object === "people" && picture) return <RecordPortrait name={record.label} src={picture} className="w-20" />
  return (
    <RecordAvatar
      object={object}
      name={record.label}
      domain={firstDomain(record.domains)}
      picture={picture}
      className="size-9"
    />
  )
}
