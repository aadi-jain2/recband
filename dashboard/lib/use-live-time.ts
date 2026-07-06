"use client"
/**
 * RecoverPath — Live Clock Hooks
 * All hooks use a null initial state so SSR produces no timestamp output,
 * eliminating the React hydration mismatch warning from server/client time diffs.
 */

import { useState, useEffect } from "react"
import { format } from "date-fns"

export interface LiveTime {
  now: Date | null
  clockTime: string
  clockTimeSecs: string
  fullDate: string
  shortDate: string
  clockAndDate: string
  epochMs: number
}

const FALLBACK: LiveTime = {
  now: null,
  clockTime: "",
  clockTimeSecs: "——:——:——",
  fullDate: "",
  shortDate: "",
  clockAndDate: "",
  epochMs: 0,
}

export function useLiveTime(tickEveryMs = 1000): LiveTime {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), tickEveryMs)
    return () => clearInterval(id)
  }, [tickEveryMs])

  if (!now) return FALLBACK

  return {
    now,
    clockTime:     format(now, "h:mm a"),
    clockTimeSecs: format(now, "HH:mm:ss"),
    fullDate:      format(now, "EEEE, d MMMM yyyy"),
    shortDate:     format(now, "d MMM yyyy"),
    clockAndDate:  format(now, "h:mm a · EEE d MMM yyyy"),
    epochMs:       now.getTime(),
  }
}

/** Lightweight — ticks every minute for "X ago" label freshness */
export function useLiveMinute(): Date {
  const [now, setNow] = useState<Date>(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}
