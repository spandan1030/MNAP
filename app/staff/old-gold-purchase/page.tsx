'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Toast } from '@/components/ui/Toast'

export default function OldGoldPurchasePage() {
  const supabase = createClient()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const [sentBackEntries, setSentBackEntries] = useState<any[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [metalType, setMetalType] = useState<'gold' | 'silver'>('gold')
  const [purity, setPurity] = useState('')
  const [weight, setWeight] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [paymentMode, setPaymentMode] = useState('cash')
  const [notes, setNotes] = useState('')

  useEffect(() => { init() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function init() {
    const today = new Date().toISOString().split('T')[0]
    const [{ data: sessionData }, { data: { user } }] = await Promise.all([
      supabase.from('day_sessions').select('id').eq('date', today).eq('status', 'open').single(),
      supabase.auth.getUser(),
    ])
    const sid = sessionData?.id ?? null
    setSessionId(sid)
    setUserId(user?.id ?? null)
    if (sid && user) await loadSentBack(sid, user.id)
  }

  async function loadSentBack(sid: string, uid: string) {
    const { data } = await supabase.from('old_gold_purchases')
      .select('id, customer_name, customer_phone, metal_type, purity, weight, total_amount, payment_mode, notes, send_back_reason')
      .eq('day_session_id', sid).eq('status', 'sent_back').eq('submitted_by', uid)
    setSentBackEntries(data ?? [])
  }

  function loadForEdit(entry: any) {
    setCustomerName(entry.customer_name ?? '')
    setCustomerPhone(entry.customer_phone ?? '')
    setMetalType(entry.metal_type ?? 'gold')
    setPurity(entry.purity ?? '')
    setWeight(entry.weight?.toString() ?? '')
    setTotalAmount(entry.total_amount?.toString() ?? '')
    setPaymentMode(entry.payment_mode ?? 'cash')
    setNotes(entry.notes ?? '')
    setEditingId(entry.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditingId(null)
    resetForm(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!sessionId) { setError('No open day session. Ask admin to open the day first.'); return }
    if (!totalAmount) { setError('Amount is required.'); return }

    setSubmitting(true)

    const payload = {
      customer_name: customerName || null,
      customer_phone: customerPhone || null,
      metal_type: metalType,
      purity: purity || null,
      weight: parseFloat(weight) || null,
      rate_per_gram: null,
      total_amount: parseFloat(totalAmount),
      payment_mode: paymentMode,
      notes: notes || null,
    }

    if (editingId) {
      const { error: err } = await supabase.from('old_gold_purchases').update({
        ...payload,
        status: 'pending',
        send_back_reason: null,
        submitted_at: new Date().toISOString(),
      }).eq('id', editingId)
      if (err) { setError(err.message) } else {
        setSuccess(true)
        setEditingId(null)
        await loadSentBack(sessionId, userId!)
        resetForm(true)
      }
      setSubmitting(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    const { error: err } = await supabase.from('old_gold_purchases').insert({
      ...payload,
      day_session_id: sessionId,
      submitted_by: user!.id,
    })
    if (err) { setError(err.message); setSubmitting(false); return }
    setSuccess(true)
    setSubmitting(false)
    resetForm(true)
  }

  function resetForm(withToast = true) {
    setCustomerName(''); setCustomerPhone(''); setMetalType('gold'); setPurity('')
    setWeight(''); setTotalAmount(''); setPaymentMode('cash'); setNotes('')
    if (withToast) setTimeout(() => setSuccess(false), 3000)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Old Metal Purchase — Module E</h1>
        <p className="text-sm text-gray-500 mt-1">Record old metal (gold/silver) purchased from customer. Cash payments are tracked as cash outflow; bank transfer has no cash register impact.</p>
      </div>

      <Toast show={success} message={editingId ? 'Entry resubmitted for admin review.' : 'Entry submitted successfully and is pending admin review.'} />

      {/* Sent-back panel */}
      {sentBackEntries.length > 0 && (
        <div className="bg-orange-50 border border-orange-300 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-orange-800">↩ {sentBackEntries.length} entr{sentBackEntries.length > 1 ? 'ies' : 'y'} sent back for correction</p>
          {sentBackEntries.map(entry => (
            <div key={entry.id} className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-orange-900">{entry.customer_name || 'Unknown customer'} — {entry.metal_type} — ₹{entry.total_amount}</p>
                {entry.send_back_reason && <p className="text-xs text-orange-700 mt-0.5">Admin note: {entry.send_back_reason}</p>}
              </div>
              <button type="button" onClick={() => loadForEdit(entry)}
                className="flex-shrink-0 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                Load &amp; Fix
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Edit mode banner */}
      {editingId && (
        <div className="bg-amber-50 border border-amber-400 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-amber-800">✏️ Editing sent-back entry — fix and resubmit</p>
          <button type="button" onClick={cancelEdit} className="text-xs text-amber-700 underline">Cancel edit</button>
        </div>
      )}

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
          {submitting ? 'Submitting…' : editingId ? 'Resubmit Purchase Entry' : 'Submit Purchase Entry'}
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
