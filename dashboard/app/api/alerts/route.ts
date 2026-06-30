import { NextResponse } from "next/server"
import { buildFallbackPatients, buildFallbackAlerts } from "@/lib/mock-data"

export async function GET() {
  // In production this would query Firebase Admin SDK for active alerts.
  // For demo / development: derive alerts from the fallback patient snapshot.
  const patients  = buildFallbackPatients()
  const alerts    = buildFallbackAlerts(patients)
  const unacked   = alerts.filter(a => !a.acknowledged)

  return NextResponse.json({
    alerts:              alerts,
    total:               alerts.length,
    unacknowledgedCount: unacked.length,
  })
}
