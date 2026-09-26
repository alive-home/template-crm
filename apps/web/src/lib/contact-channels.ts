/** React components cannot live in Turso, so database icon names meet lucide here. */
import { CircleDot, FileText, type LucideIcon, MailPlus, Search, Users } from "lucide-react"

/** Unknown database names deliberately resolve to `_fallback`, never to an empty chip. */
export const CHANNEL_ICONS: Record<string, LucideIcon> & { _fallback: LucideIcon } = {
  FileText,
  MailPlus,
  Search,
  Users,
  _fallback: CircleDot,
}
