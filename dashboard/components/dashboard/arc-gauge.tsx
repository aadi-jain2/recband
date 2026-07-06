"use client"
/**
 * ArcGauge — reliable SVG arc using stroke-dasharray on a <circle>.
 *
 * Geometry:
 *   • 240° of arc (120° gap at the bottom)
 *   • Starts at 8 o'clock (240° from 12, clockwise)
 *   • Ends   at 4 o'clock (120° from 12, clockwise)
 *   • Score 0-100 maps to 0-240° of fill
 *
 * Using stroke-dasharray is far more reliable than SVG arc paths when
 * start/end points share the same X coordinate.
 */

interface ArcGaugeProps {
  score: number     // 0–100
  tier:  string
  size?: number     // px, default 160
}

const TIER_COLOR: Record<string, string> = {
  CRITICAL: "#DC2626",
  HIGH:     "#D97706",
  MEDIUM:   "#CA8A04",
  LOW:      "#16A34A",
}

export function ArcGauge({ score, tier, size = 160 }: ArcGaugeProps) {
  const cx = size / 2
  const cy = size / 2
  const r  = size * 0.35
  const strokeW = size * 0.09

  const circumference = 2 * Math.PI * r

  // 240° of visible arc, 120° gap at the bottom
  const GAUGE_DEG = 240
  const arcLength = circumference * (GAUGE_DEG / 360)
  const gapLength = circumference - arcLength

  // Score fill: clamp 0-100
  const pct        = Math.min(100, Math.max(0, score)) / 100
  const fillLength = pct * arcLength

  // SVG stroke starts at 3-o'clock (90° from top).
  // We want the arc to start at 8-o'clock = 240° from top (clockwise).
  // SVG rotation needed = 240° - 90° = 150°
  const rotateDeg = 150

  const color = TIER_COLOR[tier] ?? "#9CA3AF"

  // Scale tick angles (relative to 12 o'clock, clockwise)
  const tickAngles = [0, 25, 50, 75, 100].map(v => ({
    v,
    // 240° from 8-o'clock start (= 240° from top)
    deg: 240 + (v / 100) * GAUGE_DEG,
  }))

  return (
    <svg
      width={size}
      height={size * 0.88}
      viewBox={`0 0 ${size} ${size}`}
      aria-label={`Risk score ${Math.round(score)} — ${tier}`}
    >
      {/* ── Track — full 240° in light gray ── */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke="#F3F4F6"
        strokeWidth={strokeW}
        strokeDasharray={`${arcLength} ${gapLength}`}
        strokeLinecap="round"
        transform={`rotate(${rotateDeg} ${cx} ${cy})`}
      />

      {/* ── Fill — colored arc proportional to score ── */}
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

      {/* ── Scale ticks ── */}
      {tickAngles.map(({ v, deg }) => {
        const rad    = ((deg - 90) * Math.PI) / 180
        const inner  = r - strokeW / 2 - 5
        const outer  = r + strokeW / 2 + 3
        const labelR = r + strokeW / 2 + size * 0.12
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
              fontSize={size * 0.068} fill="#D1D5DB"
              fontFamily="Inter, system-ui, sans-serif"
            >
              {v}
            </text>
          </g>
        )
      })}

      {/* ── Score number ── */}
      <text
        x={cx}
        y={cy + size * 0.04}
        textAnchor="middle"
        fontSize={size * 0.26}
        fontWeight="700"
        fill={color}
        fontFamily="Inter, system-ui, sans-serif"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {Math.round(score)}
      </text>

      {/* ── "/ 100" sub-label ── */}
      <text
        x={cx}
        y={cy + size * 0.2}
        textAnchor="middle"
        fontSize={size * 0.09}
        fill="#9CA3AF"
        fontFamily="Inter, system-ui, sans-serif"
      >
        / 100
      </text>

      {/* ── Tier label ── */}
      <text
        x={cx}
        y={cy + size * 0.32}
        textAnchor="middle"
        fontSize={size * 0.1}
        fontWeight="600"
        fill={color}
        letterSpacing="0.06em"
        fontFamily="Inter, system-ui, sans-serif"
      >
        {tier}
      </text>
    </svg>
  )
}
