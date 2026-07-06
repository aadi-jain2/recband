export type AdherenceTier = "HIGH" | "MEDIUM" | "LOW"
export type AdherenceMethod = "app_confirm" | "smart_pillbox" | "caregiver_report" | "missed"

export interface MedicationSchedule {
  med_name: string
  dosage: string
  frequency: string    // "once_daily" | "twice_daily" | "three_times_daily" | "as_needed"
  times: string[]      // HH:MM strings, e.g. ["08:00", "20:00"]
  is_critical: boolean // diuretic, inhaler, anticoagulant — missed doses = high risk
  category: "diuretic" | "beta_blocker" | "ace_inhibitor" | "inhaler" | "anticoagulant" | "other"
  start_date: string
}

export interface AdherenceLog {
  patient_id: string
  med_name: string
  scheduled_time: string   // ISO datetime
  taken: boolean
  taken_time: string | null
  method: AdherenceMethod
  date: string             // YYYY-MM-DD
}

export interface DailyAdherenceSummary {
  date: string             // YYYY-MM-DD
  scheduled: number
  taken: number
  missed: number
  pct: number              // 0-1
}

export interface PatientAdherenceState {
  patient_id: string
  adherence_tier: AdherenceTier
  medications: MedicationSchedule[]
  logs_7d: AdherenceLog[]
  daily_summary_7d: DailyAdherenceSummary[]
  overall_pct_7d: number   // 0-1
  critical_missed_streak: number   // consecutive days with a critical med missed
  last_critical_missed: string | null  // ISO date
  today_summary: { scheduled: number; taken: number; pending: number; missed: number }
}
