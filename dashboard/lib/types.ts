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

// Composite risk breakdown (clinical + behavioral + social)
export interface CompositeRisk {
  composite_score: number        // 0-100, shown in gauge
  clinical_score: number         // raw ML output
  behavioral_score: number       // adherence + followup modifier
  social_score: number           // SDOH modifier
  clinical_pct: number           // contribution to composite (0-1)
  behavioral_pct: number
  social_pct: number
  explanation: string            // human-readable reason
  flagged_by_nonclinical: boolean  // vitals normal but B/S elevated risk
}

// Risk driver flags for overview table
export interface RiskDrivers {
  clinical_elevated: boolean
  behavioral_elevated: boolean
  social_elevated: boolean
}

export interface Patient {
  id: string
  name: string
  age: number
  diagnosis: string
  diagnosisCode: string
  dischargeDate: string
  daysSinceDischarge: number
  riskScore: number            // composite score (0-100)
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
  // composite risk breakdown
  compositeRisk?: CompositeRisk
  riskDrivers?: RiskDrivers
  // data source — "esp32_live" means real hardware, "simulator" means synthetic
  dataSource?: "esp32_live" | "simulator" | "manual" | "hardware"
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
  // composite breakdown for analytics
  flaggedByNonClinical?: number   // patients with normal vitals but elevated B/S
  avgClinicalScore?: number
  avgBehavioralScore?: number
  avgSocialScore?: number
}
