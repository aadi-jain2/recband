/**
 * RecoverPath — Time Utilities
 * All timestamp formatting in one place. No fake/seeded dates.
 * Uses date-fns for reliable, locale-consistent output.
 */

import {
  format,
  formatDistanceToNow,
  parseISO,
  isValid,
  compareAsc,
} from "date-fns"

// ── Parse helper — accepts ISO string, Date, or epoch ms ─────────────────────
export function parseTimestamp(ts: string | Date | number): Date {
  if (ts instanceof Date) return ts
  if (typeof ts === "number") return new Date(ts)
  // Handle both "2026-06-30T22:03:00" and "2026-06-30T22:03:00.000Z"
  const d = parseISO(ts)
  return isValid(d) ? d : new Date(ts)
}

// ── Formatters ─────────────────────────────────────────────────────────────────

/** "10:03 PM" */
export function formatClockTime(ts: string | Date | number): string {
  try {
    return format(parseTimestamp(ts), "h:mm a")
  } catch {
    return "—"
  }
}

/** "10:03:45 PM" */
export function formatClockTimeSecs(ts: string | Date | number): string {
  try {
    return format(parseTimestamp(ts), "h:mm:ss a")
  } catch {
    return "—"
  }
}

/** "22:03" — for chart x-axis labels */
export function formatChartTime(ts: string | Date | number): string {
  try {
    return format(parseTimestamp(ts), "HH:mm")
  } catch {
    return "—"
  }
}

/** "Jun 30, 2026 10:03 PM" — for tooltips */
export function formatDateTime(ts: string | Date | number): string {
  try {
    return format(parseTimestamp(ts), "MMM d, yyyy h:mm a")
  } catch {
    return "—"
  }
}

/** "Mon, 30 Jun 2026" */
export function formatDateLong(ts: string | Date | number): string {
  try {
    return format(parseTimestamp(ts), "EEE, d MMM yyyy")
  } catch {
    return "—"
  }
}

/** "30 Jun" */
export function formatDateShort(ts: string | Date | number): string {
  try {
    return format(parseTimestamp(ts), "d MMM")
  } catch {
    return "—"
  }
}

/**
 * "12s ago" / "3m ago" / "2h ago" / "yesterday"
 * Uses actual wall-clock distance from now — NEVER a hardcoded string.
 */
export function formatRelativeTime(ts: string | Date | number): string {
  try {
    const d = parseTimestamp(ts)
    const diff = Date.now() - d.getTime()
    if (diff < 5000)   return "just now"
    if (diff < 60000)  return `${Math.floor(diff / 1000)}s ago`
    return formatDistanceToNow(d, { addSuffix: true })
  } catch {
    return "—"
  }
}

/**
 * Safe Firebase key from timestamp: "2026-06-30T22-03-00"
 * Colons replaced with dashes (Firebase keys cannot contain colons).
 */
export function toFirebaseKey(ts: Date | string | number = new Date()): string {
  const d = ts instanceof Date ? ts : parseTimestamp(ts)
  return format(d, "yyyy-MM-dd'T'HH-mm-ss")
}

/** Sort an array of records that have a `.timestamp` field chronologically */
export function sortByTimestampAsc<T extends { timestamp: string }>(records: T[]): T[] {
  return [...records].sort((a, b) =>
    compareAsc(parseTimestamp(a.timestamp), parseTimestamp(b.timestamp))
  )
}

/**
 * Returns the cutoff Date for the rolling 24-hour window.
 * Any reading older than this should be dropped.
 */
export function windowStart24h(): Date {
  return new Date(Date.now() - 24 * 60 * 60 * 1000)
}

/**
 * Prune a list of timestamped records to the last 24 hours.
 * Also caps at maxRecords to avoid memory growth.
 */
export function pruneToWindow<T extends { timestamp: string }>(
  records: T[],
  maxRecords = 1440,
): T[] {
  const cutoff = windowStart24h().getTime()
  const kept = records.filter(r => {
    try { return parseTimestamp(r.timestamp).getTime() >= cutoff } catch { return false }
  })
  if (kept.length > maxRecords) return kept.slice(kept.length - maxRecords)
  return kept
}
