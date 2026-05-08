'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type ReceiptType = 'advance' | 'sip' | 'customer_credit' | 'repair'
const RECEIPT_LABELS: Record<ReceiptType, string> = {
  advance: 'Advance Receipt',
  sip: 'SIP Receipt',
  customer_credit: 'Customer Credit Receipt',
  repair: 'Repairing Receipt',
}
const PAYMENT_MODES = ['cash', 'card', 'upi', 'cheque']

export default function ReceiptsPage() {
  const supabase = createClient()
  const [receiptType, setReceiptType] = useState<ReceiptType>('advance')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const [serialNumber, setSerialNumber] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [repairType, setRepairType] = useState('')
  const [weight, setWeight] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentMode, setPaymentMode] = useState('cash')
  const [chequeNumber, setChequeNumber] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => { loadSession() }, [])

  async function loadSession() {
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase.from('day_sessions').select('id').eq('date', today).eq('status', 'open').single()
    setSessionId(data?.id ?? null)
  }

  function resetForm() {
    setSerialNumber(''); setCustomerName(''); setRepairType(''); setWeight('')
    setAmount(''); setPaymentMode('cash'); setChequeNumber(''); setNotes('')
    setTimeout(() => setSuccess(false), 4000)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!sessionId) { setError('No open day session. Ask admin to open the day.'); return }

    setSubmitting(true)
    const { data: { user } } = await supabase.auth.getUser()

    const { error: err } = await supabase.from('money_receipts').insert({
      day_session_id: sessionId,
      receipt_type: receiptType,
      serial_number: (receiptType === 'advance' || receiptType === 'sip') ? serialNumber : null,
      customer_name: customerName,
      repair_type: receiptType === 'repair' ? repairType : null,
      weight: receiptType === 'repair' && weight ? parseFloat(weight) : null,
      amount: parseFloat(amount),
      payment_mode: paymentMode,
      cheque_number: paymentMode === 'cheque' ? chequeNumber : null,
      notes: notes || null,
      submitted_by: user!.id,
    })

    if (err) { setError(err.message) }
    else { setSuccess(true); resetForm() }
    setSubmitting(false)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Money Receipt — Module B</h1>

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-green-700 text-sm font-medium">
          ✓ Receipt submitted and pending admin review.
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <label className="label">Receipt Type *</label>
        <div className="grid grid-cols-2 gap-2 mt-1">
          {(Object.keys(RECEIPT_LABELS) as ReceiptType[]).map(t => (
            <button
              key={t} type="button"
              onClick={() => setReceiptType(t)}
              className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${receiptType === t ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-gray-700 border-gray-300 hover:border-amber-400'}`}
            >
              {RECEIPT_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">{RECEIPT_LABELS[receiptType]}</h3>

        {(receiptType === 'advance' || receiptType === 'sip') && (
          <Field label={`${receiptType === 'advance' ? 'Advance' : 'SIP'} Serial Number *`} value={serialNumber} onChange={setSerialNumber} required />
        )}

        <Field label="Customer Name *" value={customerName} onChange={setCustomerName} required />

        {receiptType === 'repair' && (
          <>
            <Field label="Repair Type *" value={repairType} onChange={setRepairType} required placeholder="e.g. sizing, soldering, polishing" />
            <Field label="Weight (g)" value={weight} onChange={setWeight} type="number" placeholder="Optional" />
          </>
        )}

        <Field label="Amount (₹) *" value={amount} onChange={setAmount} required type="number" />

        <div>
          <label className="label">Payment Mode *</label>
          <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} className="input">
            {PAYMENT_MODES.map(m => <option key={m} value={m} className="capitalize">{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
          </select>
        </div>

        {paymentMode === 'cheque' && (
          <Field label="Cheque Number" value={chequeNumber} onChange={setChequeNumber} placeholder="Optional" />
        )}

        <div>
          <label className="label">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
            placeholder="Optional notes"
          />
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>}

        <button type="submit" disabled={submitting}
          className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white font-semibold py-2.5 rounded-xl text-sm">
          {submitting ? 'Submitting…' : 'Submit Receipt'}
        </button>
      </form>
    </div>
  )
}

function Field({ label, value, onChange, required, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean; type?: string; placeholder?: string
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} required={required}
        placeholder={placeholder} step={type === 'number' ? '0.01' : undefined} min={type === 'number' ? '0' : undefined}
        className="input" />
    </div>
  )
}
