'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDateTime, PAYMENT_MODE_LABELS } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/StatusBadge'

type FilterStatus = 'pending' | 'approved' | 'rejected' | 'edited' | 'all'
type FilterModule = 'all' | 'sales' | 'receipts' | 'expenses' | 'old_gold' | 'direct' | 'payments' | 'approvals'

interface AuditEntry { field_name: string; original_value: string; edited_value: string; edit_reason: string; edited_at: string }

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
  if (type === 'old_gold') return `Old Gold Purchase — ${data.customer_name}`
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
  const [actionLoading, setActionLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])

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

  async function handleApprove(type: string, id: string) {
    setActionLoading(true)
    await supabase.from(getTableName(type)).update({ status: 'approved' }).eq('id', id)
    setMessage('Entry approved.')
    setSelected(null)
    await fetchEntries()
    setActionLoading(false)
  }

  async function handleReject(type: string, id: string) {
    if (!rejectReason.trim()) { setMessage('Please enter a rejection reason.'); return }
    setActionLoading(true)
    await supabase.from(getTableName(type)).update({ status: 'rejected', rejection_reason: rejectReason }).eq('id', id)
    setMessage('Entry rejected.')
    setRejectReason('')
    setSelected(null)
    await fetchEntries()
    setActionLoading(false)
  }

  async function handleEdit(type: string, id: string, field: string, oldVal: string, newVal: string) {
    if (oldVal === newVal) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from(getTableName(type)).update({ [field]: newVal, status: 'edited' }).eq('id', id)
    await supabase.from('audit_log').insert({
      table_name: getTableName(type),
      record_id: id,
      field_name: field,
      original_value: oldVal,
      edited_value: newVal,
      edited_by: user!.id,
      edit_reason: editReason || null,
    })
    await loadAuditLog(id)
    await fetchEntries()
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
          options={['pending', 'approved', 'rejected', 'edited', 'all']} />
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
              onOpen={() => { setSelected({ type, data }); setRejectReason(''); setMessage(''); loadAuditLog(data.id) }} />
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={e => { if (e.target === e.currentTarget) setSelected(null) }}>
          <div className="bg-white rounded-2xl w-full max-w-2xl my-8 shadow-2xl">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">{getEntryLabel(selected.type, selected.data)}</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="flex items-center gap-2">
                <StatusBadge status={selected.data.status} />
                <span className="text-xs text-gray-400">{formatDateTime(selected.data.submitted_at)}</span>
                <span className="text-xs text-gray-400">by {selected.data.profiles?.name ?? 'Staff'}</span>
              </div>

              {selected.data.rejection_reason && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                  Rejection reason: {selected.data.rejection_reason}
                </div>
              )}

              {selected.type === 'sales' && <SalesBillDetail data={selected.data} />}
              {selected.type === 'receipt' && <ReceiptDetail data={selected.data} />}
              {selected.type === 'expense' && <ExpenseDetail data={selected.data} />}
              {selected.type === 'old_gold' && <OldGoldDetail data={selected.data} />}
              {selected.type === 'direct' && <DirectReceiptDetail data={selected.data} />}
              {selected.type === 'payment' && <PartyPaymentDetail data={selected.data} />}
              {selected.type === 'approval_sale' && <ApprovalSaleDetail data={selected.data} />}

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

              <div className="border-t border-gray-100 pt-4 space-y-3">
                {selected.data.status !== 'approved' && (
                  <button onClick={() => handleApprove(selected.type, selected.data.id)} disabled={actionLoading}
                    className="w-full bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-2 rounded-lg">
                    ✓ Approve
                  </button>
                )}
                <div className="space-y-2">
                  <input value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                    placeholder="Rejection reason (required to reject)" className="input text-sm" />
                  <button onClick={() => handleReject(selected.type, selected.data.id)} disabled={actionLoading || !rejectReason.trim()}
                    className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white text-sm font-semibold py-2 rounded-lg">
                    ✗ Reject
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

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

function SalesBillDetail({ data }: { data: any }) {
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
        <p className="text-xs font-semibold text-gray-500 mb-1">Line Items</p>
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
            {(data.sales_line_items ?? []).map((l: any) => (
              <tr key={l.id} className="border-t border-gray-100">
                <td className="p-1.5">{l.item_name}</td>
                <td className="p-1.5 capitalize">{l.metal_type ?? '—'}</td>
                <td className="p-1.5">{l.purity ?? '—'}</td>
                <td className="p-1.5">{l.party ?? '—'}</td>
                <td className="p-1.5 text-right">{l.weight ? `${l.weight}g` : '—'}</td>
                <td className="p-1.5 text-right">{formatCurrency(l.amount)}</td>
              </tr>
            ))}
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
  return (
    <div className="text-sm">
      <InfoGrid items={[
        ['Type', data.receipt_type.replace('_', ' ')], ['Customer', data.customer_name],
        ...(data.serial_number ? [['Serial No.', data.serial_number] as [string, string]] : []),
        ...(data.repair_type ? [['Repair Type', data.repair_type] as [string, string]] : []),
        ...(data.weight ? [['Weight', `${data.weight}g`] as [string, string]] : []),
        ['Amount', formatCurrency(data.amount)],
        ['Payment', PAYMENT_MODE_LABELS[data.payment_mode] ?? data.payment_mode],
        ...(data.notes ? [['Notes', data.notes] as [string, string]] : []),
      ]} />
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
