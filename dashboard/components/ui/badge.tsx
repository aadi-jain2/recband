import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline"
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
        {
          "default":     "border-transparent bg-[#0F4C81] text-white",
          "secondary":   "border-transparent bg-gray-100 text-gray-900",
          "destructive": "border-transparent bg-red-500 text-white",
          "outline":     "text-gray-900",
        }[variant],
        className,
      )}
      {...props}
    />
  )
}
