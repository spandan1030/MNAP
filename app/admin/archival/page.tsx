'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDateTime, PAYMENT_MODE_LABELS } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/StatusBadge'

function receiptSettlementLabel(r: any): string {
  const metalTotal = (r.old_gold_amount ?? 0) + (r.old_silver_amount ?? 0)
  if (metalTotal <= 0) return PAYMENT_MODE_LABELS[r.payment_mode] ?? r.payment_mode
  const cashPortion = r.amount - metalTotal
  const parts: string[] = []
  if ((r.old_gold_amount ?? 0) > 0) parts.push('Old Gold')
  if ((r.old_silver_amount ?? 0) > 0) parts.push('Old Silver')
  if (cashPortion > 0.005) parts.unshift(PAYMENT_MODE_LABELS[r.payment_mode] ?? r.payment_mode)
  return parts.join(' + ')
}

function printLandscape() {
  const id = '__archival_print_style__'
  let el = document.getElementById(id) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = id
    el.textContent = '@page { size: A4 landscape !important; margin: 10mm; }'
    document.head.appendChild(el)
  }
  window.print()
  setTimeout(() => document.getElementById(id)?.remove(), 1000)
}

export default function ArchivalPage() {
  const supabase = createClient()
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [statusFilter, setStatusFilter] = useState('all')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [sharing, setSharing] = useState(false)

  useEffect(() => { loadData() }, [date])

  async function loadData() {
    setLoading(true)
    setData(null)

    const byDate = (table: string, sel: string) =>
      supabase.from(table).select(sel).eq('day_sessions.date', date).order('submitted_at')

    const [sessionRes, bills, receipts, expenses, ogPurchases, drReceipts, partyPayments, approvalSales] = await Promise.all([
      supabase.from('day_sessions').select('id').eq('date', date).single(),
      byDate('sales_bills', '*, sales_line_items(*), sales_payments(*), profiles!submitted_by(name), day_sessions!inner(id)'),
      byDate('money_receipts', '*, profiles!submitted_by(name), day_sessions!inner(id)'),
      byDate('expenses', '*, profiles!submitted_by(name), day_sessions!inner(id)'),
      byDate('old_gold_purchases', '*, profiles!submitted_by(name), day_sessions!inner(id)'),
      byDate('direct_receipts', '*, profiles!submitted_by(name), day_sessions!inner(id)'),
      byDate('party_payments', '*, profiles!submitted_by(name), day_sessions!inner(id)'),
      byDate('approval_sales', '*, approval_sale_items(*), profiles!submitted_by(name), day_sessions!inner(id)'),
    ])

    if (!sessionRes.data) { setLoading(false); return }

    setData({
      bills: bills.data ?? [],
      receipts: receipts.data ?? [],
      expenses: expenses.data ?? [],
      ogPurchases: ogPurchases.data ?? [],
      drReceipts: drReceipts.data ?? [],
      partyPayments: partyPayments.data ?? [],
      approvalSales: approvalSales.data ?? [],
    })
    setLoading(false)
  }

  function filtered(arr: any[]) {
    if (statusFilter === 'all') return arr
    return arr.filter(e => e.status === statusFilter)
  }

  const totalCount = data
    ? filtered(data.bills).length + filtered(data.receipts).length + filtered(data.expenses).length +
      filtered(data.ogPurchases).length + filtered(data.drReceipts).length + filtered(data.partyPayments).length +
      filtered(data.approvalSales).length
    : 0

  async function sharePDF() {
    if (!data) return
    setSharing(true)
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    let y = 14

    doc.setFontSize(13); doc.setFont('helvetica', 'bold')
    doc.text(`M N Alankar Palace — Archival: ${date}`, 14, y); y += 8
    doc.setFontSize(8); doc.setFont('helvetica', 'normal')
    doc.setTextColor(120, 120, 120)
    doc.text(`Status: ${statusFilter} | ${totalCount} entries`, 14, y)
    doc.setTextColor(0, 0, 0); y += 6

    const hdr = (text: string) => {
      doc.setFontSize(9); doc.setFont('helvetica', 'bold')
      doc.setFillColor(245, 158, 11); doc.rect(14, y, 182, 6, 'F')
      doc.setTextColor(255, 255, 255); doc.text(text, 16, y + 4.2)
      doc.setTextColor(0, 0, 0); y += 7
    }

    const bills = filtered(data.bills)
    if (bills.length > 0) {
      hdr(`Sales Bills — ${bills.length} entries`)
      autoTable(doc, {
        startY: y,
        head: [['Bill #', 'Customer', 'Total', 'Old Metal', 'Payments', 'Status']],
        body: bills.map((b: any) => [
          b.bill_number, b.customer_name, formatCurrency(b.total_amount),
          [(b.old_gold_amount ?? 0) > 0 ? `Gold: ${formatCurrency(b.old_gold_amount)}` : '', (b.old_silver_amount ?? 0) > 0 ? `Silver: ${formatCurrency(b.old_silver_amount)}` : ''].filter(Boolean).join(' / ') || '—',
          (b.sales_payments ?? []).map((p: any) => `${PAYMENT_MODE_LABELS[p.payment_mode] ?? p.payment_mode}: ${formatCurrency(p.amount)}`).join(' | '),
          b.status,
        ]),
        styles: { fontSize: 7 }, margin: { left: 14, right: 14 },
      })
      y = (doc as any).lastAutoTable.finalY + 5
    }

    const receipts = filtered(data.receipts)
    if (receipts.length > 0) {
      hdr(`Money Receipts — ${receipts.length} entries`)
      autoTable(doc, {
        startY: y,
        head: [['Type', 'Serial', 'Customer', 'Amount', 'Settlement', 'Status']],
        body: receipts.map((r: any) => [
          r.receipt_type.replace('_', ' '), r.serial_number ?? '—', r.customer_name,
          formatCurrency(r.amount), receiptSettlementLabel(r), r.status,
        ]),
        styles: { fontSize: 7 }, margin: { left: 14, right: 14 },
      })
      y = (doc as any).lastAutoTable.finalY + 5
    }

    const expenses = filtered(data.expenses)
    if (expenses.length > 0) {
      hdr(`Expenses — ${expenses.length} entries`)
      autoTable(doc, {
        startY: y,
        head: [['Description', 'Payment', 'Amount', 'Status']],
        body: expenses.map((e: any) => [e.description, e.payment_type.replace('_', ' '), formatCurrency(e.amount), e.status]),
        styles: { fontSize: 7 }, margin: { left: 14, right: 14 },
      })
      y = (doc as any).lastAutoTable.finalY + 5
    }

    const ogPurchases = filtered(data.ogPurchases)
    if (ogPurchases.length > 0) {
      hdr(`Old Metal Purchases — ${ogPurchases.length} entries`)
      autoTable(doc, {
        startY: y,
        head: [['Customer', 'Metal', 'Purity', 'Weight', 'Amount', 'Payment', 'Status']],
        body: ogPurchases.map((p: any) => [
          p.customer_name ?? '—', p.metal_type, p.purity ?? '—',
          p.weight ? `${p.weight}g` : '—', formatCurrency(p.total_amount),
          PAYMENT_MODE_LABELS[p.payment_mode] ?? p.payment_mode, p.status,
        ]),
        styles: { fontSize: 7 }, margin: { left: 14, right: 14 },
      })
      y = (doc as any).lastAutoTable.finalY + 5
    }

    const drReceipts = filtered(data.drReceipts)
    if (drReceipts.length > 0) {
      hdr(`Direct Receipts — ${drReceipts.length} entries`)
      autoTable(doc, {
        startY: y,
        head: [['Customer', 'Ref', 'Amount', 'Payment', 'Status']],
        body: drReceipts.map((r: any) => [
          r.customer_name, r.customer_number ?? '—', formatCurrency(r.amount),
          PAYMENT_MODE_LABELS[r.payment_mode] ?? r.payment_mode, r.status,
        ]),
        styles: { fontSize: 7 }, margin: { left: 14, right: 14 },
      })
      y = (doc as any).lastAutoTable.finalY + 5
    }

    const partyPayments = filtered(data.partyPayments)
    if (partyPayments.length > 0) {
      hdr(`Party Payments — ${partyPayments.length} entries`)
      autoTable(doc, {
        startY: y,
        head: [['Party', 'Amount', 'Payment', 'Status']],
        body: partyPayments.map((p: any) => [
          p.party_name, formatCurrency(p.amount),
          PAYMENT_MODE_LABELS[p.payment_mode] ?? p.payment_mode, p.status,
        ]),
        styles: { fontSize: 7 }, margin: { left: 14, right: 14 },
      })
      y = (doc as any).lastAutoTable.finalY + 5
    }

    const approvalSales = filtered(data.approvalSales)
    if (approvalSales.length > 0) {
      hdr(`Approval / Party Sales — ${approvalSales.length} entries`)
      autoTable(doc, {
        startY: y,
        head: [['Party', 'Type', 'Items', 'Status']],
        body: approvalSales.map((a: any) => [
          a.party_name, a.transaction_type,
          (a.approval_sale_items ?? []).map((i: any) => `${i.item_name} (${i.metal_type})`).join(', ') || '—',
          a.status,
        ]),
        styles: { fontSize: 7 }, margin: { left: 14, right: 14 },
      })
    }

    const filename = `MNAP_Archival_${date}.pdf`
    const blob = doc.output('blob')
    const file = new File([blob], filename, { type: 'application/pdf' })
    if (typeof navigator !== 'undefined' && (navigator as any).canShare?.({ files: [file] })) {
      await (navigator as any).share({ files: [file], title: `MNAP Archival ${date}` })
    } else {
      doc.save(filename)
      window.open('https://web.whatsapp.com', '_blank')
    }
    setSharing(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3 no-print">
        <h1 className="text-2xl font-bold text-gray-900">Archival — All Entries</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
          <div className="flex gap-1 flex-wrap">
            {['all', 'pending', 'approved', 'rejected'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors ${statusFilter === s ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {s}
              </button>
            ))}
          </div>
          {data && (
            <>
              <button onClick={sharePDF} disabled={sharing}
                className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
                {sharing ? 'Preparing…' : '💬 WhatsApp'}
              </button>
              <button onClick={printLandscape}
                className="bg-gray-700 hover:bg-gray-800 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
                ⎙ Print
              </button>
            </>
          )}
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
                <table className="w-full text-xs border-collapse min-w-[900px]">
                  <thead><tr className="bg-gray-50 text-left">
                    <th className="p-2 font-medium">Type</th>
                    <th className="p-2 font-medium">Serial No.</th>
                    <th className="p-2 font-medium">Customer</th>
                    <th className="p-2 font-medium">Repair Type</th>
                    <th className="p-2 font-medium">Weight</th>
                    <th className="p-2 font-medium text-right">Amount</th>
                    <th className="p-2 font-medium">Old Metal</th>
                    <th className="p-2 font-medium">Settlement</th>
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
                        <td className="p-2">
                          {(r.old_gold_weight ?? 0) > 0 && <div>Gold: {r.old_gold_weight}g / {formatCurrency(r.old_gold_amount)}</div>}
                          {(r.old_silver_weight ?? 0) > 0 && <div>Silver: {r.old_silver_weight}g / {formatCurrency(r.old_silver_amount)}</div>}
                          {!((r.old_gold_weight ?? 0) > 0) && !((r.old_silver_weight ?? 0) > 0) && '—'}
                        </td>
                        <td className="p-2">{receiptSettlementLabel(r)}</td>
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
          <Section title={`Old Metal Purchases (Module E) — ${filtered(data.ogPurchases).length} entries`}>
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

          {/* Approval / Other Party Sales */}
          <Section title={`Approval / Other Party Sales (Module H) — ${filtered(data.approvalSales).length} entries`}>
            {filtered(data.approvalSales).length === 0 ? <Empty /> : (
              <div className="space-y-3">
                {filtered(data.approvalSales).map((s: any) => (
                  <div key={s.id} className="border border-gray-100 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase text-amber-700">{s.transaction_type === 'sale' ? 'Party Sale' : 'Approval'}</span>
                        <span className="text-sm font-medium text-gray-900">{s.party_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={s.status} />
                        <span className="text-xs text-gray-400">{formatDateTime(s.submitted_at)}</span>
                        <span className="text-xs text-gray-500">{s.profiles?.name ?? 'Staff'}</span>
                      </div>
                    </div>
                    <table className="w-full text-xs border-collapse">
                      <thead><tr className="bg-gray-50 text-left">
                        <th className="p-1.5 font-medium">Item</th>
                        <th className="p-1.5 font-medium">Metal</th>
                        <th className="p-1.5 font-medium">Purity</th>
                        <th className="p-1.5 font-medium">Party</th>
                        <th className="p-1.5 font-medium text-right">Weight</th>
                        <th className="p-1.5 font-medium">Notes</th>
                      </tr></thead>
                      <tbody>
                        {(s.approval_sale_items ?? []).map((l: any) => (
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
                ))}
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
