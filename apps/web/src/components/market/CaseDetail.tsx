import { Link } from "@tanstack/react-router"
import { ExternalLink } from "lucide-react"
import type { MarketCaseRow, MarketRoute } from "#/lib/market-types.ts"

/**
 * Eén case in de leespane: de feiten, en onderaan onze lezing van hoe zoiets binnenkomt.
 *
 * Bovenaan stond een gereconstrueerde eerste mail. Die was verzonnen, stond dat er twee keer bij, en
 * is nu weg: een verzonnen bericht dat tussen echte gegevens staat gaat binnen een week door voor
 * iets dat we weten. Wat overblijft komt uit de CRM, met één blok eronder dat zichzelf als lezing
 * aankondigt.
 */
function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="pb-1 font-medium text-[11px] text-muted-foreground">{label}</div>
      <div className="text-[13px] text-foreground leading-relaxed">{children}</div>
    </div>
  )
}

export function CaseDetail({ item, route }: { item: MarketCaseRow; route: MarketRoute | null }) {
  return (
    <div className="mx-auto max-w-[56rem] px-8 py-7">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="font-semibold text-[22px] text-foreground tracking-tight">{item.company}</h1>
        <span className="text-[13px] text-muted-foreground">{item.sector}</span>
        <Link
          to="/crm/$object/$id"
          params={{ object: "companies", id: item.companyId }}
          className="ml-auto inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
        >
          Open in de CRM <ExternalLink size={12} />
        </Link>
      </div>
      <p className="mt-1 text-[12px] text-muted-foreground">{item.clusterLabel || "Knelpunt onbekend"}</p>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Meta label="Waar het vastliep">{item.problem ?? "—"}</Meta>
        <Meta label="Wat er is gebouwd">{item.work ?? "—"}</Meta>
        <Meta label="Wat zij claimen, hun eigen cijfer">{item.outcome || "Niets genoemd"}</Meta>
        <div className="grid gap-4 sm:grid-cols-2">
          <Meta label="Voor welke functie">{item.who || "—"}</Meta>
          <Meta label="Techniek">{item.stack || "—"}</Meta>
        </div>
        {item.quote ? (
          <div className="lg:col-span-2">
            <Meta label="Hun woorden">
              <p className="border-border border-l-2 pl-3 text-muted-foreground italic">{item.quote}</p>
            </Meta>
          </div>
        ) : null}
        {route ? (
          <div className="rounded-lg border border-border border-dashed p-3.5 lg:col-span-2">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="font-medium text-foreground">Hoe zo'n opdracht binnenkomt: {route.label}</span>
              <span className="text-muted-foreground">onze lezing, geen bron</span>
            </div>
            <p className="mt-1 text-[12px] text-muted-foreground leading-relaxed">{route.why}.</p>
          </div>
        ) : null}
        {item.source ? (
          <a
            href={item.source}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-muted-foreground hover:underline lg:col-span-2"
          >
            Gepubliceerde case: {item.source.replace("https://www.", "")}
          </a>
        ) : null}
      </div>
    </div>
  )
}

export default CaseDetail
