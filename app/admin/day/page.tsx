'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import type { DaySession } from '@/lib/types'

export default function DayRegisterPage() {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]

  const [session, setSession] = useState<DaySession | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  const [openA, setOpenA] = useState('')
  const [openB, setOpenB] = useState('')
  const [closeA, setCloseA] = useState('')
  const [closeB, setCloseB] = useState('')
  const [pendingCount, setPendingCount] = useState(0)
  const [expectedCash, setExpectedCash] = useState(0)

  useEffect(() => { fetchSession() }, [])

  async function fetchSession() {
    setLoading(true)
    const { data } = await supabase.from('day_sessions').select('*').eq('date', today).single()
    setSession(data)

    if (data) {
      // Calculate expected cash
      const opening = (data.register_a_opening ?? 0) + (data.register_b_opening ?? 0)
      const [sp, mr, ex] = await Promise.all([
        supabase.from('sales_payments').select('amount, payment_mode, sales_bills!inner(day_session_id, status)')
          .eq('sales_bills.day_session_id', data.id).neq('sales_bills.status', 'rejected'),
        supabase.from('money_receipts').select('amount, payment_mode').eq('day_session_id', data.id).neq('status', 'rejected'),
        supabase.from('expenses').select('amount, payment_type').eq('day_session_id', data.id).neq('status', 'rejected'),
      ])
      const cashIn = (sp.data ?? []).filter((p: { payment_mode: string }) => p.payment_mode === 'cash').reduce((s: number, p: { amount: number }) => s + p.amount, 0)
      const rCash = (mr.data ?? []).filter((r: { payment_mode: string }) => r.payment_mode === 'cash').reduce((s: number, r: { amount: number }) => s + r.amount, 0)
      const cashOut = (ex.data ?? []).filter((e: { payment_type: string }) => e.payment_type === 'cash').reduce((s: number, e: { amount: number }) => s + e.amount, 0)
      setExpectedCash(opening + cashIn + rCash - cashOut)

      // Check pending entries
      const [b, r, e] = await Promise.all([
        supabase.from('sales_bills').select('id', { count: 'exact' }).eq('day_session_id', data.id).eq('status', 'pending'),
        supabase.from('money_receipts').select('id', { count: 'exact' }).eq('day_session_id', data.id).eq('status', 'pending'),
        supabase.from('expenses').select('id', { count: 'exact' }).eq('day_session_id', data.id).eq('status', 'pending'),
      ])
      setPendingCount((b.count ?? 0) + (r.count ?? 0) + (e.count ?? 0))
    }
    setLoading(false)
  }

  async function handleOpenDay(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setMessage('')
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('day_sessions').insert({
      date: today,
      register_a_opening: parseFloat(openA) || 0,
      register_b_opening: parseFloat(openB) || 0,
      opened_by: user!.id,
      status: 'open',
    })
    if (error) { setMessage('Error: ' + error.message) }
    else { setMessage('Day opened successfully.') ; await fetchSession() }
    setSubmitting(false)
  }

  async function handleCloseDay(e: React.FormEvent) {
    e.preventDefault()
    if (pendingCount > 0) {
      setMessage(`Cannot close day — ${pendingCount} entries are still pending review.`)
      return
    }
    setSubmitting(true)
    setMessage('')
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('day_sessions').update({
      status: 'closed',
      register_a_closing: parseFloat(closeA) || 0,
      register_b_closing: parseFloat(closeB) || 0,
      closed_by: user!.id,
      closed_at: new Date().toISOString(),
    }).eq('id', session!.id)
    if (error) { setMessage('Error: ' + error.message) }
    else { setMessage('Day closed successfully.') ; await fetchSession() }
    setSubmitting(false)
  }

  if (loading) return <div className="text-gray-500 text-sm">Loading…</div>

  const closingTotal = (parseFloat(closeA) || 0) + (parseFloat(closeB) || 0)
  const variance = closingTotal - expectedCash

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Day Register</h1>

      {!session && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-800 mb-4">Open Day — {today}</h2>
          <form onSubmit={handleOpenDay} className="space-y-4">
            <Field label="Register A — Opening Balance (₹)" value={openA} onChange={setOpenA} />
            <Field label="Register B — Opening Balance (₹)" value={openB} onChange={setOpenB} />
            <button type="submit" disabled={submitting} className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 rounded-lg text-sm">
              {submitting ? 'Opening…' : 'Open Day'}
            </button>
          </form>
        </div>
      )}

      {session && session.status === 'open' && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
            Day opened at {formatDateTime(session.opened_at)} &nbsp;|&nbsp;
            Register A: {formatCurrency(session.register_a_opening)} &nbsp;|&nbsp;
            Register B: {formatCurrency(session.register_b_opening)}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm text-gray-500">Expected Cash In Hand</p>
            <p className="text-2xl font-bold text-amber-700">{formatCurrency(expectedCash)}</p>
          </div>

          {pendingCount > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm text-yellow-800">
              ⚠ {pendingCount} entries pending review — must approve or reject before closing day.
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-800 mb-4">Close Day</h2>
            <form onSubmit={handleCloseDay} className="space-y-4">
              <Field label="Register A — Closing Balance (₹)" value={closeA} onChange={setCloseA} />
              <Field label="Register B — Closing Balance (₹)" value={closeB} onChange={setCloseB} />
              {(closeA || closeB) && (
                <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                  <Row label="Total Closing (A+B)" value={formatCurrency(closingTotal)} />
                  <Row label="Expected Cash In Hand" value={formatCurrency(expectedCash)} />
                  <Row
                    label="Variance"
                    value={formatCurrency(variance)}
                    className={variance !== 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold'}
                  />
                </div>
              )}
              <button type="submit" disabled={submitting || pendingCount > 0} className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-semibold py-2 rounded-lg text-sm">
                {submitting ? 'Closing…' : 'Close Day'}
              </button>
            </form>
          </div>
        </div>
      )}

      {session && session.status === 'closed' && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 space-y-2 text-sm">
          <p className="font-semibold text-gray-700">Day Closed — {today}</p>
          <Row label="Closed at" value={session.closed_at ? formatDateTime(session.closed_at) : '—'} />
          <Row label="Register A Closing" value={formatCurrency(session.register_a_closing ?? 0)} />
          <Row label="Register B Closing" value={formatCurrency(session.register_b_closing ?? 0)} />
          <Row label="Expected Cash" value={formatCurrency(expectedCash)} />
          <Row
            label="Variance"
            value={formatCurrency(((session.register_a_closing ?? 0) + (session.register_b_closing ?? 0)) - expectedCash)}
            className={Math.abs(((session.register_a_closing ?? 0) + (session.register_b_closing ?? 0)) - expectedCash) > 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold'}
          />
        </div>
      )}

      {message && (
        <p className={`text-sm px-3 py-2 rounded-lg border ${message.startsWith('Error') || message.includes('Cannot') ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
          {message}
        </p>
      )}
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="number" min="0" step="0.01" value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
      />
    </div>
  )
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={className ?? 'text-gray-900 font-medium'}>{value}</span>
    </div>
  )
}
