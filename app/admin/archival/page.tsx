'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDateTime, PAYMENT_MODE_LABELS } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/StatusBadge'

export default function ArchivalPage() {
  const supabase = createClient()
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [statusFilter, setStatusFilter] = useState('all')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { loadData() }, [date])

  async function loadData() {
    setLoading(true)
    setData(null)
    const { data: session } = await supabase.from('day_sessions').select('id, date').eq('date', date).single()
    if (!session) { setLoading(false); return }

    const [bills, receipts, expenses, ogPurchases, drReceipts, partyPayments] = await Promise.all([
      supabase.from('sales_bills').select('*, sales_line_items(*), sales_payments(*), profiles!submitted_by(name)').eq('day_session_id', session.id).order('submitted_at'),
      supabase.from('money_receipts').select('*, profiles!submitted_by(name)').eq('day_session_id', session.id).order('submitted_at'),
      supabase.from('expenses').select('*, profiles!submitted_by(name)').eq('day_session_id', session.id).order('submitted_at'),
      supabase.from('old_gold_purchases').select('*, profiles!submitted_by(name)').eq('day_session_id', session.id).order('submitted_at'),
      supabase.from('direct_receipts').select('*, profiles!submitted_by(name)').eq('day_session_id', session.id).order('submitted_at'),
      supabase.from('party_payments').select('*, profiles!submitted_by(name)').eq('day_session_id', session.id).order('submitted_at'),
    ])

    setData({
      bills: bills.data ?? [],
      receipts: receipts.data ?? [],
      expenses: expenses.data ?? [],
      ogPurchases: ogPurchases.data ?? [],
      drReceipts: drReceipts.data ?? [],
      partyPayments: partyPayments.data ?? [],
    })
    setLoading(false)
  }

  function filtered(arr: any[]) {
    if (statusFilter === 'all') return arr
    return arr.filter(e => e.status === statusFilter)
  }

  const totalCount = data
    ? filtered(data.bills).length + filtered(data.receipts).length + filtered(data.expenses).length +
      filtered(data.ogPurchases).length + filtered(data.drReceipts).length + filtered(data.partyPayments).length
    : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Archival — All Entries</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
          <div className="flex gap-1 flex-wrap">
            {['all', 'pending', 'approved', 'rejected', 'edited'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors ${statusFilter === s ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && <div className="text-gray-500 text-sm">Loading entries…</div>}

      {!loading && !data && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center text-gray-500">
          No day session found for {date}.
        </div>
      )}

      {data && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">{totalCount} entries for {date}</p>

          {/* Sales Bills */}
          <Section title={`Sales Bills (Module A) — ${filtered(data.bills).length} entries`}>
            {filtered(data.bills).length === 0 ? <Empty /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse min-w-[1100px]">
                  <thead><tr className="bg-gray-50 text-left">
                    <th className="p-2 font-medium whitespace-nowrap">Bill #</th>
                    <th className="p-2 font-medium whitespace-nowrap">Customer</th>
                    <th className="p-2 font-medium whitespace-nowrap">Phone</th>
                    <th className="p-2 font-medium" style={{ minWidth: '260px' }}>Items</th>
                    <th className="p-2 font-medium text-right whitespace-nowrap">Total</th>
                    <th className="p-2 font-medium whitespace-nowrap">Old Metal</th>
                    <th className="p-2 font-medium whitespace-nowrap">Payments</th>
                    <th className="p-2 font-medium whitespace-nowrap">Status</th>
                    <th className="p-2 font-medium whitespace-nowrap">Time</th>
                    <th className="p-2 font-medium whitespace-nowrap">By</th>
                  </tr></thead>
                  <tbody>
                    {filtered(data.bills).map((b: any) => (
                      <tr key={b.id} className="border-t border-gray-100 align-top">
                        <td className="p-2 font-medium whitespace-nowrap">{b.bill_number}</td>
                        <td className="p-2 whitespace-nowrap">{b.customer_name}</td>
                        <td className="p-2 whitespace-nowrap">{b.customer_phone}</td>
                        <td className="p-2" style={{ minWidth: '260px' }}>
                          {(b.sales_line_items ?? []).map((l: any, idx: number) => (
                            <div key={l.id} className={`py-1 ${idx > 0 ? 'border-t border-gray-100 mt-1' : ''}`}>
                              <span className="font-medium">{l.item_name}</span>
                              <span className="text-gray-400"> · </span>
                              <span className="text-gray-600 capitalize">{l.metal_type}</span>
                              {l.purity && <span className="text-gray-500"> {l.purity}</span>}
                              <span className="text-gray-400"> · </span>
                              <span className="text-gray-600">{l.party ?? '—'}</span>
                              {l.weight ? <span className="text-gray-500"> · {l.weight}g</span> : null}
                              <span className="font-medium"> — {formatCurrency(l.amount)}</span>
                            </div>
                          ))}
                        </td>
                        <td className="p-2 text-right font-medium">{formatCurrency(b.total_amount)}</td>
                        <td className="p-2">
                          {b.old_gold_weight ? <div>Gold: {b.old_gold_weight}g / {formatCurrency(b.old_gold_amount)}</div> : null}
                          {b.old_silver_weight ? <div>Silver: {b.old_silver_weight}g / {formatCurrency(b.old_silver_amount)}</div> : null}
                          {!b.old_gold_weight && !b.old_silver_weight ? '—' : null}
                        </td>
                        <td className="p-2">
                          {(b.sales_payments ?? []).map((p: any) => (
                            <div key={p.id}>{PAYMENT_MODE_LABELS[p.payment_mode] ?? p.payment_mode}: {formatCurrency(p.amount)}</div>
                          ))}
                        </td>
                        <td className="p-2"><StatusBadge status={b.status} /></td>
                        <td className="p-2 text-gray-400 whitespace-nowrap">{formatDateTime(b.submitted_at)}</td>
                        <td className="p-2">{b.profiles?.name ?? 'Staff'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Money Receipts */}
          <Section title={`Money Receipts (Module B) — ${filtered(data.receipts).length} entries`}>
            {filtered(data.receipts).length === 0 ? <Empty /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse min-w-[700px]">
                  <thead><tr className="bg-gray-50 text-left">
                    <th className="p-2 font-medium">Type</th>
                    <th className="p-2 font-medium">Serial No.</th>
                    <th className="p-2 font-medium">Customer</th>
                    <th className="p-2 font-medium">Repair Type</th>
                    <th className="p-2 font-medium">Weight</th>
                    <th className="p-2 font-medium text-right">Amount</th>
                    <th className="p-2 font-medium">Payment</th>
                    <th className="p-2 font-medium">Notes</th>
                    <th className="p-2 font-medium">Status</th>
                    <th className="p-2 font-medium">Time</th>
                    <th className="p-2 font-medium">By</th>
                  </tr></thead>
                  <tbody>
                    {filtered(data.receipts).map((r: any) => (
                      <tr key={r.id} className="border-t border-gray-100">
                        <td className="p-2 capitalize">{r.receipt_type.replace('_', ' ')}</td>
                        <td className="p-2">{r.serial_number ?? '—'}</td>
                        <td className="p-2">{r.customer_name}</td>
                        <td className="p-2">{r.repair_type ?? '—'}</td>
                        <td className="p-2">{r.weight ? `${r.weight}g` : '—'}</td>
                        <td className="p-2 text-right font-medium">{formatCurrency(r.amount)}</td>
                        <td className="p-2 uppercase">{r.payment_mode}</td>
                        <td className="p-2 text-gray-500">{r.notes ?? '—'}</td>
                        <td className="p-2"><StatusBadge status={r.status} /></td>
                        <td className="p-2 text-gray-400 whitespace-nowrap">{formatDateTime(r.submitted_at)}</td>
                        <td className="p-2">{r.profiles?.name ?? 'Staff'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Old Gold Purchases */}
          <Section title={`Old Gold Purchases (Module E) — ${filtered(data.ogPurchases).length} entries`}>
            {filtered(data.ogPurchases).length === 0 ? <Empty /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse min-w-[700px]">
                  <thead><tr className="bg-gray-50 text-left">
                    <th className="p-2 font-medium">Customer</th>
                    <th className="p-2 font-medium">Phone</th>
                    <th className="p-2 font-medium">Metal</th>
                    <th className="p-2 font-medium">Purity</th>
                    <th className="p-2 font-medium text-right">Weight</th>
                    <th className="p-2 font-medium text-right">Rate/g</th>
                    <th className="p-2 font-medium text-right">Amount</th>
                    <th className="p-2 font-medium">Payment</th>
                    <th className="p-2 font-medium">Notes</th>
                    <th className="p-2 font-medium">Status</th>
                    <th className="p-2 font-medium">Time</th>
                    <th className="p-2 font-medium">By</th>
                  </tr></thead>
                  <tbody>
                    {filtered(data.ogPurchases).map((p: any) => (
                      <tr key={p.id} className="border-t border-gray-100">
                        <td className="p-2">{p.customer_name}</td>
                        <td className="p-2">{p.customer_phone ?? '—'}</td>
                        <td className="p-2 capitalize">{p.metal_type}</td>
                        <td className="p-2">{p.purity ?? '—'}</td>
                        <td className="p-2 text-right">{p.weight}g</td>
                        <td className="p-2 text-right">{p.rate_per_gram ? `₹${p.rate_per_gram}` : '—'}</td>
                        <td className="p-2 text-right font-medium">{formatCurrency(p.total_amount)}</td>
                        <td className="p-2">{p.payment_mode === 'bank_transfer' ? 'Bank Transfer' : 'Cash'}</td>
                        <td className="p-2 text-gray-500">{p.notes ?? '—'}</td>
                        <td className="p-2"><StatusBadge status={p.status} /></td>
                        <td className="p-2 text-gray-400 whitespace-nowrap">{formatDateTime(p.submitted_at)}</td>
                        <td className="p-2">{p.profiles?.name ?? 'Staff'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Direct Receipts */}
          <Section title={`Direct Money Receipts (Module F) — ${filtered(data.drReceipts).length} entries`}>
            {filtered(data.drReceipts).length === 0 ? <Empty /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse min-w-[600px]">
                  <thead><tr className="bg-gray-50 text-left">
                    <th className="p-2 font-medium">Customer</th>
                    <th className="p-2 font-medium">Phone / Ref</th>
                    <th className="p-2 font-medium text-right">Amount</th>
                    <th className="p-2 font-medium">Payment</th>
                    <th className="p-2 font-medium">Notes</th>
                    <th className="p-2 font-medium">Status</th>
                    <th className="p-2 font-medium">Time</th>
                    <th className="p-2 font-medium">By</th>
                  </tr></thead>
                  <tbody>
                    {filtered(data.drReceipts).map((r: any) => (
                      <tr key={r.id} className="border-t border-gray-100">
                        <td className="p-2">{r.customer_name}</td>
                        <td className="p-2">{r.customer_number ?? '—'}</td>
                        <td className="p-2 text-right font-medium">{formatCurrency(r.amount)}</td>
                        <td className="p-2">{PAYMENT_MODE_LABELS[r.payment_mode] ?? r.payment_mode}</td>
                        <td className="p-2 text-gray-500">{r.notes ?? '—'}</td>
                        <td className="p-2"><StatusBadge status={r.status} /></td>
                        <td className="p-2 text-gray-400 whitespace-nowrap">{formatDateTime(r.submitted_at)}</td>
                        <td className="p-2">{r.profiles?.name ?? 'Staff'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Party Payments */}
          <Section title={`Payments (Module G) — ${filtered(data.partyPayments).length} entries`}>
            {filtered(data.partyPayments).length === 0 ? <Empty /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse min-w-[500px]">
                  <thead><tr className="bg-gray-50 text-left">
                    <th className="p-2 font-medium">Party</th>
                    <th className="p-2 font-medium text-right">Amount</th>
                    <th className="p-2 font-medium">Payment Mode</th>
                    <th className="p-2 font-medium">Notes</th>
                    <th className="p-2 font-medium">Status</th>
                    <th className="p-2 font-medium">Time</th>
                    <th className="p-2 font-medium">By</th>
                  </tr></thead>
                  <tbody>
                    {filtered(data.partyPayments).map((p: any) => (
                      <tr key={p.id} className="border-t border-gray-100">
                        <td className="p-2">{p.party_name}</td>
                        <td className="p-2 text-right font-medium">{formatCurrency(p.amount)}</td>
                        <td className="p-2">{p.payment_mode === 'bank_transfer' ? 'Bank Transfer' : 'Cash'}</td>
                        <td className="p-2 text-gray-500">{p.notes ?? '—'}</td>
                        <td className="p-2"><StatusBadge status={p.status} /></td>
                        <td className="p-2 text-gray-400 whitespace-nowrap">{formatDateTime(p.submitted_at)}</td>
                        <td className="p-2">{p.profiles?.name ?? 'Staff'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Expenses */}
          <Section title={`Expenses (Module C) — ${filtered(data.expenses).length} entries`}>
            {filtered(data.expenses).length === 0 ? <Empty /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse min-w-[500px]">
                  <thead><tr className="bg-gray-50 text-left">
                    <th className="p-2 font-medium">Description</th>
                    <th className="p-2 font-medium text-right">Amount</th>
                    <th className="p-2 font-medium">Payment Type</th>
                    <th className="p-2 font-medium">Notes</th>
                    <th className="p-2 font-medium">Status</th>
                    <th className="p-2 font-medium">Time</th>
                    <th className="p-2 font-medium">By</th>
                  </tr></thead>
                  <tbody>
                    {filtered(data.expenses).map((e: any) => (
                      <tr key={e.id} className="border-t border-gray-100">
                        <td className="p-2">{e.description}</td>
                        <td className="p-2 text-right font-medium">{formatCurrency(e.amount)}</td>
                        <td className="p-2">{e.payment_type === 'bank_transfer' ? 'Bank Transfer' : 'Cash'}</td>
                        <td className="p-2 text-gray-500">{e.notes ?? '—'}</td>
                        <td className="p-2"><StatusBadge status={e.status} /></td>
                        <td className="p-2 text-gray-400 whitespace-nowrap">{formatDateTime(e.submitted_at)}</td>
                        <td className="p-2">{e.profiles?.name ?? 'Staff'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="bg-amber-600 px-5 py-2.5">
        <h3 className="text-white font-semibold text-sm">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function Empty() {
  return <p className="text-sm text-gray-400 text-center py-4">No entries found.</p>
}
