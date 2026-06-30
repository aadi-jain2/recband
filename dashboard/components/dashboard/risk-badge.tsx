import { cn } from "@/lib/utils"
import type { RiskTier } from "@/lib/types"

interface RiskBadgeProps {
  tier: RiskTier
  className?: string
  pulse?: boolean
}

const TIER_STYLES: Record<RiskTier, string> = {
  CRITICAL: "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400",
  HIGH:     "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400",
  MEDIUM:   "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400",
  LOW:      "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400",
}

const DOT_COLORS: Record<RiskTier, string> = {
  CRITICAL: "bg-red-500",
  HIGH:     "bg-orange-500",
  MEDIUM:   "bg-yellow-500",
  LOW:      "bg-green-500",
}

export function RiskBadge({ tier, className, pulse }: RiskBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        TIER_STYLES[tier],
        className,
      )}
    >
      <span
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          DOT_COLORS[tier],
          pulse && tier === "CRITICAL" && "animate-ping",
        )}
      />
      {tier}
    </span>
  )
}
