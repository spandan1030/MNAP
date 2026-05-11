'use client'

import { useEffect, useState, useCallback, Fragment } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDateTime, PAYMENT_MODE_LABELS } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/StatusBadge'

type FilterStatus = 'pending' | 'approved' | 'rejected' | 'all'
type FilterModule = 'all' | 'sales' | 'receipts' | 'expenses' | 'old_gold' | 'direct' | 'payments' | 'approvals'

interface AuditEntry { field_name: string; original_value: string; edited_value: string; edit_reason: string; edited_at: string }

const EDITABLE_FIELDS: Record<string, string[]> = {
  sales:        ['customer_name', 'customer_phone', 'bill_number', 'old_gold_weight', 'old_gold_amount', 'old_silver_weight', 'old_silver_amount'],
  receipt:      ['receipt_type', 'serial_number', 'customer_name', 'repair_type', 'weight', 'amount', 'old_gold_weight', 'old_gold_amount', 'old_silver_weight', 'old_silver_amount', 'payment_mode', 'reference_serial', 'notes'],
  expense:      ['description', 'amount', 'payment_type', 'notes'],
  old_gold:     ['customer_name', 'customer_phone', 'metal_type', 'purity', 'weight', 'rate_per_gram', 'total_amount', 'payment_mode', 'notes'],
  direct:       ['customer_name', 'customer_number', 'amount', 'payment_mode', 'notes'],
  payment:      ['party_name', 'amount', 'payment_mode', 'notes'],
  approval_sale:['party_name', 'transaction_type'],
}
const NUMERIC_FIELDS = new Set(['amount', 'total_amount', 'weight', 'rate_per_gram', 'old_gold_weight', 'old_gold_amount', 'old_silver_weight', 'old_silver_amount'])

function getTableName(type: string): string {
  const map: Record<string, string> = {
    sales: 'sales_bills', receipt: 'money_receipts', expense: 'expenses',
    old_gold: 'old_gold_purchases', direct: 'direct_receipts', payment: 'party_payments',
    approval_sale: 'approval_sales',
  }
  return map[type] ?? 'expenses'
}

function getEntryLabel(type: string, data: any): string {
  if (type === 'sales') return `Sale — Bill #${data.bill_number}`
  if (type === 'receipt') return `Receipt — ${data.receipt_type.replace('_', ' ')}`
  if (type === 'expense') return `Expense — ${data.description}`
  if (type === 'old_gold') return `Old Metal Purchase — ${data.customer_name}`
  if (type === 'direct') return `Direct Receipt — ${data.customer_name}`
  if (type === 'payment') return `Payment — ${data.party_name}`
  return `${data.transaction_type === 'sale' ? 'Party Sale' : 'Approval'} — ${data.party_name}`
}

export default function QCPage() {
  const supabase = createClient()
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('pending')
  const [filterModule, setFilterModule] = useState<FilterModule>('all')
  const [bills, setBills] = useState<any[]>([])
  const [receipts, setReceipts] = useState<any[]>([])
  const [expenses, setExpenses] = useState<any[]>([])
  const [oldGoldPurchases, setOldGoldPurchases] = useState<any[]>([])
  const [directReceipts, setDirectReceipts] = useState<any[]>([])
  const [partyPayments, setPartyPayments] = useState<any[]>([])
  const [approvalSales, setApprovalSales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<{ type: string; data: any } | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [editReason, setEditReason] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState<any>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [dailyRates, setDailyRates] = useState<any>(null)

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]
    const { data: session } = await supabase.from('day_sessions').select('id').eq('date', today).single()
    if (!session) { setLoading(false); return }

    const statusFilter = filterStatus !== 'all' ? filterStatus : undefined
    const applyFilter = (res: any) =>
      statusFilter ? { data: (res.data ?? []).filter((x: any) => x.status === statusFilter) } : res

    const [b, r, e, og, dr, pp, as_] = await Promise.all([
      filterModule === 'all' || filterModule === 'sales'
        ? supabase.from('sales_bills').select('*, sales_line_items(*), sales_payments(*), profiles!submitted_by(name)')
            .eq('day_session_id', session.id).order('submitted_at', { ascending: false }).then(applyFilter)
        : { data: [] },
      filterModule === 'all' || filterModule === 'receipts'
        ? supabase.from('money_receipts').select('*, profiles!submitted_by(name)')
            .eq('day_session_id', session.id).order('submitted_at', { ascending: false }).then(applyFilter)
        : { data: [] },
      filterModule === 'all' || filterModule === 'expenses'
        ? supabase.from('expenses').select('*, profiles!submitted_by(name)')
            .eq('day_session_id', session.id).order('submitted_at', { ascending: false }).then(applyFilter)
        : { data: [] },
      filterModule === 'all' || filterModule === 'old_gold'
        ? supabase.from('old_gold_purchases').select('*, profiles!submitted_by(name)')
            .eq('day_session_id', session.id).order('submitted_at', { ascending: false }).then(applyFilter)
        : { data: [] },
      filterModule === 'all' || filterModule === 'direct'
        ? supabase.from('direct_receipts').select('*, profiles!submitted_by(name)')
            .eq('day_session_id', session.id).order('submitted_at', { ascending: false }).then(applyFilter)
        : { data: [] },
      filterModule === 'all' || filterModule === 'payments'
        ? supabase.from('party_payments').select('*, profiles!submitted_by(name)')
            .eq('day_session_id', session.id).order('submitted_at', { ascending: false }).then(applyFilter)
        : { data: [] },
      filterModule === 'all' || filterModule === 'approvals'
        ? supabase.from('approval_sales').select('*, approval_sale_items(*), profiles!submitted_by(name)')
            .eq('day_session_id', session.id).order('submitted_at', { ascending: false }).then(applyFilter)
        : { data: [] },
    ])

    setBills(b.data ?? [])
    setReceipts(r.data ?? [])
    setExpenses(e.data ?? [])
    setOldGoldPurchases(og.data ?? [])
    setDirectReceipts(dr.data ?? [])
    setPartyPayments(pp.data ?? [])
    setApprovalSales(as_.data ?? [])
    setLoading(false)
  }, [filterStatus, filterModule])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  async function loadAuditLog(recordId: string) {
    const { data } = await supabase.from('audit_log').select('*').eq('record_id', recordId).order('edited_at', { ascending: false })
    setAuditLog(data ?? [])
  }

  async function fetchDailyRates() {
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase.from('daily_rates').select('*').eq('date', today).maybeSingle()
    setDailyRates(data ?? null)
  }

  function closeModal() { setSelected(null); setEditMode(false); setEditData(null); setEditReason(''); setDailyRates(null) }

  async function handleApprove(type: string, id: string) {
    setActionLoading(true)
    await supabase.from(getTableName(type)).update({ status: 'approved' }).eq('id', id)
    setMessage('Entry approved.')
    closeModal()
    await fetchEntries()
    setActionLoading(false)
  }

  async function handleReject(type: string, id: string) {
    if (!rejectReason.trim()) { setMessage('Please enter a rejection reason.'); return }
    setActionLoading(true)
    await supabase.from(getTableName(type)).update({ status: 'rejected', rejection_reason: rejectReason }).eq('id', id)
    setMessage('Entry rejected.')
    setRejectReason('')
    closeModal()
    await fetchEntries()
    setActionLoading(false)
  }

  async function handleSaveEdits() {
    if (!selected || !editData || !editReason.trim()) return
    setActionLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    const fields = EDITABLE_FIELDS[selected.type] ?? []
    const updateObj: any = { status: 'approved' }
    const auditRows: any[] = []

    for (const field of fields) {
      const raw = editData[field]
      const coerced = NUMERIC_FIELDS.has(field)
        ? (raw === '' || raw == null ? null : parseFloat(String(raw)) || null)
        : (raw === '' ? null : raw ?? null)
      const original = selected.data[field] ?? null
      if (String(original ?? '') !== String(coerced ?? '')) {
        updateObj[field] = coerced
        auditRows.push({
          table_name: getTableName(selected.type),
          record_id: selected.data.id,
          field_name: field,
          original_value: original != null ? String(original) : null,
          edited_value: coerced != null ? String(coerced) : null,
          edited_by: user!.id,
          edit_reason: editReason,
        })
      }
    }

    if (auditRows.length === 0) {
      setEditMode(false)
      setActionLoading(false)
      return
    }

    await supabase.from(getTableName(selected.type)).update(updateObj).eq('id', selected.data.id)
    await supabase.from('audit_log').insert(auditRows)
    setMessage(`Entry updated — ${auditRows.length} field(s) changed.`)
    closeModal()
    await fetchEntries()
    setActionLoading(false)
  }

  const allEntries = [
    ...bills.map(b => ({ type: 'sales', data: b })),
    ...receipts.map(r => ({ type: 'receipt', data: r })),
    ...expenses.map(e => ({ type: 'expense', data: e })),
    ...oldGoldPurchases.map(o => ({ type: 'old_gold', data: o })),
    ...directReceipts.map(d => ({ type: 'direct', data: d })),
    ...partyPayments.map(p => ({ type: 'payment', data: p })),
    ...approvalSales.map(a => ({ type: 'approval_sale', data: a })),
  ].sort((a, b) => new Date(b.data.submitted_at).getTime() - new Date(a.data.submitted_at).getTime())

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">QC Review Panel</h1>

      <div className="flex flex-wrap gap-3 bg-white rounded-xl border border-gray-200 p-4">
        <FilterGroup label="Status" value={filterStatus} onChange={v => setFilterStatus(v as FilterStatus)}
          options={['pending', 'approved', 'rejected', 'all']} />
        <FilterGroup label="Module" value={filterModule} onChange={v => setFilterModule(v as FilterModule)}
          options={['all', 'sales', 'receipts', 'expenses', 'old_gold', 'direct', 'payments', 'approvals']}
          labels={{ old_gold: 'old gold' }} />
      </div>

      {message && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-700 text-sm">{message}</div>
      )}

      {loading ? (
        <div className="text-gray-500 text-sm">Loading entries…</div>
      ) : allEntries.length === 0 ? (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-8 text-center text-gray-500 text-sm">
          No entries found for selected filters.
        </div>
      ) : (
        <div className="space-y-2">
          {allEntries.map(({ type, data }) => (
            <EntryRow key={data.id} type={type} data={data}
              onOpen={() => {
                setSelected({ type, data })
                setRejectReason(''); setEditReason(''); setMessage('')
                setEditMode(false); setEditData(null)
                loadAuditLog(data.id)
                if (type === 'sales') fetchDailyRates()
              }} />
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div className="bg-white rounded-2xl w-full max-w-2xl my-8 shadow-2xl">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">{getEntryLabel(selected.type, selected.data)}</h2>
                {editMode && <p className="text-xs text-amber-600 mt-0.5">Edit mode — all changes will be logged</p>}
              </div>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="flex items-center gap-2">
                <StatusBadge status={selected.data.status} />
                <span className="text-xs text-gray-400">{formatDateTime(selected.data.submitted_at)}</span>
                <span className="text-xs text-gray-400">by {selected.data.profiles?.name ?? 'Staff'}</span>
              </div>

              {!editMode && selected.data.rejection_reason && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                  Rejection reason: {selected.data.rejection_reason}
                </div>
              )}

              {editMode ? (
                <div className="space-y-4">
                  {selected.type === 'sales'        && <SalesBillEditForm     data={editData} set={(f, v) => setEditData((p: any) => ({ ...p, [f]: v }))} />}
                  {selected.type === 'receipt'      && <ReceiptEditForm       data={editData} set={(f, v) => setEditData((p: any) => ({ ...p, [f]: v }))} />}
                  {selected.type === 'expense'      && <ExpenseEditForm       data={editData} set={(f, v) => setEditData((p: any) => ({ ...p, [f]: v }))} />}
                  {selected.type === 'old_gold'     && <OldGoldEditForm       data={editData} set={(f, v) => setEditData((p: any) => ({ ...p, [f]: v }))} />}
                  {selected.type === 'direct'       && <DirectReceiptEditForm data={editData} set={(f, v) => setEditData((p: any) => ({ ...p, [f]: v }))} />}
                  {selected.type === 'payment'      && <PartyPaymentEditForm  data={editData} set={(f, v) => setEditData((p: any) => ({ ...p, [f]: v }))} />}
                  {selected.type === 'approval_sale'&& <ApprovalSaleEditForm  data={editData} set={(f, v) => setEditData((p: any) => ({ ...p, [f]: v }))} />}

                  <div className="border-t border-gray-100 pt-3 space-y-2">
                    <input value={editReason} onChange={e => setEditReason(e.target.value)}
                      placeholder="Reason for edit (required)" className="input text-sm" />
                    <div className="flex gap-2">
                      <button onClick={handleSaveEdits} disabled={actionLoading || !editReason.trim()}
                        className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white text-sm font-semibold py-2 rounded-lg">
                        {actionLoading ? 'Saving…' : 'Save Changes'}
                      </button>
                      <button onClick={() => { setEditMode(false); setEditData(null); setEditReason('') }}
                        className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold py-2 rounded-lg">
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {selected.type === 'sales'        && <SalesBillDetail     data={selected.data} dailyRates={dailyRates} />}
                  {selected.type === 'receipt'      && <ReceiptDetail       data={selected.data} />}
                  {selected.type === 'expense'      && <ExpenseDetail       data={selected.data} />}
                  {selected.type === 'old_gold'     && <OldGoldDetail       data={selected.data} />}
                  {selected.type === 'direct'       && <DirectReceiptDetail data={selected.data} />}
                  {selected.type === 'payment'      && <PartyPaymentDetail  data={selected.data} />}
                  {selected.type === 'approval_sale'&& <ApprovalSaleDetail  data={selected.data} />}

                  {auditLog.length > 0 && (
                    <div className="border-t border-gray-100 pt-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Audit Trail</p>
                      <div className="space-y-1.5">
                        {auditLog.map((a, i) => (
                          <div key={i} className="bg-blue-50 rounded-lg p-2 text-xs text-blue-700">
                            <span className="font-medium">{a.field_name}</span>: "{a.original_value}" → "{a.edited_value}"
                            {a.edit_reason && <span className="text-blue-500"> ({a.edit_reason})</span>}
                            <span className="text-blue-400 ml-1">{formatDateTime(a.edited_at)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="border-t border-gray-100 pt-4 space-y-2">
                    {selected.data.status !== 'approved' && (
                      <button onClick={() => handleApprove(selected.type, selected.data.id)} disabled={actionLoading}
                        className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-sm font-semibold py-2 rounded-lg">
                        ✓ Approve
                      </button>
                    )}
                    <button
                      onClick={() => { setEditMode(true); setEditData({ ...selected.data }); setEditReason('') }}
                      disabled={actionLoading}
                      className="w-full bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 text-sm font-semibold py-2 rounded-lg">
                      ✎ Edit Entry
                    </button>
                    <div className="space-y-2">
                      <input value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                        placeholder="Rejection reason (required to reject)" className="input text-sm" />
                      <button onClick={() => handleReject(selected.type, selected.data.id)} disabled={actionLoading || !rejectReason.trim()}
                        className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white text-sm font-semibold py-2 rounded-lg">
                        ✗ Reject
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

function FilterGroup({ label, value, onChange, options, labels = {} }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; labels?: Record<string, string>
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 font-medium">{label}:</span>
      <div className="flex gap-1 flex-wrap">
        {options.map(o => (
          <button key={o} onClick={() => onChange(o)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors ${value === o ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {labels[o] ?? o}
          </button>
        ))}
      </div>
    </div>
  )
}

function EntryRow({ type, data, onOpen }: { type: string; data: any; onOpen: () => void }) {
  return (
    <div onClick={onOpen} className="bg-white rounded-xl border border-gray-200 hover:border-amber-300 p-4 cursor-pointer transition-colors flex items-center justify-between">
      <div>
        <p className="font-medium text-gray-900 text-sm">{getEntryLabel(type, data)}</p>
        <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(data.submitted_at)} · {data.profiles?.name ?? 'Staff'}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-gray-700">
          {(data.total_amount != null || data.amount != null)
            ? formatCurrency(data.total_amount ?? data.amount)
            : `${(data.approval_sale_items ?? []).length} item(s)`}
        </span>
        <StatusBadge status={data.status} />
      </div>
    </div>
  )
}

function InfoGrid({ items }: { items: [string, string][] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
      {items.map(([k, v]) => (
        <div key={k}>
          <span className="text-gray-500 text-xs">{k}</span>
          <p className="text-gray-900 font-medium">{v}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Edit field primitives ───────────────────────────────────────────────────

function EField({ label, value, onChange, type = 'text', step }: {
  label: string; value: any; onChange: (v: string) => void; type?: string; step?: string
}) {
  return (
    <div>
      <span className="text-gray-500 text-xs">{label}</span>
      <input type={type} step={step} value={value ?? ''} onChange={e => onChange(e.target.value)}
        className="block w-full mt-0.5 border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500" />
    </div>
  )
}

function ESel({ label, value, onChange, options }: {
  label: string; value: any; onChange: (v: string) => void; options: [string, string][]
}) {
  return (
    <div>
      <span className="text-gray-500 text-xs">{label}</span>
      <select value={value ?? ''} onChange={e => onChange(e.target.value)}
        className="block w-full mt-0.5 border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  )
}

// ─── Detail views ────────────────────────────────────────────────────────────

function getRateForItem(item: any, rates: any): { rate: number; label: string } | null {
  if (!rates || !item.weight) return null
  if (item.metal_type === 'silver') return rates.rate_silver ? { rate: rates.rate_silver, label: 'Silver' } : null
  if (item.metal_type === 'gold') {
    if (item.purity === '24K' && rates.rate_24kt) return { rate: rates.rate_24kt, label: '24 KT' }
    if (item.purity === '22K' && rates.rate_22kt) return { rate: rates.rate_22kt, label: '22 KT' }
    if (item.purity === '18K' && rates.rate_18kt) return { rate: rates.rate_18kt, label: '18 KT' }
  }
  return null
}

function RateCheckPanel({ item, rates, onClose }: { item: any; rates: any; onClose: () => void }) {
  const rateInfo = getRateForItem(item, rates)
  const weight = item.weight ?? 0
  const billedAmount = item.amount ?? 0

  let metalValue: number | null = null
  let makingPct: number | null = null

  if (rateInfo && weight > 0) {
    metalValue = rateInfo.rate * weight
    if (metalValue > 0 && billedAmount > 0) {
      makingPct = ((billedAmount / 1.03) / metalValue - 1) * 100
    }
  }

  return (
    <div className="mt-1 mb-2 mx-0 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs space-y-1.5">
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold text-amber-800 text-[11px] uppercase tracking-wide">Rate Check — {item.item_name}</span>
        <button onClick={onClose} className="text-amber-400 hover:text-amber-700 font-bold text-sm leading-none">×</button>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span className="text-gray-500">Weight</span>
        <span className="font-medium text-gray-900">{weight ? `${weight}g` : '—'}</span>

        <span className="text-gray-500">Rate ({rateInfo ? rateInfo.label : item.purity ?? item.metal_type})</span>
        <span className="font-medium text-gray-900">
          {rateInfo ? `₹${rateInfo.rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}/g` : <span className="text-red-500">No rate saved for today</span>}
        </span>

        {metalValue != null && (
          <>
            <span className="text-gray-500">Metal value</span>
            <span className="font-medium text-gray-900">{formatCurrency(metalValue)}</span>
          </>
        )}

        <span className="text-gray-500">Billed amount</span>
        <span className="font-medium text-gray-900">{formatCurrency(billedAmount)}</span>

        {makingPct != null && (
          <>
            <span className="text-gray-500">Making charge (back-calc)</span>
            <span className="font-semibold text-amber-700">{makingPct.toFixed(2)}%</span>
          </>
        )}
      </div>

      {!rateInfo && rates && (
        <p className="text-gray-400 italic pt-1">
          {item.metal_type === 'other' ? 'Rate check not applicable for Other metal type.' : `No ${item.purity ?? item.metal_type} rate saved for today — set it in Admin → Rates.`}
        </p>
      )}
      {!rates && (
        <p className="text-gray-400 italic pt-1">No rates saved for today — set them in Admin → Rates.</p>
      )}
    </div>
  )
}

function SalesBillDetail({ data, dailyRates }: { data: any; dailyRates: any }) {
  const [checkedItemId, setCheckedItemId] = useState<string | null>(null)

  return (
    <div className="space-y-3 text-sm">
      <InfoGrid items={[
        ['Customer', data.customer_name], ['Phone', data.customer_phone],
        ['Bill #', data.bill_number], ['Total', formatCurrency(data.total_amount)],
      ]} />
      {(data.old_gold_weight || data.old_silver_weight) && (
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs font-semibold text-gray-500 mb-1">Old Metal Exchange</p>
          {data.old_gold_weight && <p>Gold: {data.old_gold_weight}g — {formatCurrency(data.old_gold_amount)}</p>}
          {data.old_silver_weight && <p>Silver: {data.old_silver_weight}g — {formatCurrency(data.old_silver_amount)}</p>}
        </div>
      )}
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-1">
          Line Items
          <span className="ml-1.5 text-gray-400 font-normal normal-case">· tap a row to verify amount</span>
        </p>
        <table className="w-full text-xs border-collapse">
          <thead><tr className="bg-gray-50">
            <th className="text-left p-1.5 font-medium">Item</th>
            <th className="text-left p-1.5 font-medium">Metal</th>
            <th className="text-left p-1.5 font-medium">Purity</th>
            <th className="text-left p-1.5 font-medium">Party</th>
            <th className="text-right p-1.5 font-medium">Weight</th>
            <th className="text-right p-1.5 font-medium">Amount</th>
          </tr></thead>
          <tbody>
            {(data.sales_line_items ?? []).map((l: any) => {
              const isOpen = checkedItemId === l.id
              const canCheck = l.metal_type !== 'other' && l.weight
              return (
                <Fragment key={l.id}>
                  <tr
                    onClick={() => canCheck && setCheckedItemId(isOpen ? null : l.id)}
                    className={`border-t border-gray-100 transition-colors
                      ${canCheck ? 'cursor-pointer hover:bg-amber-50' : ''}
                      ${isOpen ? 'bg-amber-50' : ''}`}
                  >
                    <td className="p-1.5">{l.item_name}</td>
                    <td className="p-1.5 capitalize">{l.metal_type ?? '—'}</td>
                    <td className="p-1.5">{l.purity ?? '—'}</td>
                    <td className="p-1.5">{l.party ?? '—'}</td>
                    <td className="p-1.5 text-right">{l.weight ? `${l.weight}g` : '—'}</td>
                    <td className="p-1.5 text-right">{formatCurrency(l.amount)}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={6} className="px-1 pb-1">
                        <RateCheckPanel item={l} rates={dailyRates} onClose={() => setCheckedItemId(null)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-1">Payments</p>
        {(data.sales_payments ?? []).map((p: any) => (
          <div key={p.id} className="flex justify-between text-xs py-0.5">
            <span>{PAYMENT_MODE_LABELS[p.payment_mode] ?? p.payment_mode}{p.reference_serial ? ` (${p.reference_serial})` : ''}{p.cheque_number ? ` #${p.cheque_number}` : ''}</span>
            <span className="font-medium">{formatCurrency(p.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReceiptDetail({ data }: { data: any }) {
  const metalTotal = (data.old_gold_amount ?? 0) + (data.old_silver_amount ?? 0)
  const cashPortion = data.amount - metalTotal
  const hasMetalExchange = metalTotal > 0
  return (
    <div className="space-y-3 text-sm">
      <InfoGrid items={[
        ['Type', data.receipt_type.replace('_', ' ')], ['Customer', data.customer_name],
        ...(data.serial_number ? [['Serial No.', data.serial_number] as [string, string]] : []),
        ...(data.repair_type ? [['Repair Type', data.repair_type] as [string, string]] : []),
        ...(data.weight ? [['Weight', `${data.weight}g`] as [string, string]] : []),
        ['Total Amount', formatCurrency(data.amount)],
        ...(data.notes ? [['Notes', data.notes] as [string, string]] : []),
      ]} />
      {hasMetalExchange && (
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs font-semibold text-gray-500 mb-1">Old Metal Exchange</p>
          {(data.old_gold_amount ?? 0) > 0 && <p>Gold{data.old_gold_weight ? `: ${data.old_gold_weight}g` : ''} — {formatCurrency(data.old_gold_amount)}</p>}
          {(data.old_silver_amount ?? 0) > 0 && <p>Silver{data.old_silver_weight ? `: ${data.old_silver_weight}g` : ''} — {formatCurrency(data.old_silver_amount)}</p>}
        </div>
      )}
      {cashPortion > 0.005 ? (
        <InfoGrid items={[
          ['Payment Mode', PAYMENT_MODE_LABELS[data.payment_mode] ?? data.payment_mode],
          ['Cash Received', formatCurrency(cashPortion)],
        ]} />
      ) : hasMetalExchange ? (
        <p className="text-xs text-gray-500 italic px-1">Fully settled via metal exchange — no cash received</p>
      ) : (
        <InfoGrid items={[['Payment Mode', PAYMENT_MODE_LABELS[data.payment_mode] ?? data.payment_mode]]} />
      )}
    </div>
  )
}

function ExpenseDetail({ data }: { data: any }) {
  return (
    <div className="text-sm">
      <InfoGrid items={[
        ['Description', data.description], ['Amount', formatCurrency(data.amount)],
        ['Payment Type', data.payment_type === 'bank_transfer' ? 'Bank Transfer' : 'Cash'],
        ...(data.notes ? [['Notes', data.notes] as [string, string]] : []),
      ]} />
    </div>
  )
}

function OldGoldDetail({ data }: { data: any }) {
  return (
    <div className="text-sm">
      <InfoGrid items={[
        ['Customer', data.customer_name],
        ...(data.customer_phone ? [['Phone', data.customer_phone] as [string, string]] : []),
        ['Metal', data.metal_type], ['Purity', data.purity ?? '—'],
        ['Weight', `${data.weight}g`],
        ...(data.rate_per_gram ? [['Rate/g', `₹${data.rate_per_gram}`] as [string, string]] : []),
        ['Amount Paid', formatCurrency(data.total_amount)],
        ['Payment Mode', data.payment_mode === 'bank_transfer' ? 'Bank Transfer' : 'Cash'],
        ...(data.notes ? [['Notes', data.notes] as [string, string]] : []),
      ]} />
    </div>
  )
}

function ApprovalSaleDetail({ data }: { data: any }) {
  return (
    <div className="space-y-3 text-sm">
      <InfoGrid items={[
        ['Party', data.party_name],
        ['Type', data.transaction_type === 'sale' ? 'Party Sale' : 'Approval'],
      ]} />
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-1">Items</p>
        <table className="w-full text-xs border-collapse">
          <thead><tr className="bg-gray-50">
            <th className="text-left p-1.5 font-medium">Item</th>
            <th className="text-left p-1.5 font-medium">Metal</th>
            <th className="text-left p-1.5 font-medium">Purity</th>
            <th className="text-left p-1.5 font-medium">Party</th>
            <th className="text-right p-1.5 font-medium">Weight</th>
            <th className="text-left p-1.5 font-medium">Notes</th>
          </tr></thead>
          <tbody>
            {(data.approval_sale_items ?? []).map((l: any) => (
              <tr key={l.id} className="border-t border-gray-100">
                <td className="p-1.5">{l.item_name}</td>
                <td className="p-1.5 capitalize">{l.metal_type}</td>
                <td className="p-1.5">{l.purity ?? '—'}</td>
                <td className="p-1.5">{l.party}</td>
                <td className="p-1.5 text-right">{l.weight ? `${l.weight}g` : '—'}</td>
                <td className="p-1.5 text-gray-500">{l.notes ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PartyPaymentDetail({ data }: { data: any }) {
  return (
    <div className="text-sm">
      <InfoGrid items={[
        ['Party', data.party_name],
        ['Amount', formatCurrency(data.amount)],
        ['Payment Mode', data.payment_mode === 'bank_transfer' ? 'Bank Transfer' : 'Cash'],
        ...(data.notes ? [['Notes', data.notes] as [string, string]] : []),
      ]} />
    </div>
  )
}

function DirectReceiptDetail({ data }: { data: any }) {
  return (
    <div className="text-sm">
      <InfoGrid items={[
        ['Customer', data.customer_name],
        ...(data.customer_number ? [['Phone / Ref', data.customer_number] as [string, string]] : []),
        ['Amount', formatCurrency(data.amount)],
        ['Payment Mode', PAYMENT_MODE_LABELS[data.payment_mode] ?? data.payment_mode],
        ...(data.notes ? [['Notes', data.notes] as [string, string]] : []),
      ]} />
    </div>
  )
}

// ─── Edit forms ──────────────────────────────────────────────────────────────

function SalesBillEditForm({ data, set }: { data: any; set: (f: string, v: any) => void }) {
  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Bill Details</p>
        <div className="grid grid-cols-2 gap-3">
          <EField label="Customer Name" value={data.customer_name} onChange={v => set('customer_name', v)} />
          <EField label="Phone" value={data.customer_phone} onChange={v => set('customer_phone', v)} />
          <div className="col-span-2">
            <EField label="Bill #" value={data.bill_number} onChange={v => set('bill_number', v)} />
          </div>
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Old Metal Exchange</p>
        <div className="grid grid-cols-2 gap-3">
          <EField label="Old Gold Weight (g)" value={data.old_gold_weight} onChange={v => set('old_gold_weight', v)} type="number" step="0.001" />
          <EField label="Old Gold Amount (₹)" value={data.old_gold_amount} onChange={v => set('old_gold_amount', v)} type="number" step="0.01" />
          <EField label="Old Silver Weight (g)" value={data.old_silver_weight} onChange={v => set('old_silver_weight', v)} type="number" step="0.001" />
          <EField label="Old Silver Amount (₹)" value={data.old_silver_amount} onChange={v => set('old_silver_amount', v)} type="number" step="0.01" />
        </div>
      </div>
      <p className="text-xs text-gray-400 italic">Line items and payments cannot be edited here.</p>
    </div>
  )
}

function ReceiptEditForm({ data, set }: { data: any; set: (f: string, v: any) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      <ESel label="Type" value={data.receipt_type} onChange={v => set('receipt_type', v)}
        options={[['advance','Advance'],['sip','SIP'],['customer_credit','Customer Credit'],['repair','Repair']]} />
      <EField label="Customer Name" value={data.customer_name} onChange={v => set('customer_name', v)} />
      {(data.receipt_type === 'advance' || data.receipt_type === 'sip') &&
        <EField label="Serial No." value={data.serial_number} onChange={v => set('serial_number', v)} />}
      {data.receipt_type === 'repair' && <>
        <EField label="Repair Type" value={data.repair_type} onChange={v => set('repair_type', v)} />
        <EField label="Item Weight (g)" value={data.weight} onChange={v => set('weight', v)} type="number" step="0.001" />
      </>}
      <EField label="Total Amount (₹)" value={data.amount} onChange={v => set('amount', v)} type="number" step="0.01" />
      <ESel label="Payment Mode" value={data.payment_mode ?? ''} onChange={v => set('payment_mode', v || null)}
        options={[['','None (fully by metal)'],['cash','Cash'],['card','Card'],['upi','UPI'],['phonepe','PhonePe'],['cheque','Cheque'],['advance_adjustment','Advance Adjustment'],['sip_adjustment','SIP Adjustment']]} />
      {(data.payment_mode === 'advance_adjustment' || data.payment_mode === 'sip_adjustment') && (
        <EField label="Reference Serial No." value={data.reference_serial} onChange={v => set('reference_serial', v)} />
      )}
      <EField label="Old Gold Weight (g)" value={data.old_gold_weight} onChange={v => set('old_gold_weight', v)} type="number" step="0.001" />
      <EField label="Old Gold Amount (₹)" value={data.old_gold_amount} onChange={v => set('old_gold_amount', v)} type="number" step="0.01" />
      <EField label="Old Silver Weight (g)" value={data.old_silver_weight} onChange={v => set('old_silver_weight', v)} type="number" step="0.001" />
      <EField label="Old Silver Amount (₹)" value={data.old_silver_amount} onChange={v => set('old_silver_amount', v)} type="number" step="0.01" />
      <div className="col-span-2">
        <EField label="Notes" value={data.notes} onChange={v => set('notes', v)} />
      </div>
    </div>
  )
}

function ExpenseEditForm({ data, set }: { data: any; set: (f: string, v: any) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      <div className="col-span-2">
        <EField label="Description" value={data.description} onChange={v => set('description', v)} />
      </div>
      <EField label="Amount (₹)" value={data.amount} onChange={v => set('amount', v)} type="number" step="0.01" />
      <ESel label="Payment Type" value={data.payment_type} onChange={v => set('payment_type', v)}
        options={[['cash','Cash'],['bank_transfer','Bank Transfer']]} />
      <div className="col-span-2">
        <EField label="Notes" value={data.notes} onChange={v => set('notes', v)} />
      </div>
    </div>
  )
}

function OldGoldEditForm({ data, set }: { data: any; set: (f: string, v: any) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      <EField label="Customer Name" value={data.customer_name} onChange={v => set('customer_name', v)} />
      <EField label="Phone" value={data.customer_phone} onChange={v => set('customer_phone', v)} />
      <ESel label="Metal Type" value={data.metal_type} onChange={v => set('metal_type', v)}
        options={[['gold','Gold'],['silver','Silver']]} />
      <EField label="Purity" value={data.purity} onChange={v => set('purity', v)} />
      <EField label="Weight (g)" value={data.weight} onChange={v => set('weight', v)} type="number" step="0.001" />
      <EField label="Rate/g (₹)" value={data.rate_per_gram} onChange={v => set('rate_per_gram', v)} type="number" step="0.01" />
      <EField label="Total Amount (₹)" value={data.total_amount} onChange={v => set('total_amount', v)} type="number" step="0.01" />
      <ESel label="Payment Mode" value={data.payment_mode} onChange={v => set('payment_mode', v)}
        options={[['cash','Cash'],['bank_transfer','Bank Transfer']]} />
      <div className="col-span-2">
        <EField label="Notes" value={data.notes} onChange={v => set('notes', v)} />
      </div>
    </div>
  )
}

function DirectReceiptEditForm({ data, set }: { data: any; set: (f: string, v: any) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      <EField label="Customer Name" value={data.customer_name} onChange={v => set('customer_name', v)} />
      <EField label="Phone / Ref" value={data.customer_number} onChange={v => set('customer_number', v)} />
      <EField label="Amount (₹)" value={data.amount} onChange={v => set('amount', v)} type="number" step="0.01" />
      <ESel label="Payment Mode" value={data.payment_mode} onChange={v => set('payment_mode', v)}
        options={[['cash','Cash'],['card','Card'],['upi','UPI'],['phonepe','PhonePe'],['cheque','Cheque'],['bank_transfer','Bank Transfer']]} />
      <div className="col-span-2">
        <EField label="Notes" value={data.notes} onChange={v => set('notes', v)} />
      </div>
    </div>
  )
}

function PartyPaymentEditForm({ data, set }: { data: any; set: (f: string, v: any) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      <div className="col-span-2">
        <EField label="Party Name" value={data.party_name} onChange={v => set('party_name', v)} />
      </div>
      <EField label="Amount (₹)" value={data.amount} onChange={v => set('amount', v)} type="number" step="0.01" />
      <ESel label="Payment Mode" value={data.payment_mode} onChange={v => set('payment_mode', v)}
        options={[['cash','Cash'],['bank_transfer','Bank Transfer']]} />
      <div className="col-span-2">
        <EField label="Notes" value={data.notes} onChange={v => set('notes', v)} />
      </div>
    </div>
  )
}

function ApprovalSaleEditForm({ data, set }: { data: any; set: (f: string, v: any) => void }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <EField label="Party Name" value={data.party_name} onChange={v => set('party_name', v)} />
        </div>
        <ESel label="Transaction Type" value={data.transaction_type} onChange={v => set('transaction_type', v)}
          options={[['approval','Approval (Sent to Party)'],['sale','Party Sale']]} />
      </div>
      <p className="text-xs text-gray-400 italic">Line items cannot be edited here.</p>
    </div>
  )
}
