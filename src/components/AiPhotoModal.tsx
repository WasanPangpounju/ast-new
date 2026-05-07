'use client'
import { useState, useRef, useCallback } from 'react'
import { useAiPhotoRead, AiDocType, AiReadResult } from '@/hooks/useAiPhotoRead'

interface AiPhotoModalProps {
  isOpen: boolean
  onClose: () => void
  docType: AiDocType
  onResult: (data: AiReadResult) => void
}

export default function AiPhotoModal({ isOpen, onClose, docType, onResult }: AiPhotoModalProps) {
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { readPhoto, loading, error } = useAiPhotoRead()

  const handleFile = useCallback((f: File) => {
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && f.type.startsWith('image/')) handleFile(f)
  }, [handleFile])

  async function handleRead() {
    if (!file) return
    const data = await readPhoto(file, docType)
    if (data) {
      onResult(data)
      onClose()
      setPreview(null)
      setFile(null)
    }
  }

  function handleClose() {
    setPreview(null)
    setFile(null)
    onClose()
  }

  if (!isOpen) return null

  const docLabel = docType === 'stock_in' ? 'ใบจดผ้าเข้าสต็อก' : 'บิล/ใบส่งสินค้า'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          padding: '1.5rem',
          width: '100%', maxWidth: '480px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '15px', color: '#111827' }}>อ่านจากรูปถ่าย</p>
            <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>{docLabel}</p>
          </div>
          <button onClick={handleClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', lineHeight: 1, color: '#9ca3af', padding: '2px 6px' }}
            aria-label="ปิด">×</button>
        </div>

        {!preview ? (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? '#185FA5' : '#d1d5db'}`,
              borderRadius: '8px', padding: '2rem', textAlign: 'center', cursor: 'pointer',
              background: dragging ? '#eff6ff' : '#f9fafb',
              marginBottom: '1rem', transition: 'all 0.15s',
            }}
          >
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📷</div>
            <p style={{ margin: '0 0 4px', fontSize: '14px', color: '#374151', fontWeight: 500 }}>ลากรูปมาวาง หรือคลิกเลือกไฟล์</p>
            <p style={{ margin: 0, fontSize: '12px', color: '#9ca3af' }}>JPG, PNG — รูปถ่ายจากมือถือ</p>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          </div>
        ) : (
          <div style={{ marginBottom: '1rem' }}>
            <img src={preview} alt="รูปที่เลือก"
              style={{ width: '100%', maxHeight: '240px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #e5e7eb' }} />
            <button onClick={() => { setPreview(null); setFile(null) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#6b7280', marginTop: '6px', textDecoration: 'underline' }}>
              เลือกรูปใหม่
            </button>
          </div>
        )}

        {error && (
          <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#dc2626', padding: '8px 12px', background: '#fef2f2', borderRadius: '6px', border: '1px solid #fecaca' }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={handleClose}
            style={{ padding: '7px 16px', fontSize: '13px', borderRadius: '6px', border: '1px solid #d1d5db', background: 'transparent', cursor: 'pointer', color: '#374151' }}>
            ยกเลิก
          </button>
          <button onClick={handleRead} disabled={!file || loading}
            style={{
              padding: '7px 18px', fontSize: '13px', fontWeight: 600, borderRadius: '6px', border: 'none',
              cursor: file && !loading ? 'pointer' : 'not-allowed',
              background: file && !loading ? '#2563eb' : '#e5e7eb',
              color: file && !loading ? '#fff' : '#9ca3af',
              transition: 'all 0.15s',
            }}>
            {loading ? '⏳ AI กำลังอ่าน...' : 'ให้ AI อ่านข้อมูล'}
          </button>
        </div>
      </div>
    </div>
  )
}
