'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PAYMENT_MODE_LABELS } from '@/lib/utils'
import { Toast } from '@/components/ui/Toast'
import { useStaffSession } from '../session-context'

function billPrefix() {
  const n = new Date()
  const p = (v: number) => String(v).padStart(2, '0')
  return `${n.getFullYear()}${p(n.getMonth()+1)}${p(n.getDate())}-${p(n.getHours())}${p(n.getMinutes())}${p(n.getSeconds())}-`
}

// Purity → metal mapping (purity is selected first; metal is derived)
const PURITY_LIST = ['18K', '22K', '24K', '24kt', 'Diamond', '75', '925', 'Pure Silver', 'Other'] as const
type PurityChoice = typeof PURITY_LIST[number]
const KNOWN_PURITIES = PURITY_LIST.filter(p => p !== 'Other')

type MetalType = 'gold' | 'silver' | 'diamond' | 'other'

function metalForPurity(purity: string): MetalType {
  if (purity === '18K' || purity === '22K' || purity === '24K' || purity === '24kt') return 'gold'
  if (purity === 'Diamond') return 'diamond'
  if (purity === '75' || purity === '925' || purity === 'Pure Silver') return 'silver'
  return 'other'
}

const METAL_LABELS: Record<MetalType, string> = {
  gold: 'Gold',
  silver: 'Silver',
  diamond: 'Diamond',
  other: 'Other',
}

const METAL_COLORS: Record<MetalType, string> = {
  gold: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  silver: 'text-gray-600 bg-gray-100 border-gray-200',
  diamond: 'text-sky-700 bg-sky-50 border-sky-200',
  other: 'text-purple-700 bg-purple-50 border-purple-200',
}

interface LineItem {
  item_name: string
  weight: string
  amount: string
  metal_type: MetalType      // auto-derived from purity_choice
  purity_choice: string      // one of PURITY_LIST
  purity_custom: string      // free text when purity_choice === 'Other'
  party: string              // 'MNAP' or 'custom'
  party_custom: string
  order_in: boolean
}

interface Payment {
  payment_mode: string
  amount: string
  cheque_number: string
  reference_serial: string
}

const defaultLine = (): LineItem => ({
  item_name: '', weight: '', amount: '',
  metal_type: 'gold',
  purity_choice: '22K',
  purity_custom: '',
  party: 'MNAP', party_custom: '',
  order_in: false,
})

const defaultPayment = (): Payment => ({
  payment_mode: 'cash', amount: '', cheque_number: '', reference_serial: '',
})

export default function SalesPage() {
  const supabase = createClient()
  const { sessionId, userId } = useStaffSession()

  const [items, setItems] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  // Sent-back entries
  const [sentBackEntries, setSentBackEntries] = useState<any[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingBillNumber, setEditingBillNumber] = useState<string>('')

  const [customerName, setCustomerName] = useState('')
  const [billNumber, setBillNumber] = useState('')
  const [lineItems, setLineItems] = useState<LineItem[]>([defaultLine()])
  const [payments, setPayments] = useState<Payment[]>([defaultPayment()])
  const [oldGoldWeight, setOldGoldWeight] = useState('')
  const [oldGoldAmount, setOldGoldAmount] = useState('')
  const [oldSilverWeight, setOldSilverWeight] = useState('')
  const [oldSilverAmount, setOldSilverAmount] = useState('')

  useEffect(() => {
    supabase.from('item_master').select('name').eq('is_active', true).order('name')
      .then(({ data }) => setItems((data ?? []).map((i: { name: string }) => i.name)))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (sessionId && userId) loadSentBack(sessionId, userId)
  }, [sessionId, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadSentBack(sid: string, uid: string) {
    const { data } = await supabase.from('sales_bills')
      .select('id, bill_number, customer_name, total_amount, send_back_reason, old_gold_weight, old_gold_amount, old_silver_weight, old_silver_amount')
      .eq('day_session_id', sid).eq('status', 'sent_back').eq('submitted_by', uid)
    setSentBackEntries(data ?? [])
  }

  async function loadForEdit(bill: any) {
    const [liRes, spRes] = await Promise.all([
      supabase.from('sales_line_items').select('*').eq('bill_id', bill.id),
      supabase.from('sales_payments').select('*').eq('bill_id', bill.id),
    ])
    const li = liRes.data ?? []
    const sp = spRes.data ?? []

    setEditingId(bill.id)
    setEditingBillNumber(bill.bill_number)
    setCustomerName(bill.customer_name)
    setBillNumber(bill.bill_number.split('-').slice(2).join('-') || bill.bill_number)
    setOldGoldWeight(bill.old_gold_weight ? String(bill.old_gold_weight) : '')
    setOldGoldAmount(bill.old_gold_amount ? String(bill.old_gold_amount) : '')
    setOldSilverWeight(bill.old_silver_weight ? String(bill.old_silver_weight) : '')
    setOldSilverAmount(bill.old_silver_amount ? String(bill.old_silver_amount) : '')
    setLineItems(li.map((l: any) => {
      const pc = KNOWN_PURITIES.includes(l.purity) ? l.purity : 'Other'
      return {
        item_name: l.item_name,
        weight: l.weight ? String(l.weight) : '',
        amount: String(l.amount),
        metal_type: metalForPurity(pc === 'Other' ? 'other' : pc),
        purity_choice: pc,
        purity_custom: pc === 'Other' ? (l.purity ?? '') : '',
        party: l.party === 'MNAP' ? 'MNAP' : 'custom',
        party_custom: l.party !== 'MNAP' ? l.party : '',
        order_in: !!l.order_in,
      }
    }))
    setPayments(sp.map((p: any) => ({
      payment_mode: p.payment_mode,
      amount: String(p.amount),
      cheque_number: p.cheque_number ?? '',
      reference_serial: p.reference_serial ?? '',
    })))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditingId(null); setEditingBillNumber('')
    setCustomerName(''); setBillNumber('')
    setLineItems([defaultLine()]); setPayments([defaultPayment()])
    setOldGoldWeight(''); setOldGoldAmount(''); setOldSilverWeight(''); setOldSilverAmount('')
    setError('')
  }

  const totalBillAmount = lineItems.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
  const totalPayments = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
  const oldGoldAmt = parseFloat(oldGoldAmount) || 0
  const oldSilverAmt = parseFloat(oldSilverAmount) || 0
  const amountDueFromPayments = totalBillAmount - oldGoldAmt - oldSilverAmt
  const paymentMismatch = Math.abs(amountDueFromPayments - totalPayments) > 0.01

  function updateLine(i: number, field: keyof LineItem, val: string | boolean) {
    setLineItems(prev => prev.map((l, idx) => {
      if (idx !== i) return l
      const updated = { ...l, [field]: val }
      if (field === 'purity_choice') {
        updated.metal_type = metalForPurity(val === 'Other' ? 'other' : val as string)
        if (val !== 'Other') updated.purity_custom = ''
      }
      return updated
    }))
  }

  function removeLine(i: number) {
    setLineItems(prev => prev.filter((_, idx) => idx !== i))
  }

  function updatePayment(i: number, field: keyof Payment, val: string) {
    setPayments(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: val } : p))
  }

  function removePayment(i: number) {
    setPayments(prev => prev.filter((_, idx) => idx !== i))
  }

  // Resolve final purity string to store in DB
  function resolvedPurity(l: LineItem): string | null {
    if (l.purity_choice === 'Other') return l.purity_custom.trim() || null
    return l.purity_choice
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!sessionId) { setError('No open day session. Ask admin to open the day first.'); return }
    if (paymentMismatch) { setError('Payment amounts must equal the total bill amount (after old metal exchange).'); return }
    if (lineItems.some(l => !l.item_name || !l.amount)) { setError('All line items need an item name and amount.'); return }
    if (lineItems.some(l => (l.metal_type === 'gold' || l.metal_type === 'silver') && !l.weight)) {
      setError('Weight is required for Gold/Silver items.'); return
    }
    if (lineItems.some(l => l.party === 'custom' && !l.party_custom.trim())) { setError('Enter party name for outside party items.'); return }

    setSubmitting(true)

    const firstItem = lineItems[0]
    const billParty = firstItem.party === 'MNAP' ? 'MNAP' : firstItem.party_custom

    const lineItemsPayload = lineItems.map(l => ({
      item_name: l.item_name,
      weight: parseFloat(l.weight) || null,
      amount: parseFloat(l.amount),
      metal_type: l.metal_type,
      purity: resolvedPurity(l),
      party: l.party === 'MNAP' ? 'MNAP' : l.party_custom,
      order_in: l.order_in,
    }))

    const paymentsPayload = payments.map(p => ({
      payment_mode: p.payment_mode,
      amount: parseFloat(p.amount),
      cheque_number: p.cheque_number || null,
      reference_serial: p.reference_serial || null,
    }))

    const billFields = {
      customer_name: customerName,
      metal_type: firstItem.metal_type,
      purity: resolvedPurity(firstItem),
      party: billParty,
      total_amount: totalBillAmount,
      old_gold_weight: parseFloat(oldGoldWeight) || null,
      old_gold_amount: parseFloat(oldGoldAmount) || null,
      old_silver_weight: parseFloat(oldSilverWeight) || null,
      old_silver_amount: parseFloat(oldSilverAmount) || null,
    }

    if (editingId) {
      // Resubmit sent-back entry — update + replace children
      const { error: billErr } = await supabase.from('sales_bills').update({
        ...billFields,
        bill_number: editingBillNumber,
        status: 'pending',
        send_back_reason: null,
        submitted_at: new Date().toISOString(),
      }).eq('id', editingId)

      if (billErr) { setError(billErr.message); setSubmitting(false); return }

      await Promise.all([
        supabase.from('sales_line_items').delete().eq('bill_id', editingId),
        supabase.from('sales_payments').delete().eq('bill_id', editingId),
      ])
      await Promise.all([
        supabase.from('sales_line_items').insert(lineItemsPayload.map(l => ({ ...l, bill_id: editingId }))),
        supabase.from('sales_payments').insert(paymentsPayload.map(p => ({ ...p, bill_id: editingId }))),
      ])
      setSuccess(true)
      setSubmitting(false)
      cancelEdit()
      await loadSentBack(sessionId!, userId!)
      return
    }

    // New submission
    const { data: bill, error: billErr } = await supabase.from('sales_bills').insert({
      ...billFields,
      day_session_id: sessionId,
      bill_number: billPrefix() + billNumber,
      customer_phone: null,
      submitted_by: userId!,
    }).select('id').single()

    if (billErr || !bill) { setError(billErr?.message ?? 'Failed to save bill.'); setSubmitting(false); return }

    const [itemsRes, paymentsRes] = await Promise.all([
      supabase.from('sales_line_items').insert(lineItemsPayload.map(l => ({ ...l, bill_id: bill.id }))),
      supabase.from('sales_payments').insert(paymentsPayload.map(p => ({ ...p, bill_id: bill.id }))),
    ])

    if (itemsRes.error) { setError('Bill saved but line items failed: ' + itemsRes.error.message); setSubmitting(false); return }
    if (paymentsRes.error) { setError('Bill saved but payments failed: ' + paymentsRes.error.message); setSubmitting(false); return }

    setSuccess(true)
    setSubmitting(false)
    resetForm()
  }

  function resetForm() {
    setCustomerName(''); setBillNumber('')
    setLineItems([defaultLine()]); setPayments([defaultPayment()])
    setOldGoldWeight(''); setOldGoldAmount(''); setOldSilverWeight(''); setOldSilverAmount('')
    setTimeout(() => setSuccess(false), 3000)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">New Sale — Module A</h1>

      <Toast show={success} message={editingId ? 'Bill resubmitted successfully and is pending admin review.' : 'Bill submitted successfully and is pending admin review.'} />

      {/* Sent-back panel */}
      {sentBackEntries.length > 0 && !editingId && (
        <div className="bg-orange-50 border border-orange-300 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-orange-800">↩ {sentBackEntries.length} bill{sentBackEntries.length > 1 ? 's' : ''} sent back for correction</p>
          {sentBackEntries.map(bill => (
            <div key={bill.id} className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-orange-900">Bill #{bill.bill_number} — {bill.customer_name} — ₹{bill.total_amount}</p>
                {bill.send_back_reason && <p className="text-xs text-orange-700 mt-0.5">Admin note: {bill.send_back_reason}</p>}
              </div>
              <button onClick={() => loadForEdit(bill)}
                className="flex-shrink-0 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                Load &amp; Fix
              </button>
            </div>
          ))}
        </div>
      )}

      {editingId && (
        <div className="bg-orange-50 border border-orange-300 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-orange-800">✎ Editing Bill #{editingBillNumber} — bill number will be preserved</p>
          <button onClick={cancelEdit} className="text-xs text-orange-600 hover:text-orange-800 font-medium">Cancel edit</button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Bill Header */}
        <Section title="Bill Details">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Customer Name *" value={customerName} onChange={setCustomerName} required />
            {!editingId
              ? <Input label="Bill Number *" value={billNumber} onChange={setBillNumber} required />
              : <div><label className="label">Bill Number</label><p className="input bg-gray-50 text-gray-500 flex items-center">{editingBillNumber}</p></div>
            }
          </div>
        </Section>

        {/* Line Items */}
        <Section title="Line Items">
          <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
            <span className="inline-block w-3 h-3 rounded-sm bg-sky-200 border border-sky-300 flex-shrink-0" />
            <span>Items marked <strong>Order In</strong> must be updated in Order Stock</span>
          </div>
          <div className="space-y-4">
            {lineItems.map((l, i) => (
              <div key={i} className={`border rounded-lg p-3 space-y-2 transition-colors ${l.order_in ? 'bg-sky-50 border-sky-300' : 'bg-gray-50 border-gray-100'}`}>
                {/* Order In toggle */}
                <div className="flex justify-end">
                  <button type="button"
                    onClick={() => updateLine(i, 'order_in', !l.order_in)}
                    className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border transition-colors ${l.order_in ? 'bg-sky-500 border-sky-500 text-white' : 'bg-white border-gray-300 text-gray-500 hover:border-sky-400 hover:text-sky-600'}`}>
                    Order In
                  </button>
                </div>

                {/* Row 1: Purity | Custom purity | Party | Party name */}
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-3">
                    <label className="label flex items-center gap-1.5">
                      Purity *
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full border ${METAL_COLORS[l.metal_type]}`}>
                        {METAL_LABELS[l.metal_type]}
                      </span>
                    </label>
                    <select value={l.purity_choice}
                      onChange={e => updateLine(i, 'purity_choice', e.target.value)}
                      className="input">
                      {PURITY_LIST.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>

                  {l.purity_choice === 'Other' && (
                    <div className="col-span-3">
                      <label className="label">Custom Purity</label>
                      <input value={l.purity_custom}
                        onChange={e => updateLine(i, 'purity_custom', e.target.value)}
                        placeholder="e.g. 916, Platinum…"
                        className="input" />
                    </div>
                  )}

                  <div className={l.purity_choice === 'Other' ? 'col-span-3' : 'col-span-6'}>
                    <label className="label">Party</label>
                    <select value={l.party} onChange={e => updateLine(i, 'party', e.target.value)} className="input">
                      <option value="MNAP">MNAP (Own Stock)</option>
                      <option value="custom">Outside Party</option>
                    </select>
                  </div>

                  {l.party === 'custom' && (
                    <div className="col-span-3">
                      <label className="label">Party Name *</label>
                      <input value={l.party_custom}
                        onChange={e => updateLine(i, 'party_custom', e.target.value)}
                        placeholder="Party name" className="input" required />
                    </div>
                  )}
                </div>

                {/* Row 2: Item name | Weight | Amount | Remove
                    Mobile:  item name full width (row 1), then weight + amount + × (row 2)
                    Desktop: all in one row */}
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-12 sm:col-span-5">
                    <label className="label">Item Name *</label>
                    <input list={`item-list-${i}`} value={l.item_name}
                      onChange={e => updateLine(i, 'item_name', e.target.value)}
                      placeholder="Select or type item" className="input" required />
                    <datalist id={`item-list-${i}`}>
                      {items.map(it => <option key={it} value={it} />)}
                    </datalist>
                  </div>

                  {(l.metal_type === 'gold' || l.metal_type === 'silver') ? (
                    <div className="col-span-5 sm:col-span-3">
                      <label className="label">Weight (g) *</label>
                      <input type="number" step="0.001" min="0" value={l.weight}
                        onChange={e => updateLine(i, 'weight', e.target.value)}
                        placeholder="0.000" className="input" required />
                    </div>
                  ) : l.metal_type === 'diamond' ? (
                    <div className="col-span-5 sm:col-span-3">
                      <label className="label">Weight (ct)</label>
                      <input type="number" step="0.001" min="0" value={l.weight}
                        onChange={e => updateLine(i, 'weight', e.target.value)}
                        placeholder="0.000" className="input" />
                    </div>
                  ) : (
                    <div className="col-span-5 sm:col-span-3" />
                  )}

                  <div className="col-span-6 sm:col-span-3">
                    <label className="label">Amount (₹) *</label>
                    <input type="number" step="0.01" min="0" value={l.amount}
                      onChange={e => updateLine(i, 'amount', e.target.value)}
                      placeholder="0.00" className="input" required />
                  </div>

                  <div className="col-span-1 pb-1">
                    {lineItems.length > 1 && (
                      <button type="button" onClick={() => removeLine(i)}
                        className="text-red-500 hover:text-red-700 text-lg font-bold w-full text-center">×</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setLineItems(p => [...p, defaultLine()])}
            className="mt-3 text-sm text-amber-600 hover:text-amber-800 font-medium">
            + Add Line Item
          </button>
          <div className="mt-3 text-right text-sm font-semibold text-gray-700">
            Total Bill Amount: ₹{totalBillAmount.toFixed(2)}
          </div>
        </Section>

        {/* Payment Modes */}
        <Section title="Payment Modes">
          <div className="space-y-3">
            {payments.map((p, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                {/* Mode: full row on mobile, col-4 on desktop */}
                <div className="col-span-12 sm:col-span-4">
                  {i === 0 && <label className="label">Mode *</label>}
                  <select value={p.payment_mode} onChange={e => updatePayment(i, 'payment_mode', e.target.value)} className="input">
                    {Object.entries(PAYMENT_MODE_LABELS).filter(([k]) => k !== 'bank_transfer').map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                {/* Amount: wide on mobile (11/12), narrower on desktop */}
                <div className="col-span-11 sm:col-span-3">
                  {i === 0 && <label className="label">Amount (₹) *</label>}
                  <input type="number" step="0.01" min="0" value={p.amount}
                    onChange={e => updatePayment(i, 'amount', e.target.value)}
                    placeholder="0.00" className="input" required />
                </div>
                {/* Remove: always col-1 */}
                <div className="col-span-1 pb-1">
                  {payments.length > 1 && (
                    <button type="button" onClick={() => removePayment(i)}
                      className="text-red-500 hover:text-red-700 text-lg font-bold w-full text-center">×</button>
                  )}
                </div>
                {/* Cheque/Serial: full row on mobile, col-3 on desktop */}
                {p.payment_mode === 'cheque' && (
                  <div className="col-span-12 sm:col-span-3">
                    {i === 0 && <label className="label">Cheque No.</label>}
                    <input value={p.cheque_number} onChange={e => updatePayment(i, 'cheque_number', e.target.value)}
                      placeholder="Optional" className="input" />
                  </div>
                )}
                {(p.payment_mode === 'advance_adjustment' || p.payment_mode === 'sip_adjustment') && (
                  <div className="col-span-12 sm:col-span-3">
                    {i === 0 && <label className="label">Serial No. *</label>}
                    <input value={p.reference_serial} onChange={e => updatePayment(i, 'reference_serial', e.target.value)}
                      placeholder="Ref. serial" className="input" required />
                  </div>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setPayments(p => [...p, defaultPayment()])}
            className="mt-3 text-sm text-amber-600 hover:text-amber-800 font-medium">
            + Add Payment Mode
          </button>
          <div className="mt-3 space-y-1">
            {(oldGoldAmt > 0 || oldSilverAmt > 0) && (
              <p className="text-xs text-gray-400">
                Bill ₹{totalBillAmount.toFixed(2)} − Old Metal ₹{(oldGoldAmt + oldSilverAmt).toFixed(2)} = Due: ₹{amountDueFromPayments.toFixed(2)}
              </p>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Payment Total: ₹{totalPayments.toFixed(2)}</span>
              {paymentMismatch && (
                <span className="text-red-600 font-semibold">
                  ✗ Mismatch: ₹{Math.abs(amountDueFromPayments - totalPayments).toFixed(2)} {totalPayments > amountDueFromPayments ? 'over' : 'short'}
                </span>
              )}
              {!paymentMismatch && totalBillAmount > 0 && (
                <span className="text-green-600 font-semibold">✓ Amounts match</span>
              )}
            </div>
          </div>
        </Section>

        {/* Old Metal Exchange */}
        <Section title="Old Metal Exchange (Optional)">
          <div className="space-y-3">
            {/* Gold row */}
            <div className="rounded-xl bg-yellow-50 border border-yellow-200 px-4 py-3">
              <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wide mb-2.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-400 mr-1.5 align-middle" />
                Old Gold
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Weight (g)" value={oldGoldWeight} onChange={setOldGoldWeight} type="number" />
                <Input label="Amount (₹)" value={oldGoldAmount} onChange={setOldGoldAmount} type="number" />
              </div>
            </div>
            {/* Silver row */}
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-400 mr-1.5 align-middle" />
                Old Silver
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Weight (g)" value={oldSilverWeight} onChange={setOldSilverWeight} type="number" />
                <Input label="Amount (₹)" value={oldSilverAmount} onChange={setOldSilverAmount} type="number" />
              </div>
            </div>
          </div>
        </Section>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">{error}</div>
        )}

        <button type="submit" disabled={submitting || paymentMismatch}
          className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white font-semibold py-3 rounded-xl text-sm transition-colors">
          {submitting ? 'Submitting…' : editingId ? 'Resubmit Bill' : 'Submit Bill'}
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

function Input({ label, value, onChange, required, type = 'text' }: {
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
