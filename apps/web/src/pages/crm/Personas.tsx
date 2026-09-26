import { useEffect, useState } from "react"
import { Skeleton } from "#/components/crm/Panel.tsx"
import { PersonaDetail, ZekerheidChip } from "#/components/crm/PersonaDetail.tsx"
import { usePersonas } from "#/hooks/use-crm.ts"
import type { Persona } from "#/lib/persona-types.ts"
import { cn } from "#/lib/utils.ts"

/**
 * Persona's: wie er betaalt, en wie wij denken dat gaat betalen.
 *
 * Ze staan in Turso en niet in een bestand in deze repo, want een persona in een markdownbestand is
 * over een maand een bestand dat niemand meer opent. Het zijn geen CRM-objecten, dus ze zitten ook
 * niet in de records-lijst hiernaast: dit is van onszelf, en die grens moet zichtbaar blijven.
 *
 * De volgorde is die van Cooper's cast of characters: eerst de primaire persona, dan de secundaire,
 * en onderaan de negatieve, de partij waarvoor wij bewust niet schrijven. Precies een primaire, want
 * twee primaire persona's betekent dat er twee dingen tegelijk worden gebouwd.
 */

const GROEPEN = [
  { type: "primair", label: "Primair", uitleg: "Hiervoor wordt de site geschreven" },
  { type: "secundair", label: "Secundair", uitleg: "Meegewogen, niet leidend" },
  { type: "negatief", label: "Negatief", uitleg: "Hiervoor schrijven wij nu niet" },
] as const

function IndexRij({ persona, actief, onKies }: { persona: Persona; actief: boolean; onKies: () => void }) {
  return (
    <button
      type="button"
      onClick={onKies}
      className={cn(
        "w-full border-border border-b px-3 py-2.5 text-left transition-colors",
        actief ? "bg-accent/10" : "hover:bg-muted/60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 font-medium text-[13px] text-foreground leading-snug">{persona.naam}</span>
        <ZekerheidChip waarde={persona.zekerheid} />
      </div>
      <div className="pt-0.5 text-[11px] text-muted-foreground">
        {persona.roepnaam} · {persona.gesprekken} gesprekken
      </div>
    </button>
  )
}

export function Personas() {
  const { data, isLoading } = usePersonas()
  const personas = data?.personas ?? []
  const [gekozen, setGekozen] = useState<string | null>(null)

  // De pane toont altijd iets zodra er data is; een leeg halfscherm naast een gevulde lijst leest
  // als een fout in plaats van als een keuze. Hij opent op de primaire persona en niet op de eerste
  // rij uit de database, want anders staat de selectie ergens in het midden van de lijst.
  useEffect(() => {
    if (personas.some(persona => persona.id === gekozen)) return
    const opening = personas.find(persona => persona.type === "primair") ?? personas[0]
    if (opening) setGekozen(opening.id)
  }, [personas, gekozen])

  const huidige = personas.find(persona => persona.id === gekozen)

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-border border-r">
        <div className="border-border border-b px-3 py-3">
          <h1 className="font-semibold text-[15px] text-foreground tracking-tight">Persona's</h1>
          <p className="pt-0.5 text-[11px] text-muted-foreground leading-relaxed">
            Wie er betaalt en wie wij denken dat gaat betalen. Velden volgen Cooper en Revella; per bewering staat erbij
            hoe zeker die is.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          GROEPEN.map(groep => {
            const rijen = personas.filter(persona => persona.type === groep.type)
            if (!rijen.length) return null

            return (
              <div key={groep.type}>
                <div className="flex items-baseline justify-between gap-2 bg-muted/40 px-3 py-1.5">
                  <span className="font-medium text-[11px] text-foreground uppercase tracking-wide">{groep.label}</span>
                  <span className="text-[10px] text-muted-foreground">{groep.uitleg}</span>
                </div>
                {rijen.map(persona => (
                  <IndexRij
                    key={persona.id}
                    persona={persona}
                    actief={persona.id === gekozen}
                    onKies={() => setGekozen(persona.id)}
                  />
                ))}
              </div>
            )
          })
        )}
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-3 p-8">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : huidige ? (
          <PersonaDetail persona={huidige} />
        ) : (
          <div className="flex h-full items-center justify-center px-8 text-center">
            <p className="max-w-sm text-[13px] text-muted-foreground leading-relaxed">
              {data?.error ?? "Nog geen persona's in de database."}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default Personas
