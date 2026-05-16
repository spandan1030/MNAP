'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Toast } from '@/components/ui/Toast'

// ── Purity → metal mapping (same as Module A / New Sale) ──────────────────
const PURITY_LIST = ['18K', '22K', '24K', 'Diamond', '75', '925', 'Other'] as const
type PurityChoice = typeof PURITY_LIST[number]
const KNOWN_PURITIES = PURITY_LIST.filter(p => p !== 'Other')

type MetalType = 'gold' | 'silver' | 'diamond' | 'other'

function metalForPurity(purity: string): MetalType {
  if (purity === '18K' || purity === '22K' || purity === '24K') return 'gold'
  if (purity === 'Diamond') return 'diamond'
  if (purity === '75' || purity === '925') return 'silver'
  return 'other'
}

const METAL_LABELS: Record<MetalType, string> = {
  gold: 'Gold', silver: 'Silver', diamond: 'Diamond', other: 'Other',
}

const METAL_COLORS: Record<MetalType, string> = {
  gold: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  silver: 'text-gray-600 bg-gray-100 border-gray-200',
  diamond: 'text-sky-700 bg-sky-50 border-sky-200',
  other: 'text-purple-700 bg-purple-50 border-purple-200',
}
// ─────────────────────────────────────────────────────────────────────────────

interface LineItem {
  item_name: string
  metal_type: MetalType      // auto-derived from purity_choice
  purity_choice: string      // one of PURITY_LIST
  purity_custom: string      // free text when purity_choice === 'Other'
  party: string
  party_custom: string
  weight: string
  notes: string
}

const defaultLine = (): LineItem => ({
  item_name: '',
  metal_type: 'gold',
  purity_choice: '22K',
  purity_custom: '',
  party: 'MNAP', party_custom: '',
  weight: '', notes: '',
})

const TX_LABELS: Record<string, string> = {
  approval: 'Approval',
  sale: 'Sale',
  approval_return: 'Approval Return',
  stock_in: 'Stock In',
}

export default function ApprovalSalesPage() {
  const supabase = createClient()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [items, setItems] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const [sentBackEntries, setSentBackEntries] = useState<any[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)

  const [partyName, setPartyName] = useState('')
  const [transactionType, setTransactionType] = useState<'sale' | 'approval' | 'approval_return' | 'stock_in'>('approval')
  const [lineItems, setLineItems] = useState<LineItem[]>([defaultLine()])

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    const today = new Date().toISOString().split('T')[0]
    const [sessionRes, itemsRes, { data: { user } }] = await Promise.all([
      supabase.from('day_sessions').select('id').eq('date', today).eq('status', 'open').single(),
      supabase.from('item_master').select('name').eq('is_active', true).order('name'),
      supabase.auth.getUser(),
    ])
    const sid = sessionRes.data?.id ?? null
    setSessionId(sid)
    setUserId(user?.id ?? null)
    setItems((itemsRes.data ?? []).map((i: { name: string }) => i.name))
    if (sid && user) await loadSentBack(sid, user.id)
  }

  async function loadSentBack(sid: string, uid: string) {
    const { data } = await supabase.from('approval_sales')
      .select('id, party_name, transaction_type, send_back_reason')
      .eq('day_session_id', sid).eq('status', 'sent_back').eq('submitted_by', uid)
    setSentBackEntries(data ?? [])
  }

  async function loadForEdit(entry: any) {
    const { data: saleItems } = await supabase.from('approval_sale_items')
      .select('item_name, metal_type, purity, party, weight, notes')
      .eq('sale_id', entry.id)

    setPartyName(entry.party_name ?? '')
    setTransactionType(entry.transaction_type ?? 'approval')
    setLineItems((saleItems ?? []).map((item: any) => {
      const pc = KNOWN_PURITIES.includes(item.purity) ? item.purity : 'Other'
      return {
        item_name: item.item_name ?? '',
        metal_type: metalForPurity(pc === 'Other' ? 'other' : pc),
        purity_choice: pc,
        purity_custom: pc === 'Other' ? (item.purity ?? '') : '',
        party: item.party === 'MNAP' ? 'MNAP' : 'custom',
        party_custom: item.party === 'MNAP' ? '' : (item.party ?? ''),
        weight: item.weight?.toString() ?? '',
        notes: item.notes ?? '',
      }
    }))
    setEditingId(entry.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditingId(null)
    setPartyName(''); setTransactionType('approval'); setLineItems([defaultLine()])
  }

  function updateLine(i: number, field: keyof LineItem, val: string) {
    setLineItems(prev => prev.map((l, idx) => {
      if (idx !== i) return l
      const updated = { ...l, [field]: val }
      if (field === 'purity_choice') {
        updated.metal_type = metalForPurity(val === 'Other' ? 'other' : val)
        if (val !== 'Other') updated.purity_custom = ''
      }
      return updated
    }))
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
    if (lineItems.some(l => !l.item_name)) { setError('All line items need an item name.'); return }
    if (lineItems.some(l => l.party === 'custom' && !l.party_custom.trim())) { setError('Enter party name for outside party items.'); return }

    setSubmitting(true)

    const itemPayload = lineItems.map(l => ({
      item_name: l.item_name,
      metal_type: l.metal_type,
      purity: resolvedPurity(l),
      party: l.party === 'MNAP' ? 'MNAP' : l.party_custom,
      weight: parseFloat(l.weight) || null,
      notes: l.notes || null,
    }))

    if (editingId) {
      const { error: saleErr } = await supabase.from('approval_sales').update({
        party_name: partyName,
        transaction_type: transactionType,
        status: 'pending',
        send_back_reason: null,
        submitted_at: new Date().toISOString(),
      }).eq('id', editingId)

      if (saleErr) { setError(saleErr.message); setSubmitting(false); return }

      await supabase.from('approval_sale_items').delete().eq('sale_id', editingId)
      const { error: itemsErr } = await supabase.from('approval_sale_items').insert(
        itemPayload.map(item => ({ ...item, sale_id: editingId }))
      )

      if (itemsErr) { setError('Entry updated but items failed: ' + itemsErr.message); setSubmitting(false); return }

      setSuccess(true)
      setEditingId(null)
      await loadSentBack(sessionId, userId!)
      resetForm()
      setSubmitting(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()

    const { data: sale, error: saleErr } = await supabase.from('approval_sales').insert({
      day_session_id: sessionId,
      party_name: partyName,
      transaction_type: transactionType,
      submitted_by: user!.id,
    }).select('id').single()

    if (saleErr || !sale) { setError(saleErr?.message ?? 'Failed to save entry.'); setSubmitting(false); return }

    const { error: itemsErr } = await supabase.from('approval_sale_items').insert(
      itemPayload.map(item => ({ ...item, sale_id: sale.id }))
    )

    if (itemsErr) { setError('Entry saved but items failed: ' + itemsErr.message); setSubmitting(false); return }

    setSuccess(true)
    setSubmitting(false)
    resetForm()
  }

  function resetForm() {
    setPartyName(''); setTransactionType('approval'); setLineItems([defaultLine()])
    setTimeout(() => setSuccess(false), 3000)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Approval / Party Sale / Stock In — Module H</h1>
        <p className="text-sm text-gray-500 mt-1">Record items given on approval, sold to a party, returned, or stocked in.</p>
      </div>

      <Toast show={success} message={editingId ? 'Entry resubmitted for admin review.' : 'Entry submitted successfully and is pending admin review.'} />

      {/* Sent-back panel */}
      {sentBackEntries.length > 0 && (
        <div className="bg-orange-50 border border-orange-300 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-orange-800">↩ {sentBackEntries.length} entr{sentBackEntries.length > 1 ? 'ies' : 'y'} sent back for correction</p>
          {sentBackEntries.map(entry => (
            <div key={entry.id} className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-orange-900">{entry.party_name} — {TX_LABELS[entry.transaction_type] ?? entry.transaction_type}</p>
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
              <select value={transactionType} onChange={e => setTransactionType(e.target.value as 'sale' | 'approval' | 'approval_return' | 'stock_in')} className="input">
                <option value="approval">Approval</option>
                <option value="sale">Sale</option>
                <option value="approval_return">Approval Return</option>
                <option value="stock_in">Stock In</option>
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

                {/* Row 1: Purity (→ metal badge auto-shows) | Custom purity | Party | Party name */}
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
                      <input value={l.party_custom} onChange={e => updateLine(i, 'party_custom', e.target.value)}
                        placeholder="Party name" className="input" required />
                    </div>
                  )}
                </div>

                {/* Row 2: item name, weight, notes, remove */}
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
                  <div className="col-span-5 sm:col-span-3">
                    <label className="label">
                      Weight {l.metal_type === 'diamond' ? '(ct)' : '(g)'}
                    </label>
                    <input type="number" step="0.001" min="0" value={l.weight}
                      onChange={e => updateLine(i, 'weight', e.target.value)}
                      placeholder="0.000" className="input" />
                  </div>
                  <div className="col-span-6 sm:col-span-3">
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
          {submitting ? 'Submitting…' : editingId ? 'Resubmit Entry' : 'Submit Entry'}
        </button>
      </form>
    </div>
  )
}
