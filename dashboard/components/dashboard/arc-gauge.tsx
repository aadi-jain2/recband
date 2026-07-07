"use client"
/**
 * ArcGauge — responsive SVG arc using stroke-dasharray on a <circle>.
 * Size is measured from the container so it scales with screen width.
 */

import { useEffect, useRef, useState } from "react"

interface ArcGaugeProps {
  score: number     // 0–100
  tier:  string
  size?: number     // optional fixed px override
}

const TIER_COLOR: Record<string, string> = {
  CRITICAL: "#DC2626",
  HIGH:     "#D97706",
  MEDIUM:   "#CA8A04",
  LOW:      "#16A34A",
}

export function ArcGauge({ score, tier, size }: ArcGaugeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dim, setDim] = useState(size ?? 160)

  useEffect(() => {
    if (size) {
      setDim(size)
      return
    }
    const el = containerRef.current
    if (!el) return

    const measure = () => {
      const w = el.clientWidth
      if (w > 0) setDim(Math.max(100, Math.min(w, 240)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [size])

  const cx = dim / 2
  const cy = dim / 2
  const r  = dim * 0.35
  const strokeW = dim * 0.09

  const circumference = 2 * Math.PI * r
  const GAUGE_DEG = 240
  const arcLength = circumference * (GAUGE_DEG / 360)
  const gapLength = circumference - arcLength

  const pct        = Math.min(100, Math.max(0, score)) / 100
  const fillLength = pct * arcLength
  const rotateDeg  = 150
  const color      = TIER_COLOR[tier] ?? "#9CA3AF"

  const tickAngles = [0, 25, 50, 75, 100].map(v => ({
    v,
    deg: 240 + (v / 100) * GAUGE_DEG,
  }))

  return (
    <div ref={containerRef} className="gauge-box w-full">
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${dim} ${dim}`}
        preserveAspectRatio="xMidYMid meet"
        aria-label={`Risk score ${Math.round(score)} — ${tier}`}
      >
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="#F3F4F6"
          strokeWidth={strokeW}
          strokeDasharray={`${arcLength} ${gapLength}`}
          strokeLinecap="round"
          transform={`rotate(${rotateDeg} ${cx} ${cy})`}
        />
        {pct > 0 && (
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={color}
            strokeWidth={strokeW}
            strokeDasharray={`${fillLength} ${circumference - fillLength}`}
            strokeLinecap="round"
            transform={`rotate(${rotateDeg} ${cx} ${cy})`}
            style={{ transition: "stroke-dasharray 700ms cubic-bezier(0.4,0,0.2,1)" }}
          />
        )}
        {tickAngles.map(({ v, deg }) => {
          const rad    = ((deg - 90) * Math.PI) / 180
          const inner  = r - strokeW / 2 - 5
          const outer  = r + strokeW / 2 + 3
          const labelR = r + strokeW / 2 + dim * 0.12
          return (
            <g key={v}>
              <line
                x1={cx + inner * Math.cos(rad)} y1={cy + inner * Math.sin(rad)}
                x2={cx + outer * Math.cos(rad)} y2={cy + outer * Math.sin(rad)}
                stroke="#E5E7EB" strokeWidth={1.5}
              />
              <text
                x={cx + labelR * Math.cos(rad)}
                y={cy + labelR * Math.sin(rad)}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={dim * 0.068} fill="#D1D5DB"
                fontFamily="Inter, system-ui, sans-serif"
              >
                {v}
              </text>
            </g>
          )
        })}
        <text
          x={cx} y={cy + dim * 0.04}
          textAnchor="middle"
          fontSize={dim * 0.26}
          fontWeight="700"
          fill={color}
          fontFamily="Inter, system-ui, sans-serif"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {Math.round(score)}
        </text>
        <text
          x={cx} y={cy + dim * 0.2}
          textAnchor="middle"
          fontSize={dim * 0.09}
          fill="#9CA3AF"
          fontFamily="Inter, system-ui, sans-serif"
        >
          / 100
        </text>
        <text
          x={cx} y={cy + dim * 0.32}
          textAnchor="middle"
          fontSize={dim * 0.1}
          fontWeight="600"
          fill={color}
          letterSpacing="0.06em"
          fontFamily="Inter, system-ui, sans-serif"
        >
          {tier}
        </text>
      </svg>
    </div>
  )
}
