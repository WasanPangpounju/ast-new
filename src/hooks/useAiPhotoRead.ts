import { useState } from 'react'

export type AiDocType = 'stock_in' | 'bill'

export interface AiReadResult {
  docType: AiDocType
  fabricCode?: string | null
  fabricStruct?: string | null
  fabricPattern?: string | null
  fabricW?: string | null
  customer?: string | null
  createDate?: string | null
  rows?: { seq: number; yards: number }[]
  totalFolds?: number | null
  totalYards?: number | null
  _computedTotal?: number
  _totalMatch?: boolean
  billRef?: string | null
  supplier?: string | null
  customerId?: string | null
  pricePerYard?: number | null
  confidence?: Record<string, 'high' | 'medium' | 'low'>
  notes?: string | null
}

export function useAiPhotoRead() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AiReadResult | null>(null)

  async function readPhoto(file: File, docType: AiDocType): Promise<AiReadResult | null> {
    setLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('image', file)
      fd.append('docType', docType)
      const res = await fetch('/api/ai/read-fabric-photo', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'AI อ่านไม่สำเร็จ')
      setResult(json.data)
      return json.data
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
      return null
    } finally {
      setLoading(false)
    }
  }

  function reset() { setResult(null); setError(null) }

  return { readPhoto, loading, error, result, reset }
}
