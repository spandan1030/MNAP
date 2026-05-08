'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'phonepe', label: 'PhonePe' },
  { value: 'card', label: 'Card' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
]

export default function DirectReceiptPage() {
  const supabase = createClient()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const [customerName, setCustomerName] = useState('')
  const [customerNumber, setCustomerNumber] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentMode, setPaymentMode] = useState('cash')
  const [notes, setNotes] = useState('')

  useEffect(() => { loadSession() }, [])

  async function loadSession() {
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase.from('day_sessions').select('id, status').eq('date', today).eq('status', 'open').single()
    setSessionId(data?.id ?? null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!sessionId) { setError('No open day session. Ask admin to open the day first.'); return }

    setSubmitting(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error: err } = await supabase.from('direct_receipts').insert({
      day_session_id: sessionId,
      customer_name: customerName,
      customer_number: customerNumber || null,
      amount: parseFloat(amount),
      payment_mode: paymentMode,
      notes: notes || null,
      submitted_by: user!.id,
    })
    if (err) { setError(err.message); setSubmitting(false); return }
    setSuccess(true)
    setSubmitting(false)
    resetForm()
  }

  function resetForm() {
    setCustomerName(''); setCustomerNumber(''); setAmount(''); setPaymentMode('cash'); setNotes('')
    setTimeout(() => setSuccess(false), 4000)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Direct Money Receipt — Module F</h1>

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-green-700 text-sm font-medium">
          ✓ Entry submitted successfully and is pending admin review.
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Customer Name *</label>
            <input value={customerName} onChange={e => setCustomerName(e.target.value)} className="input" required />
          </div>
          <div>
            <label className="label">Phone / Reference Number</label>
            <input value={customerNumber} onChange={e => setCustomerNumber(e.target.value)} className="input" placeholder="Optional" />
          </div>
          <div>
            <label className="label">Amount (₹) *</label>
            <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} className="input" required />
          </div>
          <div>
            <label className="label">Payment Mode *</label>
            <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} className="input">
              {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} className="input" rows={2} />
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">{error}</div>}

        <button type="submit" disabled={submitting}
          className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white font-semibold py-3 rounded-xl text-sm transition-colors">
          {submitting ? 'Submitting…' : 'Submit Receipt'}
        </button>
      </form>
    </div>
  )
}
