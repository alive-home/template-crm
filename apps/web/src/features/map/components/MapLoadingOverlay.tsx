import { cn } from "#/lib/utils.ts"

/**
 * Covers the canvas until the first style is up.
 *
 * It is driven by `ready`, which is set either by MapLibre's `load` event or by the failsafe timer in
 * `useMapInstance` — `load` waits for every sprite and glyph, so one blocked request would otherwise
 * leave this panel sitting on top of a working map forever.
 */
export function MapLoadingOverlay({ ready }: { ready: boolean }) {
  return (
    <div
      aria-hidden={ready}
      className={cn(
        "pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background transition-opacity duration-500",
        ready ? "opacity-0" : "opacity-100",
      )}
    >
      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <span className="size-2 animate-pulse rounded-full bg-accent" />
        Loading map
      </div>
    </div>
  )
}
