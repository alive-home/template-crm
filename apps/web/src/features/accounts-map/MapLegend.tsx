import { useMemo } from "react"
import { mapTokens } from "#/features/map/index.ts"
import type { MapMeta } from "#/lib/map-types.ts"
import { BAND_LABELS, BAND_ORDER, bandColors } from "./style.ts"

/**
 * What the colours and the two dot shapes mean, plus the count the map cannot show.
 *
 * The second half is the important half. Many companies have no location at all — much of the list
 * was imported without an address — and a map that quietly draws only the placeable ones presents
 * itself as the whole CRM. The number is on screen for the same reason the queue reports the accounts
 * it withheld: a record that vanishes without a trace is one nobody goes looking for.
 */
export function MapLegend({ meta }: { meta: MapMeta | undefined }) {
  const colors = useMemo(() => bandColors(mapTokens()), [])

  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 z-10 rounded-lg border border-border bg-card/95 px-3 py-2.5 text-[10px] shadow-sm backdrop-blur">
      <div className="mb-1.5 font-medium text-[10px] text-muted-foreground">Prioriteitsband</div>
      <ul className="space-y-1">
        {BAND_ORDER.map(band => (
          <li key={band} className="flex items-center gap-2 text-foreground">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[band] }} />
            {BAND_LABELS[band]}
          </li>
        ))}
      </ul>

      <div className="mt-2.5 border-border border-t pt-2 text-muted-foreground">
        <div className="mb-1 font-medium text-foreground">Herkomst van de stip</div>
        <ul className="space-y-1">
          <li className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full bg-foreground/70" />
            Adres van het record
          </li>
          <li className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full border-[1.5px] border-foreground/70" />
            Middelpunt van de plaats
          </li>
        </ul>
      </div>

      {meta ? (
        <p className="mt-2.5 max-w-[190px] border-border border-t pt-2 text-muted-foreground leading-relaxed">
          {meta.placed} van {meta.total} bedrijven staan op de kaart. {meta.unplaced} hebben geen plaats op het record
          en ontbreken dus hier.
        </p>
      ) : null}
    </div>
  )
}
