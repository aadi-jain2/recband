"use client"
import type { RiskTier } from "@/lib/types"

interface RiskGaugeProps {
  score: number
  tier: RiskTier
  size?: number
}

const TIER_COLORS: Record<RiskTier, string> = {
  CRITICAL: "#DC2626",
  HIGH: "#EA580C",
  MEDIUM: "#CA8A04",
  LOW: "#16A34A",
}

export function RiskGauge({ score, tier, size = 140 }: RiskGaugeProps) {
  const radius = (size - 20) / 2
  const circumference = Math.PI * radius  // half circle
  const filled = (score / 100) * circumference
  const color = TIER_COLORS[tier]
  const cx = size / 2
  const cy = size / 2 + 10

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.6} viewBox={`0 0 ${size} ${size * 0.6}`}>
        {/* Background arc */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke="#E5E7EB"
          strokeWidth="12"
          strokeLinecap="round"
        />
        {/* Filled arc */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
        {/* Score text */}
        <text
          x={cx}
          y={cy - 8}
          textAnchor="middle"
          fontSize="22"
          fontWeight="700"
          fill={color}
        >
          {score.toFixed(0)}
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" fontSize="10" fill="#6B7280">
          / 100
        </text>
        {/* Min/Max labels */}
        <text x={cx - radius} y={cy + 18} textAnchor="middle" fontSize="9" fill="#9CA3AF">0</text>
        <text x={cx + radius} y={cy + 18} textAnchor="middle" fontSize="9" fill="#9CA3AF">100</text>
      </svg>
    </div>
  )
}
