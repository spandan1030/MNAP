'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PURITY_OPTIONS, PAYMENT_MODE_LABELS } from '@/lib/utils'

interface LineItem {
  item_name: string
  weight: string
  amount: string
  metal_type: 'gold' | 'silver' | 'other'
  purity: string
  party: string        // 'MNAP' or 'custom'
  party_custom: string
}

interface Payment {
  payment_mode: string
  amount: string
  cheque_number: string
  reference_serial: string
}

const defaultLine = (): LineItem => ({
  item_name: '', weight: '', amount: '',
  metal_type: 'gold', purity: '22K',
  party: 'MNAP', party_custom: '',
})

const defaultPayment = (): Payment => ({
  payment_mode: 'cash', amount: '', cheque_number: '', reference_serial: '',
})

export default function SalesPage() {
  const supabase = createClient()

  const [items, setItems] = useState<string[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const [customerName, setCustomerName] = useState('')
  const [billNumber, setBillNumber] = useState('')
  const [lineItems, setLineItems] = useState<LineItem[]>([defaultLine()])
  const [payments, setPayments] = useState<Payment[]>([defaultPayment()])
  const [oldGoldWeight, setOldGoldWeight] = useState('')
  const [oldGoldAmount, setOldGoldAmount] = useState('')
  const [oldSilverWeight, setOldSilverWeight] = useState('')
  const [oldSilverAmount, setOldSilverAmount] = useState('')

  useEffect(() => { loadItemsAndSession() }, [])

  async function loadItemsAndSession() {
    const today = new Date().toISOString().split('T')[0]
    const [itemsRes, sessionRes] = await Promise.all([
      supabase.from('item_master').select('name').eq('is_active', true).order('name'),
      supabase.from('day_sessions').select('id, status').eq('date', today).eq('status', 'open').single(),
    ])
    setItems((itemsRes.data ?? []).map((i: { name: string }) => i.name))
    setSessionId(sessionRes.data?.id ?? null)
  }

  const totalBillAmount = lineItems.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
  const totalPayments = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
  const oldGoldAmt = parseFloat(oldGoldAmount) || 0
  const oldSilverAmt = parseFloat(oldSilverAmount) || 0
  const amountDueFromPayments = totalBillAmount - oldGoldAmt - oldSilverAmt
  const paymentMismatch = Math.abs(amountDueFromPayments - totalPayments) > 0.01

  function updateLine(i: number, field: keyof LineItem, val: string) {
    setLineItems(prev => prev.map((l, idx) => {
      if (idx !== i) return l
      const updated = { ...l, [field]: val }
      if (field === 'metal_type') {
        const purities = PURITY_OPTIONS[val] ?? []
        updated.purity = purities.length > 0 ? purities[0] : ''
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!sessionId) { setError('No open day session. Ask admin to open the day first.'); return }
    if (paymentMismatch) { setError('Payment amounts must equal the total bill amount (after old metal exchange).'); return }
    if (lineItems.some(l => !l.item_name || !l.amount)) { setError('All line items need an item name and amount.'); return }
    if (lineItems.some(l => l.metal_type !== 'other' && !l.weight)) { setError('Weight is required for Gold/Silver items.'); return }
    if (lineItems.some(l => l.party === 'custom' && !l.party_custom.trim())) { setError('Enter party name for outside party items.'); return }

    setSubmitting(true)
    const { data: { user } } = await supabase.auth.getUser()

    const firstItem = lineItems[0]
    const billParty = firstItem.party === 'MNAP' ? 'MNAP' : firstItem.party_custom

    const { data: bill, error: billErr } = await supabase.from('sales_bills').insert({
      day_session_id: sessionId,
      bill_number: billNumber,
      customer_name: customerName,
      customer_phone: null,
      metal_type: firstItem.metal_type,
      purity: firstItem.purity || null,
      party: billParty,
      total_amount: totalBillAmount,
      old_gold_weight: parseFloat(oldGoldWeight) || null,
      old_gold_amount: parseFloat(oldGoldAmount) || null,
      old_silver_weight: parseFloat(oldSilverWeight) || null,
      old_silver_amount: parseFloat(oldSilverAmount) || null,
      submitted_by: user!.id,
    }).select('id').single()

    if (billErr || !bill) { setError(billErr?.message ?? 'Failed to save bill.'); setSubmitting(false); return }

    const [itemsRes, paymentsRes] = await Promise.all([
      supabase.from('sales_line_items').insert(
        lineItems.map(l => ({
          bill_id: bill.id,
          item_name: l.item_name,
          weight: parseFloat(l.weight) || null,
          amount: parseFloat(l.amount),
          metal_type: l.metal_type,
          purity: l.purity || null,
          party: l.party === 'MNAP' ? 'MNAP' : l.party_custom,
        }))
      ),
      supabase.from('sales_payments').insert(
        payments.map(p => ({
          bill_id: bill.id,
          payment_mode: p.payment_mode,
          amount: parseFloat(p.amount),
          cheque_number: p.cheque_number || null,
          reference_serial: p.reference_serial || null,
        }))
      ),
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
    setTimeout(() => setSuccess(false), 4000)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">New Sale — Module A</h1>

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-green-700 text-sm font-medium">
          ✓ Bill submitted successfully and is pending admin review.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Bill Header */}
        <Section title="Bill Details">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Customer Name *" value={customerName} onChange={setCustomerName} required />
            <Input label="Bill Number *" value={billNumber} onChange={setBillNumber} required />
          </div>
        </Section>

        {/* Line Items */}
        <Section title="Line Items">
          <div className="space-y-4">
            {lineItems.map((l, i) => (
              <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-2 bg-gray-50">
                {/* Row 1: metal, purity, party */}
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-3">
                    <label className="label">Metal</label>
                    <select value={l.metal_type} onChange={e => updateLine(i, 'metal_type', e.target.value)} className="input">
                      <option value="gold">Gold</option>
                      <option value="silver">Silver</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  {l.metal_type !== 'other' && (
                    <div className="col-span-3">
                      <label className="label">Purity</label>
                      <select value={l.purity} onChange={e => updateLine(i, 'purity', e.target.value)} className="input">
                        {(PURITY_OPTIONS[l.metal_type] ?? []).map(p => <option key={p}>{p}</option>)}
                      </select>
                    </div>
                  )}
                  <div className={l.metal_type !== 'other' ? 'col-span-3' : 'col-span-6'}>
                    <label className="label">Party</label>
                    <select value={l.party} onChange={e => updateLine(i, 'party', e.target.value)} className="input">
                      <option value="MNAP">MNAP (Own Stock)</option>
                      <option value="custom">Outside Party</option>
                    </select>
                  </div>
                  {l.party === 'custom' && (
                    <div className="col-span-3">
                      <label className="label">Party Name *</label>
                      <input value={l.party_custom} onChange={e => updateLine(i, 'party_custom', e.target.value)}
                        placeholder="Party name" className="input" required />
                    </div>
                  )}
                </div>

                {/* Row 2: item name, weight, amount */}
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">
                    <label className="label">Item Name *</label>
                    <input list={`item-list-${i}`} value={l.item_name}
                      onChange={e => updateLine(i, 'item_name', e.target.value)}
                      placeholder="Select or type item" className="input" required />
                    <datalist id={`item-list-${i}`}>
                      {items.map(it => <option key={it} value={it} />)}
                    </datalist>
                  </div>
                  {l.metal_type !== 'other' ? (
                    <div className="col-span-3">
                      <label className="label">Weight (g) *</label>
                      <input type="number" step="0.001" min="0" value={l.weight}
                        onChange={e => updateLine(i, 'weight', e.target.value)}
                        placeholder="0.000" className="input" required />
                    </div>
                  ) : <div className="col-span-3" />}
                  <div className="col-span-3">
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
                <div className="col-span-4">
                  {i === 0 && <label className="label">Mode *</label>}
                  <select value={p.payment_mode} onChange={e => updatePayment(i, 'payment_mode', e.target.value)} className="input">
                    {Object.entries(PAYMENT_MODE_LABELS).filter(([k]) => !['bank_transfer'].includes(k)).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-3">
                  {i === 0 && <label className="label">Amount (₹) *</label>}
                  <input type="number" step="0.01" min="0" value={p.amount}
                    onChange={e => updatePayment(i, 'amount', e.target.value)}
                    placeholder="0.00" className="input" required />
                </div>
                {p.payment_mode === 'cheque' && (
                  <div className="col-span-3">
                    {i === 0 && <label className="label">Cheque No.</label>}
                    <input value={p.cheque_number} onChange={e => updatePayment(i, 'cheque_number', e.target.value)}
                      placeholder="Optional" className="input" />
                  </div>
                )}
                {(p.payment_mode === 'advance_adjustment' || p.payment_mode === 'sip_adjustment') && (
                  <div className="col-span-3">
                    {i === 0 && <label className="label">Serial No. *</label>}
                    <input value={p.reference_serial} onChange={e => updatePayment(i, 'reference_serial', e.target.value)}
                      placeholder="Ref. serial" className="input" required />
                  </div>
                )}
                <div className="col-span-1 pb-1">
                  {payments.length > 1 && (
                    <button type="button" onClick={() => removePayment(i)}
                      className="text-red-500 hover:text-red-700 text-lg font-bold w-full text-center">×</button>
                  )}
                </div>
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Input label="Old Gold Weight (g)" value={oldGoldWeight} onChange={setOldGoldWeight} type="number" />
            <Input label="Old Gold Amount (₹)" value={oldGoldAmount} onChange={setOldGoldAmount} type="number" />
            <Input label="Old Silver Weight (g)" value={oldSilverWeight} onChange={setOldSilverWeight} type="number" />
            <Input label="Old Silver Amount (₹)" value={oldSilverAmount} onChange={setOldSilverAmount} type="number" />
          </div>
        </Section>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">{error}</div>
        )}

        <button type="submit" disabled={submitting || paymentMismatch}
          className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white font-semibold py-3 rounded-xl text-sm transition-colors">
          {submitting ? 'Submitting…' : 'Submit Bill'}
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
