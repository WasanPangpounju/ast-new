export type SoVatType = 'SO' | 'SOX' | 'SOB'
export type VatInvoiceType = 'A' | 'B' | 'C'
export type OrderStatus = 'no data' | 'อนุมัติให้ผลิต' | string

export interface Order {
  id: number
  purchaseOrder: string   // SO number e.g. "SO6804/12"
  vat: SoVatType
  customerName: string
  fabricPattern: string
  fabricStructure: string
  orderSumYard: number
  status: OrderStatus
  deadline: string        // Thai date string from old DB
  createdAt: Date
  updatedAt: Date
}

export interface FabricRoll {
  id: number
  refId: string
  vatType: VatInvoiceType
  vatNo: number
  fold: number            // roll sequence number
  sumYard: number         // yards in this roll
  fabricStruct: string
  fabricPattern: string
  fabricW: string
  customerName: string
  createdAt: Date
}

export interface ApiResponse<T> {
  data: T
  message?: string
  error?: string
}
