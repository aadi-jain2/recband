import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "destructive" | "secondary" | "link"
  size?: "default" | "sm" | "lg" | "icon"
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F4C81] disabled:pointer-events-none disabled:opacity-50",
          {
            default:     "bg-[#0F4C81] text-white hover:bg-[#0d3f6e]",
            outline:     "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
            ghost:       "text-gray-700 hover:bg-gray-100",
            destructive: "bg-red-600 text-white hover:bg-red-700",
            secondary:   "bg-gray-100 text-gray-900 hover:bg-gray-200",
            link:        "text-[#0F4C81] underline-offset-4 hover:underline",
          }[variant],
          {
            default: "h-9 px-4 py-2 text-sm",
            sm:      "h-7 px-3 text-xs",
            lg:      "h-11 px-8 text-base",
            icon:    "h-9 w-9",
          }[size],
          className,
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"
