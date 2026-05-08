'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ExpensesPage() {
  const supabase = createClient()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentType, setPaymentType] = useState<'cash' | 'bank_transfer'>('cash')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    createClient().from('day_sessions').select('id').eq('date', today).eq('status', 'open').single()
      .then(({ data }) => setSessionId(data?.id ?? null))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!sessionId) { setError('No open day session. Ask admin to open the day.'); return }

    setSubmitting(true)
    const { data: { user } } = await supabase.auth.getUser()

    const { error: err } = await supabase.from('expenses').insert({
      day_session_id: sessionId,
      description,
      amount: parseFloat(amount),
      payment_type: paymentType,
      notes: notes || null,
      submitted_by: user!.id,
    })

    if (err) { setError(err.message) }
    else {
      setSuccess(true)
      setDescription(''); setAmount(''); setPaymentType('cash'); setNotes('')
      setTimeout(() => setSuccess(false), 4000)
    }
    setSubmitting(false)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Expense Entry — Module C</h1>

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-green-700 text-sm font-medium">
          ✓ Expense submitted and pending admin review.
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div>
          <label className="label">Expense Description *</label>
          <input value={description} onChange={e => setDescription(e.target.value)} required
            placeholder="e.g. Electricity bill, packaging, petrol" className="input" />
        </div>

        <div>
          <label className="label">Amount (₹) *</label>
          <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} required className="input" />
        </div>

        <div>
          <label className="label">Payment Type *</label>
          <div className="flex gap-3 mt-1">
            {(['cash', 'bank_transfer'] as const).map(t => (
              <button key={t} type="button" onClick={() => setPaymentType(t)}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${paymentType === t ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-gray-700 border-gray-300 hover:border-amber-400'}`}>
                {t === 'cash' ? 'Cash' : 'Bank Transfer'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
            placeholder="Optional" />
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>}

        <button type="submit" disabled={submitting}
          className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white font-semibold py-2.5 rounded-xl text-sm">
          {submitting ? 'Submitting…' : 'Submit Expense'}
        </button>
      </form>
    </div>
  )
}
