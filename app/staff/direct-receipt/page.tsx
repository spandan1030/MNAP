'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Toast } from '@/components/ui/Toast'
import { useStaffSession } from '../session-context'

export default function DirectReceiptPage() {
  const supabase = createClient()
  const { sessionId, userId } = useStaffSession()
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const [sentBackEntries, setSentBackEntries] = useState<any[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)

  const [customerName, setCustomerName] = useState('')
  const [customerNumber, setCustomerNumber] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (sessionId && userId) loadSentBack(sessionId, userId)
  }, [sessionId, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadSentBack(sid: string, uid: string) {
    const { data } = await supabase.from('direct_receipts')
      .select('id, customer_name, customer_number, amount, payment_mode, notes, send_back_reason')
      .eq('day_session_id', sid).eq('status', 'sent_back').eq('submitted_by', uid)
    setSentBackEntries(data ?? [])
  }

  function loadForEdit(entry: any) {
    setCustomerName(entry.customer_name ?? '')
    setCustomerNumber(entry.customer_number ?? '')
    setAmount(entry.amount?.toString() ?? '')
    setNotes(entry.notes ?? '')
    setEditingId(entry.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditingId(null)
    setCustomerName(''); setCustomerNumber(''); setAmount(''); setNotes('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!sessionId) { setError('No open day session. Ask admin to open the day first.'); return }

    setSubmitting(true)

    const payload = {
      customer_name: customerName,
      customer_number: customerNumber || null,
      amount: parseFloat(amount),
      payment_mode: 'cash',
      notes: notes || null,
    }

    if (editingId) {
      const { error: err } = await supabase.from('direct_receipts').update({
        ...payload,
        status: 'pending',
        send_back_reason: null,
        submitted_at: new Date().toISOString(),
      }).eq('id', editingId)
      if (err) { setError(err.message) } else {
        setSuccess(true)
        setEditingId(null)
        await loadSentBack(sessionId, userId!)
        setCustomerName(''); setCustomerNumber(''); setAmount(''); setNotes('')
        setTimeout(() => setSuccess(false), 3000)
      }
      setSubmitting(false)
      return
    }

    const { error: err } = await supabase.from('direct_receipts').insert({
      ...payload,
      day_session_id: sessionId,
      submitted_by: userId!,
    })
    if (err) { setError(err.message); setSubmitting(false); return }
    setSuccess(true)
    setSubmitting(false)
    setCustomerName(''); setCustomerNumber(''); setAmount(''); setNotes('')
    setTimeout(() => setSuccess(false), 3000)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Direct Cash Receipt — Module F</h1>

      <Toast show={success} message={editingId ? 'Entry resubmitted for admin review.' : 'Entry submitted successfully and is pending admin review.'} />

      {/* Sent-back panel */}
      {sentBackEntries.length > 0 && (
        <div className="bg-orange-50 border border-orange-300 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-orange-800">↩ {sentBackEntries.length} entr{sentBackEntries.length > 1 ? 'ies' : 'y'} sent back for correction</p>
          {sentBackEntries.map(entry => (
            <div key={entry.id} className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-orange-900">{entry.customer_name} — ₹{entry.amount}</p>
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
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} className="input" rows={2} />
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">{error}</div>}

        <button type="submit" disabled={submitting}
          className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white font-semibold py-3 rounded-xl text-sm transition-colors">
          {submitting ? 'Submitting…' : editingId ? 'Resubmit Receipt' : 'Submit Receipt'}
        </button>
      </form>
    </div>
  )
}
