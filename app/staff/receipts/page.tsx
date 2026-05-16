'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PAYMENT_MODE_LABELS } from '@/lib/utils'
import { Toast } from '@/components/ui/Toast'

type ReceiptType = 'advance' | 'sip' | 'customer_credit' | 'repair'
const RECEIPT_LABELS: Record<ReceiptType, string> = {
  advance: 'Advance Receipt',
  sip: 'SIP Receipt',
  customer_credit: 'Customer Credit Receipt',
  repair: 'Repairing Receipt',
}
const PAYMENT_MODES = ['cash', 'card', 'upi', 'phonepe', 'cheque', 'advance_adjustment', 'sip_adjustment']

export default function ReceiptsPage() {
  const supabase = createClient()
  const [receiptType, setReceiptType] = useState<ReceiptType>('advance')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const [sentBackEntries, setSentBackEntries] = useState<any[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)

  const [serialNumber, setSerialNumber] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [repairType, setRepairType] = useState('')
  const [repairWeight, setRepairWeight] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [oldGoldWeight, setOldGoldWeight] = useState('')
  const [oldGoldAmount, setOldGoldAmount] = useState('')
  const [oldSilverWeight, setOldSilverWeight] = useState('')
  const [oldSilverAmount, setOldSilverAmount] = useState('')
  const [paymentMode, setPaymentMode] = useState('cash')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [chequeNumber, setChequeNumber] = useState('')
  const [referenceSerial, setReferenceSerial] = useState('')
  const [notes, setNotes] = useState('')

  // Derived amounts
  const total = parseFloat(totalAmount) || 0
  const oldGoldAmt = parseFloat(oldGoldAmount) || 0
  const oldSilverAmt = parseFloat(oldSilverAmount) || 0
  const metalTotal = oldGoldAmt + oldSilverAmt
  const paymentDue = Math.max(0, total - metalTotal)
  const paidViaMode = parseFloat(paymentAmount) || 0
  const fullyByMetal = total > 0 && metalTotal >= total
  const amountMismatch = total > 0 && Math.abs(paidViaMode + metalTotal - total) > 0.01

  async function loadSession() {
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
    const { data } = await supabase.from('money_receipts')
      .select('id, receipt_type, serial_number, customer_name, repair_type, weight, amount, old_gold_weight, old_gold_amount, old_silver_weight, old_silver_amount, payment_mode, cheque_number, reference_serial, notes, send_back_reason')
      .eq('day_session_id', sid).eq('status', 'sent_back').eq('submitted_by', uid)
    setSentBackEntries(data ?? [])
  }

  function loadForEdit(entry: any) {
    setReceiptType(entry.receipt_type as ReceiptType)
    setSerialNumber(entry.serial_number ?? '')
    setCustomerName(entry.customer_name ?? '')
    setRepairType(entry.repair_type ?? '')
    setRepairWeight(entry.weight?.toString() ?? '')
    setTotalAmount(entry.amount?.toString() ?? '')
    setOldGoldWeight(entry.old_gold_weight?.toString() ?? '')
    setOldGoldAmount(entry.old_gold_amount?.toString() ?? '')
    setOldSilverWeight(entry.old_silver_weight?.toString() ?? '')
    setOldSilverAmount(entry.old_silver_amount?.toString() ?? '')
    setPaymentMode(entry.payment_mode ?? 'cash')
    const derived = Math.max(0, (entry.amount ?? 0) - (entry.old_gold_amount ?? 0) - (entry.old_silver_amount ?? 0))
    setPaymentAmount(derived > 0 ? derived.toFixed(2) : '')
    setChequeNumber(entry.cheque_number ?? '')
    setReferenceSerial(entry.reference_serial ?? '')
    setNotes(entry.notes ?? '')
    setEditingId(entry.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditingId(null)
    clearFields()
  }

  function clearFields() {
    setSerialNumber(''); setCustomerName(''); setRepairType(''); setRepairWeight('')
    setTotalAmount(''); setOldGoldWeight(''); setOldGoldAmount('')
    setOldSilverWeight(''); setOldSilverAmount('')
    setPaymentMode('cash'); setPaymentAmount(''); setChequeNumber(''); setReferenceSerial(''); setNotes('')
  }

  function resetForm() {
    clearFields()
    setTimeout(() => setSuccess(false), 3000)
  }

  useEffect(() => { loadSession() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!sessionId) { setError('No open day session. Ask admin to open the day.'); return }
    if (total <= 0) { setError('Enter a valid total amount.'); return }
    if (!fullyByMetal && amountMismatch) {
      setError('Payment amounts must exactly match the total (payment mode + old metal exchange).')
      return
    }
    if (!fullyByMetal && paidViaMode <= 0) {
      setError('Enter the amount being paid via ' + paymentMode + '.')
      return
    }

    setSubmitting(true)

    const payload: Record<string, unknown> = {
      receipt_type: receiptType,
      serial_number: (receiptType === 'advance' || receiptType === 'sip') ? serialNumber : null,
      customer_name: customerName,
      repair_type: receiptType === 'repair' ? repairType : null,
      weight: receiptType === 'repair' && repairWeight ? parseFloat(repairWeight) : null,
      amount: total,
      old_gold_weight: parseFloat(oldGoldWeight) || null,
      old_gold_amount: oldGoldAmt || null,
      old_silver_weight: parseFloat(oldSilverWeight) || null,
      old_silver_amount: oldSilverAmt || null,
      payment_mode: fullyByMetal ? null : paymentMode,
      cheque_number: paymentMode === 'cheque' && !fullyByMetal ? chequeNumber : null,
      reference_serial: (paymentMode === 'advance_adjustment' || paymentMode === 'sip_adjustment') && !fullyByMetal ? referenceSerial : null,
      notes: notes || null,
    }

    if (editingId) {
      const { error: err } = await supabase.from('money_receipts').update({
        ...payload,
        status: 'pending',
        send_back_reason: null,
        submitted_at: new Date().toISOString(),
      }).eq('id', editingId)
      if (err) { setError(err.message) } else {
        setSuccess(true)
        setEditingId(null)
        await loadSentBack(sessionId, userId!)
        resetForm()
      }
      setSubmitting(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    const { error: err } = await supabase.from('money_receipts').insert({
      ...payload,
      day_session_id: sessionId,
      submitted_by: user!.id,
    })

    if (err) { setError(err.message) }
    else { setSuccess(true); resetForm() }
    setSubmitting(false)
  }

  const hasMetalExchange = oldGoldAmt > 0 || oldSilverAmt > 0

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Money Receipt — Module B</h1>

      <Toast show={success} message={editingId ? 'Receipt resubmitted for admin review.' : 'Receipt submitted and pending admin review.'} />

      {/* Sent-back panel */}
      {sentBackEntries.length > 0 && (
        <div className="bg-orange-50 border border-orange-300 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-orange-800">↩ {sentBackEntries.length} receipt{sentBackEntries.length > 1 ? 's' : ''} sent back for correction</p>
          {sentBackEntries.map(entry => (
            <div key={entry.id} className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-orange-900">{RECEIPT_LABELS[entry.receipt_type as ReceiptType] ?? entry.receipt_type} — {entry.customer_name} — ₹{entry.amount}</p>
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
          <p className="text-sm font-semibold text-amber-800">✏️ Editing sent-back receipt — fix and resubmit</p>
          <button type="button" onClick={cancelEdit} className="text-xs text-amber-700 underline">Cancel edit</button>
        </div>
      )}

      {/* Receipt Type */}
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

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Customer Details */}
        <Section title={RECEIPT_LABELS[receiptType]}>
          {(receiptType === 'advance' || receiptType === 'sip') && (
            <Field label={`${receiptType === 'advance' ? 'Advance' : 'SIP'} Serial Number *`} value={serialNumber} onChange={setSerialNumber} required />
          )}
          <Field label="Customer Name *" value={customerName} onChange={setCustomerName} required />
          {receiptType === 'repair' && (
            <>
              <Field label="Repair Type *" value={repairType} onChange={setRepairType} required placeholder="e.g. sizing, soldering, polishing" />
              <Field label="Item Weight (g)" value={repairWeight} onChange={setRepairWeight} type="number" placeholder="Optional" />
            </>
          )}
          <Field label="Total Receipt Amount (₹) *" value={totalAmount} onChange={setTotalAmount} required type="number" />
        </Section>

        {/* Old Metal Exchange */}
        <Section title="Old Metal Exchange (Optional)">
          <p className="text-xs text-gray-500 mb-3">
            If the customer is depositing old gold/silver instead of cash, enter the details below.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wide">Old Gold</p>
              <Field label="Weight (g)" value={oldGoldWeight} onChange={setOldGoldWeight} type="number" placeholder="0.000" />
              <Field label="Amount (₹)" value={oldGoldAmount} onChange={setOldGoldAmount} type="number" placeholder="0.00" />
            </div>
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Old Silver</p>
              <Field label="Weight (g)" value={oldSilverWeight} onChange={setOldSilverWeight} type="number" placeholder="0.000" />
              <Field label="Amount (₹)" value={oldSilverAmount} onChange={setOldSilverAmount} type="number" placeholder="0.00" />
            </div>
          </div>
          {hasMetalExchange && (
            <div className="mt-3 text-sm text-gray-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Old metal value: ₹{metalTotal.toFixed(2)}
              {!fullyByMetal && <> — Remaining due via payment: <strong>₹{paymentDue.toFixed(2)}</strong></>}
            </div>
          )}
        </Section>

        {/* Payment Mode */}
        <Section title="Payment Mode">
          {fullyByMetal ? (
            <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              ✓ Fully covered by old metal exchange — no cash payment required.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Mode *</label>
                  <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} className="input">
                    {PAYMENT_MODES.map(m => (
                      <option key={m} value={m}>{PAYMENT_MODE_LABELS[m as keyof typeof PAYMENT_MODE_LABELS] ?? m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">
                    Amount (₹) *
                    {hasMetalExchange && paymentDue > 0 && (
                      <span className="text-xs font-normal text-gray-400 ml-1">expected ₹{paymentDue.toFixed(2)}</span>
                    )}
                  </label>
                  <input
                    type="number" step="0.01" min="0"
                    value={paymentAmount}
                    onChange={e => setPaymentAmount(e.target.value)}
                    className="input"
                    required={!fullyByMetal}
                    placeholder="0.00"
                  />
                </div>
              </div>
              {paymentMode === 'cheque' && (
                <Field label="Cheque Number" value={chequeNumber} onChange={setChequeNumber} placeholder="Optional" />
              )}
              {(paymentMode === 'advance_adjustment' || paymentMode === 'sip_adjustment') && (
                <Field label="Reference Serial No. *" value={referenceSerial} onChange={setReferenceSerial} placeholder="Ref. serial" required />
              )}
            </div>
          )}

          {/* Amount match indicator */}
          {total > 0 && !fullyByMetal && (
            <div className="mt-3 flex justify-between text-sm">
              <span className="text-gray-500">
                {hasMetalExchange
                  ? `₹${paidViaMode.toFixed(2)} + ₹${metalTotal.toFixed(2)} metal = ₹${(paidViaMode + metalTotal).toFixed(2)}`
                  : `Amount: ₹${paidViaMode.toFixed(2)}`}
              </span>
              {paidViaMode > 0 || hasMetalExchange ? (
                amountMismatch ? (
                  <span className="text-red-600 font-semibold">
                    ✗ Mismatch: ₹{Math.abs(paidViaMode + metalTotal - total).toFixed(2)} {paidViaMode + metalTotal > total ? 'over' : 'short'}
                  </span>
                ) : (
                  <span className="text-green-600 font-semibold">✓ Amounts match</span>
                )
              ) : null}
            </div>
          )}
        </Section>

        {/* Notes */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <label className="label">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
            placeholder="Optional notes"
          />
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">{error}</div>}

        <button
          type="submit"
          disabled={submitting || (!fullyByMetal && amountMismatch) || (!fullyByMetal && total > 0 && paidViaMode <= 0)}
          className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
        >
          {submitting ? 'Submitting…' : editingId ? 'Resubmit Receipt' : 'Submit Receipt'}
        </button>
      </form>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="font-semibold text-gray-800 mb-4 text-sm uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  )
}

function Field({ label, value, onChange, required, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean; type?: string; placeholder?: string
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)} required={required}
        placeholder={placeholder} step={type === 'number' ? '0.001' : undefined} min={type === 'number' ? '0' : undefined}
        className="input"
      />
    </div>
  )
}
