export type RiskTier = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"

export interface AnomalyScores {
  cardiac: number
  respiratory: number
  fluid: number
  activity: number
}

export interface VitalReading {
  timestamp: string
  minuteOffset: number
  spo2: number
  hrEcg: number
  hrPpg: number
  hrvSdnn: number
  biozOhms: number
  rrImu: number
  coughCount: number
  afibFlag: number
}

export interface Patient {
  id: string
  name: string
  age: number
  diagnosis: string
  diagnosisCode: string
  dischargeDate: string
  daysSinceDischarge: number
  riskScore: number
  riskTier: RiskTier
  riskProbability: number
  anomalyScores: AnomalyScores
  triggeredAlerts: string[]
  recommendedAction: string
  topRiskFeatures: string[]
  lastUpdated: string
  flaggedForFollowUp: boolean
  careCoordinatorNotes: string
  vitals: VitalReading[]
  // clinical details
  age_num: number
  numMedications: number
  numDiagnoses: number
  diabetesFlag: boolean
  copdFlag: boolean
  chfFlag: boolean
  numPriorAdmissions: number
}

export interface Alert {
  id: string
  patientId: string
  patientName: string
  riskTier: RiskTier
  message: string
  timestamp: string
  acknowledged: boolean
  acknowledgedAt?: string
  acknowledgedBy?: string
}

export interface PopulationStats {
  totalPatients: number
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  avgRiskScore: number
  readmissionRate: number
}
