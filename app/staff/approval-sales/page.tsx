'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PURITY_OPTIONS } from '@/lib/utils'

interface LineItem {
  item_name: string
  metal_type: 'gold' | 'silver' | 'other'
  purity: string
  party: string
  party_custom: string
  weight: string
  notes: string
}

const defaultLine = (): LineItem => ({
  item_name: '', metal_type: 'gold', purity: '22K',
  party: 'MNAP', party_custom: '', weight: '', notes: '',
})

export default function ApprovalSalesPage() {
  const supabase = createClient()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [items, setItems] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const [partyName, setPartyName] = useState('')
  const [transactionType, setTransactionType] = useState<'sale' | 'approval'>('approval')
  const [lineItems, setLineItems] = useState<LineItem[]>([defaultLine()])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const today = new Date().toISOString().split('T')[0]
    const [sessionRes, itemsRes] = await Promise.all([
      supabase.from('day_sessions').select('id').eq('date', today).eq('status', 'open').single(),
      supabase.from('item_master').select('name').eq('is_active', true).order('name'),
    ])
    setSessionId(sessionRes.data?.id ?? null)
    setItems((itemsRes.data ?? []).map((i: { name: string }) => i.name))
  }

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!sessionId) { setError('No open day session. Ask admin to open the day first.'); return }
    if (lineItems.some(l => !l.item_name)) { setError('All line items need an item name.'); return }
    if (lineItems.some(l => l.party === 'custom' && !l.party_custom.trim())) { setError('Enter party name for outside party items.'); return }

    setSubmitting(true)
    const { data: { user } } = await supabase.auth.getUser()

    const { data: sale, error: saleErr } = await supabase.from('approval_sales').insert({
      day_session_id: sessionId,
      party_name: partyName,
      transaction_type: transactionType,
      submitted_by: user!.id,
    }).select('id').single()

    if (saleErr || !sale) { setError(saleErr?.message ?? 'Failed to save entry.'); setSubmitting(false); return }

    const { error: itemsErr } = await supabase.from('approval_sale_items').insert(
      lineItems.map(l => ({
        sale_id: sale.id,
        item_name: l.item_name,
        metal_type: l.metal_type,
        purity: l.purity || null,
        party: l.party === 'MNAP' ? 'MNAP' : l.party_custom,
        weight: parseFloat(l.weight) || null,
        notes: l.notes || null,
      }))
    )

    if (itemsErr) { setError('Entry saved but items failed: ' + itemsErr.message); setSubmitting(false); return }

    setSuccess(true)
    setSubmitting(false)
    resetForm()
  }

  function resetForm() {
    setPartyName(''); setTransactionType('approval'); setLineItems([defaultLine()])
    setTimeout(() => setSuccess(false), 4000)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Approval / Other Party Sale — Module H</h1>
        <p className="text-sm text-gray-500 mt-1">Record items given on approval or sold to a party with no cash exchange.</p>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-green-700 text-sm font-medium">
          ✓ Entry submitted successfully and is pending admin review.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Header */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 mb-4 text-sm uppercase tracking-wide">Entry Details</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 md:col-span-1">
              <label className="label">Party Name *</label>
              <input value={partyName} onChange={e => setPartyName(e.target.value)}
                className="input" required placeholder="Name of the party" />
            </div>
            <div>
              <label className="label">Transaction Type *</label>
              <select value={transactionType} onChange={e => setTransactionType(e.target.value as 'sale' | 'approval')} className="input">
                <option value="approval">Approval</option>
                <option value="sale">Sale</option>
              </select>
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 mb-4 text-sm uppercase tracking-wide">Items</h3>
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

                {/* Row 2: item name, weight, remove */}
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
                  <div className="col-span-3">
                    <label className="label">Weight (g)</label>
                    <input type="number" step="0.001" min="0" value={l.weight}
                      onChange={e => updateLine(i, 'weight', e.target.value)}
                      placeholder="0.000" className="input" />
                  </div>
                  <div className="col-span-3">
                    <label className="label">Notes</label>
                    <input value={l.notes} onChange={e => updateLine(i, 'notes', e.target.value)}
                      placeholder="Optional" className="input" />
                  </div>
                  <div className="col-span-1 pb-1">
                    {lineItems.length > 1 && (
                      <button type="button" onClick={() => setLineItems(p => p.filter((_, idx) => idx !== i))}
                        className="text-red-500 hover:text-red-700 text-lg font-bold w-full text-center">×</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setLineItems(p => [...p, defaultLine()])}
            className="mt-3 text-sm text-amber-600 hover:text-amber-800 font-medium">
            + Add Item
          </button>
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">{error}</div>}

        <button type="submit" disabled={submitting}
          className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white font-semibold py-3 rounded-xl text-sm transition-colors">
          {submitting ? 'Submitting…' : 'Submit Entry'}
        </button>
      </form>
    </div>
  )
}
