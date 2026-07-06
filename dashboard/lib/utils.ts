import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Re-export time utils so existing imports of formatRelativeTime from utils still work
export { formatRelativeTime, formatClockTime, formatDateTime } from "./time-utils"

export function getRiskColor(tier: string): string {
  switch (tier) {
    case "CRITICAL": return "text-red-600 bg-red-50 border-red-200"
    case "HIGH": return "text-orange-600 bg-orange-50 border-orange-200"
    case "MEDIUM": return "text-yellow-600 bg-yellow-50 border-yellow-200"
    case "LOW": return "text-green-600 bg-green-50 border-green-200"
    default: return "text-gray-600 bg-gray-50 border-gray-200"
  }
}

export function getRiskDotColor(tier: string): string {
  switch (tier) {
    case "CRITICAL": return "bg-red-500"
    case "HIGH": return "bg-orange-500"
    case "MEDIUM": return "bg-yellow-500"
    case "LOW": return "bg-green-500"
    default: return "bg-gray-400"
  }
}

export function getRiskBarColor(score: number): string {
  if (score >= 75) return "#DC2626"
  if (score >= 50) return "#EA580C"
  if (score >= 25) return "#CA8A04"
  return "#16A34A"
}
