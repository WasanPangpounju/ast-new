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

export interface MaterialStockRow {
  yarnType: string
  supplierName: string
  totalSpool: number
  usedSpool: number
  remainingSpool: number
  totalWeightKg: number
  usedWeightKg: number
  remainingWeightKg: number
}
