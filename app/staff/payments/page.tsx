'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Toast } from '@/components/ui/Toast'

export default function PaymentsPage() {
  const supabase = createClient()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const [sentBackEntries, setSentBackEntries] = useState<any[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)

  const [partyName, setPartyName] = useState('')
  const [amount, setAmount] = useState('')
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
    const { data } = await supabase.from('party_payments')
      .select('id, party_name, amount, payment_mode, notes, send_back_reason')
      .eq('day_session_id', sid).eq('status', 'sent_back').eq('submitted_by', uid)
    setSentBackEntries(data ?? [])
  }

  function loadForEdit(entry: any) {
    setPartyName(entry.party_name ?? '')
    setAmount(entry.amount?.toString() ?? '')
    setPaymentMode(entry.payment_mode ?? 'cash')
    setNotes(entry.notes ?? '')
    setEditingId(entry.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditingId(null)
    setPartyName(''); setAmount(''); setPaymentMode('cash'); setNotes('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!sessionId) { setError('No open day session. Ask admin to open the day first.'); return }

    setSubmitting(true)

    const payload = {
      party_name: partyName,
      amount: parseFloat(amount),
      payment_mode: paymentMode,
      notes: notes || null,
    }

    if (editingId) {
      const { error: err } = await supabase.from('party_payments').update({
        ...payload,
        status: 'pending',
        send_back_reason: null,
        submitted_at: new Date().toISOString(),
      }).eq('id', editingId)
      if (err) { setError(err.message) } else {
        setSuccess(true)
        setEditingId(null)
        await loadSentBack(sessionId, userId!)
        setPartyName(''); setAmount(''); setPaymentMode('cash'); setNotes('')
        setTimeout(() => setSuccess(false), 3000)
      }
      setSubmitting(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    const { error: err } = await supabase.from('party_payments').insert({
      ...payload,
      day_session_id: sessionId,
      submitted_by: user!.id,
    })
    if (err) { setError(err.message); setSubmitting(false); return }
    setSuccess(true)
    setSubmitting(false)
    setPartyName(''); setAmount(''); setPaymentMode('cash'); setNotes('')
    setTimeout(() => setSuccess(false), 3000)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payment — Module G</h1>
        <p className="text-sm text-gray-500 mt-1">Record a payment made to a party. Cash payments reduce the cash register; bank transfers have no cash register impact.</p>
      </div>

      <Toast show={success} message={editingId ? 'Payment resubmitted for admin review.' : 'Entry submitted successfully and is pending admin review.'} />

      {/* Sent-back panel */}
      {sentBackEntries.length > 0 && (
        <div className="bg-orange-50 border border-orange-300 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-orange-800">↩ {sentBackEntries.length} payment{sentBackEntries.length > 1 ? 's' : ''} sent back for correction</p>
          {sentBackEntries.map(entry => (
            <div key={entry.id} className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-orange-900">{entry.party_name} — ₹{entry.amount}</p>
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
          <p className="text-sm font-semibold text-amber-800">✏️ Editing sent-back payment — fix and resubmit</p>
          <button type="button" onClick={cancelEdit} className="text-xs text-amber-700 underline">Cancel edit</button>
        </div>
      )}

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
          {submitting ? 'Submitting…' : editingId ? 'Resubmit Payment Entry' : 'Submit Payment Entry'}
        </button>
      </form>
    </div>
  )
}
