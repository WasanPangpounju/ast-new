export interface MaterialEntryItem {
  lot: string
  spool: number
  yarnType: string
  supplierName: string
  importStatus?: string
  weightKgNet: number
  weightKgSum: number
  weightKgPackage: number
  pallet?: number
  box?: number
  sack?: number
  weightPNet?: number
  weightPSum?: number
  weightPPackage?: number
  averageKg?: number
  averageP?: number
  emp?: string
  note?: string
}

export interface MaterialEntryInput {
  items: MaterialEntryItem[]
}

export interface MaterialRequisitionInput {
  materialId?: number
  withdrawId: string
  department: string
  spool: number
  weightWithdrawn: number
  note?: string
}

export interface MaterialStockCompanyRow {
  yarnType: string
  supplierName: string
  totalSpool: number
  usedSpool: number
  remainingSpool: number
  totalWeightKg: number
  totalWeightLb: number
  usedWeightKg: number
  usedWeightLb: number
  remainingWeightKg: number
  remainingWeightLb: number
  // remainingSpool × avgWeightPerSpool (totalWeightKg/totalSpool) — ไม่ติดลบเหมือน remainingWeightKg เดิม
  // ดู docs/remaining-weight-formula-change-impact-assessment.md
  remainingWeightKgEstimated: number
  remainingWeightLbEstimated: number
}

export interface MaterialStockGroup {
  yarnType: string
  supplierCount: number
  totalSpool: number
  usedSpool: number
  remainingSpool: number
  totalWeightKg: number
  totalWeightLb: number
  usedWeightKg: number
  usedWeightLb: number
  remainingWeightKg: number
  remainingWeightLb: number
  remainingWeightKgEstimated: number
  remainingWeightLbEstimated: number
  autoExpand: boolean
  companies: MaterialStockCompanyRow[]
}
