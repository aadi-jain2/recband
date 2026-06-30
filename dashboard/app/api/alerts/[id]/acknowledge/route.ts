import { NextRequest, NextResponse } from "next/server"

// In production, write to Firebase
// In dev, just acknowledge in-memory (stateless per request)
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return NextResponse.json({
    success: true,
    alertId: id,
    acknowledgedAt: new Date().toISOString(),
  })
}
