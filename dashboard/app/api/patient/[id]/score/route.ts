import { NextRequest, NextResponse } from "next/server"
import { execSync } from "child_process"
import path from "path"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id || !/^P\d{3}$/.test(id)) {
    return NextResponse.json({ error: "Invalid patient ID" }, { status: 400 })
  }

  try {
    const rootDir = path.join(process.cwd(), "..")
    const cmd = `python src/inference.py --patient_id ${id} --mode api`
    const output = execSync(cmd, {
      cwd: rootDir,
      timeout: 30000,
      encoding: "utf-8",
    })
    const result = JSON.parse(output.trim())
    return NextResponse.json(result)
  } catch (err) {
    // Fallback: return mock result in dev
    if (process.env.NEXT_PUBLIC_APP_ENV !== "production") {
      return NextResponse.json({
        patient_id: id,
        risk_score: 65.2,
        risk_tier: "HIGH",
        risk_probability: 0.652,
        anomaly_scores: { cardiac: 0.61, respiratory: 0.58, fluid: 0.44, activity: 0.22 },
        triggered_alerts: ["Demo mode — Python inference not called"],
        recommended_action: "Contact patient today",
        top_risk_features: ["hrv_sdnn", "spo2_mean", "bioz_ohms_trend_24hr"],
        days_since_discharge: 7,
      })
    }
    const message = err instanceof Error ? err.message : "Inference failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
