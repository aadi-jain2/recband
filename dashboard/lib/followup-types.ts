export type AppointmentType = "PCP" | "Cardiology" | "Pulmonology" | "Telehealth" | "HomeVisit"
export type AppointmentStatus = "scheduled" | "confirmed" | "attended" | "no_show" | "cancelled"

export interface FollowUpAppointment {
  id: string
  patient_id: string
  appointment_type: AppointmentType
  scheduled_date: string       // ISO datetime
  days_post_discharge: number
  status: AppointmentStatus
  provider_name?: string
  notes?: string
}

export interface PatientFollowUpState {
  patient_id: string
  appointments: FollowUpAppointment[]
  next_appointment: FollowUpAppointment | null
  no_show_count: number
  attended_count: number
  no_show_rate: number   // 0-1
  has_scheduled_within_7d: boolean
  days_until_next: number | null
}
