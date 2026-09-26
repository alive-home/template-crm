import { CHANNEL_ICONS } from "#/lib/contact-channels.ts"
import type { ContactChannel } from "#/lib/market-types.ts"
import { cn } from "#/lib/utils.ts"

/**
 * Hoe het eerste contact is gelegd, als chip.
 *
 * Alleen een outline, nooit een vlak: dit is een categorie op een rij met andere gegevens en niet
 * een status die aandacht opeist. Groen betekent hier dat het contact van de andere kant kwam, en
 * verder niets. Het is geen oordeel over de opdracht, want koud binnengekomen werk is niet minder
 * waard dan werk dat vanzelf binnenliep, alleen een ander soort werk.
 */
export function ContactBadge({
  channel,
  size = "default",
  className,
}: {
  channel: ContactChannel
  size?: "default" | "sm"
  className?: string
}) {
  const Icon = CHANNEL_ICONS[channel.icon] ?? CHANNEL_ICONS._fallback

  return (
    <span
      title={channel.what}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border bg-transparent font-medium",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]",
        channel.inbound ? "border-contact-inbound/70 text-contact-inbound" : "border-border text-muted-foreground",
        className,
      )}
    >
      <Icon size={size === "sm" ? 10 : 12} className="shrink-0" />
      {channel.label}
    </span>
  )
}

export default ContactBadge
