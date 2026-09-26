import { cn } from "#/lib/utils.ts"
import { BASEMAP_ORDER, BASEMAPS } from "../config.ts"
import { useMapContext } from "../context.ts"

/**
 * Light / Street / Dark, as a segmented control.
 *
 * Three options is few enough to show them all — a dropdown here would hide two thirds of the choice
 * behind a click to save a strip of space the map is not using anyway.
 */
export function BasemapSwitcher({ className }: { className?: string }) {
  const { basemap, setBasemap } = useMapContext()

  return (
    <div
      className={cn(
        "pointer-events-auto inline-flex overflow-hidden rounded-md border border-border bg-card shadow-sm",
        className,
      )}
    >
      {BASEMAP_ORDER.map(id => (
        <button
          key={id}
          type="button"
          onClick={() => setBasemap(id)}
          aria-pressed={basemap === id}
          className={cn(
            "px-2.5 py-1.5 font-medium text-[11px] transition-colors",
            "border-border border-r last:border-r-0",
            basemap === id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted",
          )}
        >
          {BASEMAPS[id].label}
        </button>
      ))}
    </div>
  )
}
