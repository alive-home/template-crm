import { Link } from "@tanstack/react-router"
import { ExternalLink, MapPin, Users, X } from "lucide-react"
import { RecordAvatar } from "#/components/crm/RecordAvatar.tsx"
import { bareDomain, domainHref } from "#/lib/format.ts"
import type { MapCompanyProperties } from "#/lib/map-types.ts"
import { cn } from "#/lib/utils.ts"
import { bandLabel } from "./style.ts"

/**
 * The selected account, as a card over the map.
 *
 * It shows what you need in order to decide whether to open the record, and then gets out of the way
 * — this is a map, not a second record page. The one thing it says that no other screen in the CRM
 * says is **where this dot came from**, because that is the only fact the map itself invented.
 */
export function AccountCard({ account, onClose }: { account: MapCompanyProperties | null; onClose: () => void }) {
  if (!account) return null

  const band = bandLabel(account.band)
  const place = [account.locality, account.countryCode].filter(Boolean).join(", ")

  return (
    <div className="pointer-events-auto absolute top-3 right-3 z-10 w-[280px] overflow-hidden rounded-xl border border-border bg-card shadow-lg">
      <div className="flex items-start gap-2.5 p-3">
        <RecordAvatar object="companies" name={account.name} domain={account.domain} picture={account.logo} />
        <div className="min-w-0 flex-1">
          <Link
            to="/crm/$object/$id"
            params={{ object: "companies", id: account.id }}
            className="block truncate font-medium text-[13px] text-foreground hover:underline"
          >
            {account.name}
          </Link>
          {account.domain ? (
            <a
              href={domainHref(account.domain)}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 inline-flex items-center gap-1 truncate text-[11px] text-accent hover:underline"
            >
              {bareDomain(account.domain)}
              <ExternalLink className="size-3 shrink-0" />
            </a>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Sluiten"
          className="-mr-1 -mt-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <dl className="space-y-1.5 border-border border-t px-3 py-2.5 text-[11px]">
        <Row label="Band" value={band} />
        {account.stage ? <Row label="Fase" value={account.stage} /> : null}
        {account.score !== null ? <Row label="Score" value={String(account.score)} /> : null}
      </dl>

      <div className="flex items-center justify-between gap-2 border-border border-t px-3 py-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Users className="size-3" />
          {account.peopleCount === 0
            ? "Niemand vastgelegd"
            : `${account.peopleCount} contact${account.peopleCount === 1 ? "" : "en"}`}
        </span>
        {account.dealId ? (
          <Link
            to="/crm/$object/$id"
            params={{ object: "deals", id: account.dealId }}
            className="text-accent hover:underline"
          >
            Deal
          </Link>
        ) : null}
      </div>

      {/*
       * Where the dot came from, in words, on the one screen where it matters.
       *
       * A pin at a city centre and a pin at a street address look equally certain once they are both
       * dots, and most of them are the former. The ring versus the solid fill carries this on the map
       * itself; here it is spelled out, because this is the moment somebody is about to act on the
       * location.
       */}
      <p
        className={cn(
          "flex items-start gap-1.5 border-border border-t px-3 py-2 text-[10px] leading-relaxed",
          account.source === "city" ? "text-warning" : "text-muted-foreground",
        )}
      >
        <MapPin className="mt-px size-3 shrink-0" />
        {account.source === "record"
          ? `Coördinaten van het record${place ? ` (${place})` : ""}.`
          : `Bij benadering: het middelpunt van ${account.locality ?? "de plaats"}, want er staat geen adres op het record.`}
      </p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="truncate text-right text-foreground">{value}</dd>
    </div>
  )
}
