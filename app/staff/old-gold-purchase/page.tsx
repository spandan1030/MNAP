'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Toast } from '@/components/ui/Toast'

export default function OldGoldPurchasePage() {
  const supabase = createClient()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [metalType, setMetalType] = useState<'gold' | 'silver'>('gold')
  const [purity, setPurity] = useState('')
  const [weight, setWeight] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
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
    if (!totalAmount) { setError('Amount is required.'); return }

    setSubmitting(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error: err } = await supabase.from('old_gold_purchases').insert({
      day_session_id: sessionId,
      customer_name: customerName || null,
      customer_phone: customerPhone || null,
      metal_type: metalType,
      purity: purity || null,
      weight: parseFloat(weight) || null,
      rate_per_gram: null,
      total_amount: parseFloat(totalAmount),
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
    setCustomerName(''); setCustomerPhone(''); setMetalType('gold'); setPurity('')
    setWeight(''); setTotalAmount(''); setPaymentMode('cash'); setNotes('')
    setTimeout(() => setSuccess(false), 3000)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Old Metal Purchase — Module E</h1>
        <p className="text-sm text-gray-500 mt-1">Record old metal (gold/silver) purchased from customer. Cash payments are tracked as cash outflow; bank transfer has no cash register impact.</p>
      </div>

      <Toast show={success} message="Entry submitted successfully and is pending admin review." />

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Customer Name" value={customerName} onChange={setCustomerName} />
          <Field label="Customer Phone" value={customerPhone} onChange={setCustomerPhone} type="tel" />
          <div>
            <label className="label">Metal Type</label>
            <select value={metalType} onChange={e => setMetalType(e.target.value as 'gold' | 'silver')} className="input">
              <option value="gold">Gold</option>
              <option value="silver">Silver</option>
            </select>
          </div>
          <div>
            <label className="label">Expected Purity</label>
            <input value={purity} onChange={e => setPurity(e.target.value)} className="input" placeholder="e.g. 22K, 18K, 916…" />
          </div>
          <Field label="Weight (g)" value={weight} onChange={setWeight} type="number" />
          <div>
            <label className="label">Total Amount Paid (₹) *</label>
            <input type="number" step="0.01" min="0" value={totalAmount}
              onChange={e => setTotalAmount(e.target.value)}
              className="input" required />
          </div>
          <div>
            <label className="label">Payment Mode *</label>
            <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} className="input">
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer</option>
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
          {submitting ? 'Submitting…' : 'Submit Purchase Entry'}
        </button>
      </form>
    </div>
  )
}

function Field({ label, value, onChange, required, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean; type?: string
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} required={required}
        className="input" step={type === 'number' ? '0.001' : undefined} min={type === 'number' ? '0' : undefined} />
    </div>
  )
}
