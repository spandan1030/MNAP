'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Toast } from '@/components/ui/Toast'
import { useStaffSession } from '../session-context'

export default function ExpensesPage() {
  const supabase = createClient()
  const { sessionId, userId } = useStaffSession()
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const [sentBackEntries, setSentBackEntries] = useState<any[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)

  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentType, setPaymentType] = useState<'cash' | 'bank_transfer'>('cash')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (sessionId && userId) loadSentBack(sessionId, userId)
  }, [sessionId, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadSentBack(sid: string, uid: string) {
    const { data } = await supabase.from('expenses')
      .select('id, description, amount, payment_type, notes, send_back_reason')
      .eq('day_session_id', sid).eq('status', 'sent_back').eq('submitted_by', uid)
    setSentBackEntries(data ?? [])
  }

  function loadForEdit(entry: any) {
    setDescription(entry.description ?? '')
    setAmount(entry.amount?.toString() ?? '')
    setPaymentType(entry.payment_type ?? 'cash')
    setNotes(entry.notes ?? '')
    setEditingId(entry.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditingId(null)
    setDescription(''); setAmount(''); setPaymentType('cash'); setNotes('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!sessionId) { setError('No open day session. Ask admin to open the day.'); return }

    setSubmitting(true)

    const payload = {
      description,
      amount: parseFloat(amount),
      payment_type: paymentType,
      notes: notes || null,
    }

    if (editingId) {
      const { error: err } = await supabase.from('expenses').update({
        ...payload,
        status: 'pending',
        send_back_reason: null,
        submitted_at: new Date().toISOString(),
      }).eq('id', editingId)
      if (err) { setError(err.message) } else {
        setSuccess(true)
        setEditingId(null)
        await loadSentBack(sessionId, userId!)
        setDescription(''); setAmount(''); setPaymentType('cash'); setNotes('')
        setTimeout(() => setSuccess(false), 3000)
      }
      setSubmitting(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    const { error: err } = await supabase.from('expenses').insert({
      ...payload,
      day_session_id: sessionId,
      submitted_by: user!.id,
    })

    if (err) { setError(err.message) }
    else {
      setSuccess(true)
      setDescription(''); setAmount(''); setPaymentType('cash'); setNotes('')
      setTimeout(() => setSuccess(false), 3000)
    }
    setSubmitting(false)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Expense Entry — Module C</h1>

      <Toast show={success} message={editingId ? 'Expense resubmitted for admin review.' : 'Expense submitted and pending admin review.'} />

      {/* Sent-back panel */}
      {sentBackEntries.length > 0 && (
        <div className="bg-orange-50 border border-orange-300 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-orange-800">↩ {sentBackEntries.length} expense{sentBackEntries.length > 1 ? 's' : ''} sent back for correction</p>
          {sentBackEntries.map(entry => (
            <div key={entry.id} className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-orange-900">{entry.description} — ₹{entry.amount}</p>
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
          <p className="text-sm font-semibold text-amber-800">✏️ Editing sent-back expense — fix and resubmit</p>
          <button type="button" onClick={cancelEdit} className="text-xs text-amber-700 underline">Cancel edit</button>
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
          {submitting ? 'Submitting…' : editingId ? 'Resubmit Expense' : 'Submit Expense'}
        </button>
      </form>
    </div>
  )
}
