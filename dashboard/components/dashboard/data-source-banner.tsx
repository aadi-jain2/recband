"use client"
/**
 * DataSourceBanner — always honest about what's real.
 * Shows whether data is coming from real hardware, simulator, or neither.
 */
import { useEffect, useState } from "react"
import { Wifi, Cpu } from "lucide-react"

interface HardwareStatus {
  connected: boolean
  source: "hardware" | "simulator" | "none"
  patientCount: number
  lastSeen?: string
  sensors?: {
    max30102: boolean
    mpu6050: boolean
    max30003: boolean
    max30009: boolean
  }
}

export function DataSourceBanner() {
  const [status, setStatus] = useState<HardwareStatus | null>(null)

  useEffect(() => {
    // Check Firebase for any hardware-sourced readings
    async function checkSource() {
      try {
        const FIREBASE_URL  = (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL : "") ?? ""
        const FIREBASE_KEY  = (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_FIREBASE_API_KEY : "") ?? ""
        const FIREBASE_LIVE =
          FIREBASE_URL.startsWith("https://") &&
          !FIREBASE_URL.includes("recoverpath-demo") &&
          FIREBASE_KEY !== "demo-key" &&
          FIREBASE_KEY.length > 10
        if (!FIREBASE_LIVE) {
          setStatus({ connected: false, source: "none", patientCount: 0 })
          return
        }
        // Check if any patient has source="hardware"
        const { getDatabase, ref, get } = await import("firebase/database")
        const { getApp }  = await import("firebase/app")
        const db  = getDatabase(getApp())
        const snap = await get(ref(db, "patients"))
        if (!snap.exists()) {
          setStatus({ connected: true, source: "none", patientCount: 0 })
          return
        }
        const data = snap.val() as Record<string, Record<string, unknown>>
        let hwCount  = 0, simCount = 0, total = 0
        Object.values(data).forEach(p => {
          total++
          const src = (p as Record<string, Record<string, unknown>>)?.latest_reading?.source
          if (src === "hardware" || src === "esp32_live") hwCount++
          if (src === "simulator") simCount++
        })
        setStatus({
          connected:    true,
          source:       hwCount > 0 ? "hardware" : simCount > 0 ? "simulator" : "none",
          patientCount: total,
        })
      } catch {
        setStatus({ connected: false, source: "none", patientCount: 0 })
      }
    }
    checkSource()
    const id = setInterval(checkSource, 60_000)
    return () => clearInterval(id)
  }, [])

  if (status === null) return null

  // Demo / fallback mode — no banner (works without Firebase)
  if (!status.connected || status.source === "none") return null

  if (status.source === "simulator") {
    return (
      <div className="flex items-center gap-2 border-b border-[#E5E7EB] bg-[#F9FAFB] px-6 py-1.5 text-[11px] text-[#6B7280]">
        <Cpu className="h-3 w-3 text-[#2563EB]" />
        <span>
          <span className="font-medium text-[#111827]">Simulator mode</span> —
          synthetic patient data · {status.patientCount} patients ·
          No hardware connected. For real sensor data, run <code className="font-mono">setup_esp32.py</code>.
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 border-b border-green-200 bg-green-50 px-6 py-1.5 text-[11px] text-green-800">
      <Wifi className="h-3 w-3" />
      <span>
        <span className="font-medium">Live — ESP32C6 hardware</span> ·
        Real sensor data · {status.patientCount} patients monitored
      </span>
    </div>
  )
}
