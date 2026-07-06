/**
 * RecoverPath — Follow-Up Appointment Simulator
 * Generates realistic appointment histories per patient.
 */

import type {
  AppointmentType, AppointmentStatus,
  FollowUpAppointment, PatientFollowUpState,
} from "./followup-types"

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10) + "T09:00:00"
}

function daysFromNow(dateStr: string): number {
  const now = new Date()
  const appt = new Date(dateStr)
  return Math.round((appt.getTime() - now.getTime()) / 86400000)
}

// No-show probability — higher social risk / lower adherence = higher no-show
const NO_SHOW_RATES: Record<string, number> = {
  P001:0.20, P002:0.30, P003:0.15, P004:0.35, P005:0.15,
  P006:0.05, P007:0.10, P008:0.40, P009:0.05, P010:0.05,
  P011:0.20, P012:0.15, P013:0.10, P014:0.05, P015:0.20,
  P016:0.05, P017:0.35, P018:0.05, P019:0.05, P020:0.10,
  P021:0.15, P022:0.20, P023:0.05, P024:0.25, P025:0.05,
}

function seeded(patientId: string, i: number): number {
  const s = patientId.charCodeAt(1) * 17 + i * 7
  return (Math.sin(s) * 43758.5453123) % 1
}

export function buildFollowUpState(
  patientId: string,
  diagnosis: string,
  dischargeDate: string,
): PatientFollowUpState {
  const noShowRate = NO_SHOW_RATES[patientId] ?? 0.15
  const appointments: FollowUpAppointment[] = []
  let seq = 0

  const apptTemplates: Array<{ type: AppointmentType; dayOffset: number; provider: string }> = [
    { type: "PCP",         dayOffset: 7,  provider: "Dr. Meenakshi Iyer" },
    { type: diagnosis === "CHF" ? "Cardiology" : diagnosis === "COPD" ? "Pulmonology" : "PCP",
                           dayOffset: 14, provider: diagnosis === "CHF" ? "Dr. Ramesh Nair (Cardiology)" : "Dr. Sunita Kapoor (Pulmonology)" },
    { type: "Telehealth",  dayOffset: 21, provider: "RecoverPath Remote Care" },
    { type: "PCP",         dayOffset: 30, provider: "Dr. Meenakshi Iyer" },
  ]

  for (const tmpl of apptTemplates) {
    const scheduledDate = addDays(dischargeDate, tmpl.dayOffset)
    const daysFromNowVal = daysFromNow(scheduledDate)
    let status: AppointmentStatus

    if (daysFromNowVal < -1) {
      // Past appointment — determine outcome
      const roll = Math.abs(seeded(patientId, seq * 31))
      if (roll < noShowRate) status = "no_show"
      else if (roll < noShowRate + 0.05) status = "cancelled"
      else status = "attended"
    } else if (daysFromNowVal < 1) {
      status = "confirmed"
    } else {
      // Future
      const roll = Math.abs(seeded(patientId, seq * 17))
      status = roll < 0.3 ? "confirmed" : "scheduled"
    }

    appointments.push({
      id: `${patientId}-APT${String(++seq).padStart(3,"0")}`,
      patient_id: patientId,
      appointment_type: tmpl.type,
      scheduled_date: scheduledDate,
      days_post_discharge: tmpl.dayOffset,
      status,
      provider_name: tmpl.provider,
    })
  }

  const past = appointments.filter(a => daysFromNow(a.scheduled_date) < 0)
  const noShows = past.filter(a => a.status === "no_show").length
  const attended = past.filter(a => a.status === "attended").length
  const next = appointments
    .filter(a => daysFromNow(a.scheduled_date) >= -1 && a.status !== "cancelled")
    .sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime())[0] ?? null

  const daysUntil = next ? daysFromNow(next.scheduled_date) : null
  const hasScheduledWithin7d = daysUntil !== null && daysUntil <= 7

  return {
    patient_id: patientId,
    appointments,
    next_appointment: next,
    no_show_count: noShows,
    attended_count: attended,
    no_show_rate: past.length > 0 ? noShows / past.length : 0,
    has_scheduled_within_7d: hasScheduledWithin7d,
    days_until_next: daysUntil,
  }
}

let _cache: Record<string, PatientFollowUpState> | null = null

export function getAllFollowUp(
  registry: Record<string, { id: string; diagnosis: string; dischargeDate: string }>
): Record<string, PatientFollowUpState> {
  if (_cache) return _cache
  _cache = {}
  for (const [id, reg] of Object.entries(registry)) {
    _cache[id] = buildFollowUpState(id, reg.diagnosis, reg.dischargeDate)
  }
  return _cache
}
