import { ExternalLink, Quote } from "lucide-react"
import { Panel } from "#/components/crm/Panel.tsx"
import { type Persona, type PersonaRing, RING_LABELS, type Zekerheid } from "#/lib/persona-types.ts"
import { cn } from "#/lib/utils.ts"

/**
 * Een persona, gelezen als een dossier en niet als een poster.
 *
 * Het belangrijkste dat dit scherm doet, is de zekerheid per veld tonen. De NN/g noemt een persona
 * zonder onderzoek een echoput waarin het team zijn eigen aanname terughoort als bevinding; de enige
 * manier om dat te voorkomen is de aanname op dezelfde regel als de bewering zetten. Vandaar dat het
 * label naast elke ring staat en niet als een enkele stempel bovenaan de pagina.
 *
 * Er staat geen foto, geen leeftijd en geen woonplaats. Die verklaren geen koopgedrag en worden na
 * een maand gelezen als iets wat wij weten.
 */

const ZEKERHEID_STIJL: Record<Zekerheid, string> = {
  geverifieerd: "border-success/40 text-success",
  kwalitatief: "border-border text-foreground",
  aanname: "border-warning/50 text-warning",
}

const ZEKERHEID_UITLEG: Record<Zekerheid, string> = {
  geverifieerd: "Aanwijsbare bron of letterlijk citaat",
  kwalitatief: "Uit gesprekken of uit ons eigen verloop",
  aanname: "Niemand heeft dit gehoord, wij denken dit",
}

export function ZekerheidChip({ waarde, className }: { waarde: Zekerheid; className?: string }) {
  return (
    <span
      title={ZEKERHEID_UITLEG[waarde]}
      className={cn(
        "shrink-0 rounded border px-1.5 py-px font-medium text-[10px] uppercase tracking-wide",
        ZEKERHEID_STIJL[waarde],
        className,
      )}
    >
      {waarde}
    </span>
  )
}

function Veld({ label, waarde }: { label: string; waarde: string | null }) {
  if (!waarde) return null
  return (
    <div className="border-border border-b px-4 py-3 last:border-b-0">
      <div className="pb-1 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <p className="text-[13px] text-foreground leading-relaxed">{waarde}</p>
    </div>
  )
}

function RingRij({ ring }: { ring: PersonaRing }) {
  return (
    <div className="border-border border-b px-4 py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3 pb-1">
        <div className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
          {RING_LABELS[ring.ring] ?? ring.ring}
        </div>
        <ZekerheidChip waarde={ring.zekerheid} />
      </div>
      <p className="text-[13px] text-foreground leading-relaxed">{ring.waarde}</p>
      {ring.bron ? <p className="pt-1 text-[11px] text-muted-foreground">Bron: {ring.bron}</p> : null}
    </div>
  )
}

export function PersonaDetail({ persona }: { persona: Persona }) {
  const negatief = persona.type === "negatief"

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-8 py-6">
      <header>
        <div className="flex flex-wrap items-center gap-2 pb-1">
          <span
            className={cn(
              "rounded border px-1.5 py-px font-medium text-[10px] uppercase tracking-wide",
              negatief ? "border-destructive/40 text-destructive" : "border-border text-muted-foreground",
            )}
          >
            {persona.type}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {persona.gesprekken} gesprekken · getoetst {persona.getoetst}
          </span>
        </div>
        <h1 className="font-semibold text-[19px] text-foreground tracking-tight">{persona.naam}</h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Wij noemen deze persoon {persona.roepnaam}. De naam is een handvat om over iemand te praten, geen gegeven.
        </p>
      </header>

      {negatief ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-foreground leading-relaxed">
          Negatieve persona: hiervoor schrijven wij nu bewust niet. Dat staat hier zodat de keuze niet elk kwartaal
          opnieuw ter discussie komt, en zodat zichtbaar is wat er moet veranderen voordat het wel kan.
        </p>
      ) : null}

      <Panel title="Wie dit is">
        <Veld label="Waarvoor deze persona geldt" waarde={persona.scope} />
        <Veld label="Rol en mandaat" waarde={persona.mandaat} />
        <Veld label="Doel" waarde={persona.doel} />
        <Veld label="Hoe het werk vandaag gaat" waarde={persona.werkwijze} />
        <Veld label="Denkwijze" waarde={persona.denkwijze} />
      </Panel>

      <Panel title="De vijf ringen">
        {persona.ringen.length ? (
          persona.ringen.map(ring => <RingRij key={ring.ring} ring={ring} />)
        ) : (
          <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">Nog geen ringen ingevuld.</p>
        )}
      </Panel>

      <Panel title="Citaten">
        {persona.citaten.length ? (
          persona.citaten.map(quote => (
            <figure key={quote.citaat.slice(0, 40)} className="border-border border-b px-4 py-3 last:border-b-0">
              <div className="flex gap-2">
                <Quote size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
                <blockquote className="text-[13px] text-foreground leading-relaxed">{quote.citaat}</blockquote>
              </div>
              <figcaption className="flex flex-wrap items-center gap-2 pt-2 pl-6 text-[11px] text-muted-foreground">
                <span>{quote.functie}</span>
                <ZekerheidChip waarde={quote.zekerheid} />
                {quote.bron?.startsWith("http") ? (
                  <a
                    href={quote.bron}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    bron <ExternalLink size={11} />
                  </a>
                ) : (
                  <span>{quote.bron}</span>
                )}
              </figcaption>
            </figure>
          ))
        ) : (
          <p className="px-4 py-6 text-[13px] text-muted-foreground leading-relaxed">
            Geen citaten. Dat is hier een bevinding en geen gat: een citaat is het enige veld dat niet in te vullen is
            zonder te liegen, dus er staat er pas een als iemand het echt heeft gezegd.
          </p>
        )}
      </Panel>

      <Panel title="Waarop dit rust">
        <div className="px-4 py-3">
          <div className="flex items-baseline justify-between gap-3 pb-1">
            <div className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">Bewijsbasis</div>
            <ZekerheidChip waarde={persona.zekerheid} />
          </div>
          <p className="text-[13px] text-foreground leading-relaxed">{persona.bewijsbasis}</p>
        </div>
      </Panel>
    </div>
  )
}

export default PersonaDetail
