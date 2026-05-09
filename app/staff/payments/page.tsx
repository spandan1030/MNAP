'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Toast } from '@/components/ui/Toast'

export default function PaymentsPage() {
  const supabase = createClient()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const [partyName, setPartyName] = useState('')
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
    const { error: err } = await supabase.from('party_payments').insert({
      day_session_id: sessionId,
      party_name: partyName,
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
    setPartyName(''); setAmount(''); setPaymentMode('cash'); setNotes('')
    setTimeout(() => setSuccess(false), 3000)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payment — Module G</h1>
        <p className="text-sm text-gray-500 mt-1">Record a payment made to a party. Cash payments reduce the cash register; bank transfers have no cash register impact.</p>
      </div>

      <Toast show={success} message="Entry submitted successfully and is pending admin review." />

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Party Name *</label>
            <input value={partyName} onChange={e => setPartyName(e.target.value)}
              className="input" required placeholder="Name of the party paid" />
          </div>
          <div>
            <label className="label">Amount (₹) *</label>
            <input type="number" step="0.01" min="0" value={amount}
              onChange={e => setAmount(e.target.value)}
              className="input" required />
          </div>
          <div>
            <label className="label">Mode of Payment *</label>
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
          {submitting ? 'Submitting…' : 'Submit Payment Entry'}
        </button>
      </form>
    </div>
  )
}
