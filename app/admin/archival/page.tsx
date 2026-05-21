'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDateTime, PAYMENT_MODE_LABELS } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/StatusBadge'

function adjSerial(mode: string, serial: string | null | undefined): string {
  if ((mode === 'advance_adjustment' || mode === 'sip_adjustment') && serial) return ` (${serial})`
  if ((mode === 'advance_adjustment' || mode === 'sip_adjustment') && !serial) return ' (—)'
  return ''
}

function receiptSettlementLabel(r: any): string {
  const childPayments: any[] = r.money_receipt_payments ?? []
  const parts: string[] = []
  if ((r.old_gold_amount ?? 0) > 0) parts.push('Old Gold')
  if ((r.old_silver_amount ?? 0) > 0) parts.push('Old Silver')
  if (childPayments.length > 0) {
    for (const p of childPayments) {
      parts.unshift((PAYMENT_MODE_LABELS[p.payment_mode] ?? p.payment_mode) + adjSerial(p.payment_mode, p.reference_serial))
    }
  } else if (r.payment_mode) {
    const cashPortion = r.amount - (r.old_gold_amount ?? 0) - (r.old_silver_amount ?? 0)
    if (cashPortion > 0.005 || parts.length === 0) parts.unshift((PAYMENT_MODE_LABELS[r.payment_mode] ?? r.payment_mode) + adjSerial(r.payment_mode, r.reference_serial))
  }
  return parts.join(' + ') || '—'
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
  const [statusFilter, setStatusFilter] = useState('approved')
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
      byDate('money_receipts', '*, money_receipt_payments(*), profiles!submitted_by(name), day_sessions!inner(id)'),
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

    // Landscape A4: 297 x 210 mm, printable width = 297 - 14 - 14 = 269
    const doc = new jsPDF({ orientation: 'landscape' })
    let y = 14

    // PDF-safe helpers — jsPDF standard fonts only support Latin-1
    // Rs. instead of ₹ (U+20B9), hyphen instead of em dash (U+2014)
    const pdfAmt = (n: number) =>
      'Rs.' + (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const safe = (s: any): string =>
      String(s ?? '-').replace(/—/g, '-').replace(/[₹₹]/g, 'Rs.')
    const adjPdf = (mode: string, serial: string | null | undefined): string => {
      if ((mode === 'advance_adjustment' || mode === 'sip_adjustment') && serial) return ` (${serial})`
      if ((mode === 'advance_adjustment' || mode === 'sip_adjustment') && !serial) return ' (-)'
      return ''
    }
    const settlementPdf = (r: any): string => {
      const childPayments: any[] = r.money_receipt_payments ?? []
      const parts: string[] = []
      if ((r.old_gold_amount ?? 0) > 0) parts.push('Old Gold')
      if ((r.old_silver_amount ?? 0) > 0) parts.push('Old Silver')
      if (childPayments.length > 0) {
        for (const p of childPayments) {
          parts.unshift((PAYMENT_MODE_LABELS[p.payment_mode] ?? p.payment_mode) + adjPdf(p.payment_mode, p.reference_serial))
        }
      } else if (r.payment_mode) {
        const cashPortion = r.amount - (r.old_gold_amount ?? 0) - (r.old_silver_amount ?? 0)
        if (cashPortion > 0.005 || parts.length === 0) parts.unshift((PAYMENT_MODE_LABELS[r.payment_mode] ?? r.payment_mode) + adjPdf(r.payment_mode, r.reference_serial))
      }
      return parts.join(' + ') || '-'
    }

    doc.setFontSize(13); doc.setFont('helvetica', 'bold')
    doc.text(`M N Alankar Palace - Archival: ${date}`, 14, y); y += 8
    doc.setFontSize(8); doc.setFont('helvetica', 'normal')
    doc.setTextColor(120, 120, 120)
    doc.text(`Status: ${statusFilter} | ${totalCount} entries`, 14, y)
    doc.setTextColor(0, 0, 0); y += 6

    const hdr = (text: string) => {
      doc.setFontSize(9); doc.setFont('helvetica', 'bold')
      doc.setFillColor(245, 158, 11); doc.rect(14, y, 269, 6, 'F')
      doc.setTextColor(255, 255, 255); doc.text(text, 16, y + 4.2)
      doc.setTextColor(0, 0, 0); y += 7
    }

    const tbl = (startY: number, head: string[][], body: any[][], opts: any = {}) => {
      autoTable(doc, {
        startY, head, body,
        styles: { fontSize: 7 },
        headStyles: { fillColor: [251, 191, 36] },
        margin: { left: 14, right: 14 },
        ...opts,
      })
      return (doc as any).lastAutoTable.finalY + 5
    }

    const bills = filtered(data.bills)
    if (bills.length > 0) {
      hdr(`Sales Bills - ${bills.length} entries`)
      const orderInBillSet = new Set<number>()
      const billsBody = bills.map((b: any, idx: number) => {
        const hasOI = (b.sales_line_items ?? []).some((l: any) => l.order_in)
        if (hasOI) orderInBillSet.add(idx)
        return [
          safe(b.bill_number) + (hasOI ? ' *' : ''),
          safe(b.customer_name),
          pdfAmt(b.total_amount),
          (b.old_gold_amount ?? 0) > 0 ? `${b.old_gold_weight ?? ''}g / ${pdfAmt(b.old_gold_amount)}` : '-',
          (b.old_silver_amount ?? 0) > 0 ? `${b.old_silver_weight ?? ''}g / ${pdfAmt(b.old_silver_amount)}` : '-',
          (b.sales_payments ?? []).map((p: any) =>
            `${PAYMENT_MODE_LABELS[p.payment_mode] ?? p.payment_mode}${adjPdf(p.payment_mode, p.reference_serial)}: ${pdfAmt(p.amount)}`
          ).join(' | ') || '-',
          safe(b.status),
        ]
      })
      y = tbl(y,
        [['Bill #', 'Customer', 'Total', 'Old Gold', 'Old Silver', 'Payments', 'Status']],
        billsBody,
        orderInBillSet.size > 0 ? {
          didParseCell: (d: any) => {
            if (d.section === 'body' && orderInBillSet.has(d.row.index)) {
              d.cell.styles.fillColor = [219, 234, 254]  // sky-200
              d.cell.styles.fontStyle = 'bold'
            }
          },
        } : {}
      )
    }

    if (y > 170) { doc.addPage(); y = 14 }
    const receipts = filtered(data.receipts)
    if (receipts.length > 0) {
      hdr(`Money Receipts - ${receipts.length} entries`)
      y = tbl(y,
        [['Type', 'Serial', 'Customer', 'Amount', 'Payment', 'Notes', 'Status']],
        receipts.map((r: any) => {
          const childPayments: any[] = r.money_receipt_payments ?? []
          const parts: string[] = []
          if (childPayments.length > 0) {
            for (const p of childPayments) {
              parts.push(`${PAYMENT_MODE_LABELS[p.payment_mode] ?? p.payment_mode}${adjPdf(p.payment_mode, p.reference_serial)}: ${pdfAmt(p.amount)}`)
            }
          } else if (r.payment_mode) {
            const netCash = r.amount - (r.old_gold_amount ?? 0) - (r.old_silver_amount ?? 0)
            if (netCash > 0.005) parts.push(`${PAYMENT_MODE_LABELS[r.payment_mode] ?? r.payment_mode}${adjPdf(r.payment_mode, r.reference_serial)}: ${pdfAmt(netCash)}`)
          }
          if ((r.old_gold_amount ?? 0) > 0)
            parts.push(`Old Gold${r.old_gold_weight ? ` ${r.old_gold_weight}g` : ''}: ${pdfAmt(r.old_gold_amount)}`)
          if ((r.old_silver_amount ?? 0) > 0)
            parts.push(`Old Silver${r.old_silver_weight ? ` ${r.old_silver_weight}g` : ''}: ${pdfAmt(r.old_silver_amount)}`)
          return [
            safe(r.receipt_type.replace('_', ' ')),
            safe(r.serial_number),
            safe(r.customer_name),
            pdfAmt(r.amount),
            parts.join('\n') || '-',
            safe(r.notes),
            safe(r.status),
          ]
        })
      )
    }

    if (y > 170) { doc.addPage(); y = 14 }
    const expenses = filtered(data.expenses)
    if (expenses.length > 0) {
      hdr(`Expenses - ${expenses.length} entries`)
      y = tbl(y,
        [['Description', 'Payment', 'Amount', 'Notes', 'Status']],
        expenses.map((e: any) => [
          safe(e.description),
          safe(e.payment_type.replace('_', ' ')),
          pdfAmt(e.amount),
          safe(e.notes),
          safe(e.status),
        ])
      )
    }

    if (y > 170) { doc.addPage(); y = 14 }
    const ogPurchases = filtered(data.ogPurchases)
    if (ogPurchases.length > 0) {
      hdr(`Old Metal Purchases - ${ogPurchases.length} entries`)
      y = tbl(y,
        [['Customer', 'Phone', 'Metal', 'Purity', 'Weight', 'Rate/g', 'Amount', 'Payment', 'Status']],
        ogPurchases.map((p: any) => [
          safe(p.customer_name),
          safe(p.customer_phone),
          safe(p.metal_type),
          safe(p.purity),
          p.weight ? `${p.weight}g` : '-',
          p.rate_per_gram ? `Rs.${p.rate_per_gram}` : '-',
          pdfAmt(p.total_amount),
          p.payment_mode === 'bank_transfer' ? 'Bank Transfer' : 'Cash',
          safe(p.status),
        ])
      )
    }

    if (y > 170) { doc.addPage(); y = 14 }
    const drReceipts = filtered(data.drReceipts)
    if (drReceipts.length > 0) {
      hdr(`Direct Cash Receipts - ${drReceipts.length} entries`)
      y = tbl(y,
        [['Customer', 'Ref', 'Amount', 'Payment', 'Notes', 'Status']],
        drReceipts.map((r: any) => [
          safe(r.customer_name),
          safe(r.customer_number),
          pdfAmt(r.amount),
          safe(PAYMENT_MODE_LABELS[r.payment_mode] ?? r.payment_mode),
          safe(r.notes),
          safe(r.status),
        ])
      )
    }

    if (y > 170) { doc.addPage(); y = 14 }
    const partyPayments = filtered(data.partyPayments)
    if (partyPayments.length > 0) {
      hdr(`Party Payments - ${partyPayments.length} entries`)
      y = tbl(y,
        [['Party', 'Amount', 'Payment', 'Notes', 'Status']],
        partyPayments.map((p: any) => [
          safe(p.party_name),
          pdfAmt(p.amount),
          p.payment_mode === 'bank_transfer' ? 'Bank Transfer' : 'Cash',
          safe(p.notes),
          safe(p.status),
        ])
      )
    }

    if (y > 170) { doc.addPage(); y = 14 }
    const approvalSales = filtered(data.approvalSales)
    if (approvalSales.length > 0) {
      hdr(`Approval / Party Sales - ${approvalSales.length} entries`)
      tbl(y,
        [['Party', 'Type', 'Items', 'Status']],
        approvalSales.map((a: any) => [
          safe(a.party_name),
          safe(a.transaction_type),
          (a.approval_sale_items ?? []).map((i: any) =>
            `${safe(i.item_name)} (${safe(i.metal_type)}${i.purity ? ' ' + i.purity : ''})`
          ).join(', ') || '-',
          safe(a.status),
        ])
      )
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
          <div className="flex items-center gap-1">
            <button
              onClick={() => setDate(d => { const dt = new Date(d); dt.setDate(dt.getDate() - 1); return dt.toISOString().split('T')[0] })}
              className="px-2 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 text-sm leading-none">‹</button>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
            <button
              onClick={() => setDate(d => { const dt = new Date(d); dt.setDate(dt.getDate() + 1); return dt.toISOString().split('T')[0] })}
              disabled={date >= new Date().toISOString().split('T')[0]}
              className="px-2 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-sm leading-none">›</button>
          </div>
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
                              {l.order_in && (
                                <span className="ml-1.5 text-[10px] font-semibold text-sky-700 bg-sky-200 border border-sky-300 px-1.5 py-0.5 rounded-full">Order In</span>
                              )}
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
                            <div key={p.id}>
                              {PAYMENT_MODE_LABELS[p.payment_mode] ?? p.payment_mode}{adjSerial(p.payment_mode, p.reference_serial)}: {formatCurrency(p.amount)}
                            </div>
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
                    <th className="p-2 font-medium">Payment</th>
                    <th className="p-2 font-medium">Notes</th>
                    <th className="p-2 font-medium">Status</th>
                    <th className="p-2 font-medium">Time</th>
                    <th className="p-2 font-medium">By</th>
                  </tr></thead>
                  <tbody>
                    {filtered(data.receipts).map((r: any) => {
                      const childPayments: any[] = r.money_receipt_payments ?? []
                      return (
                        <tr key={r.id} className="border-t border-gray-100">
                          <td className="p-2 capitalize">{r.receipt_type.replace('_', ' ')}</td>
                          <td className="p-2">{r.serial_number ?? '—'}</td>
                          <td className="p-2">{r.customer_name}</td>
                          <td className="p-2">{r.repair_type ?? '—'}</td>
                          <td className="p-2">{r.weight ? `${r.weight}g` : '—'}</td>
                          <td className="p-2 text-right font-medium">{formatCurrency(r.amount)}</td>
                          <td className="p-2">
                            {childPayments.length > 0 ? (
                              childPayments.map((p: any) => (
                                <div key={p.id}>{PAYMENT_MODE_LABELS[p.payment_mode] ?? p.payment_mode}{adjSerial(p.payment_mode, p.reference_serial)}: {formatCurrency(p.amount)}</div>
                              ))
                            ) : r.payment_mode ? (() => {
                              const netCash = r.amount - (r.old_gold_amount ?? 0) - (r.old_silver_amount ?? 0)
                              return netCash > 0.005 ? <div>{PAYMENT_MODE_LABELS[r.payment_mode] ?? r.payment_mode}{adjSerial(r.payment_mode, r.reference_serial)}: {formatCurrency(netCash)}</div> : null
                            })() : null}
                            {(r.old_gold_amount ?? 0) > 0 && (
                              <div>Old Gold{r.old_gold_weight ? ` ${r.old_gold_weight}g` : ''}: {formatCurrency(r.old_gold_amount)}</div>
                            )}
                            {(r.old_silver_amount ?? 0) > 0 && (
                              <div>Old Silver{r.old_silver_weight ? ` ${r.old_silver_weight}g` : ''}: {formatCurrency(r.old_silver_amount)}</div>
                            )}
                          </td>
                          <td className="p-2 text-gray-500">{r.notes ?? '—'}</td>
                          <td className="p-2"><StatusBadge status={r.status} /></td>
                          <td className="p-2 text-gray-400 whitespace-nowrap">{formatDateTime(r.submitted_at)}</td>
                          <td className="p-2">{r.profiles?.name ?? 'Staff'}</td>
                        </tr>
                      )
                    })}
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

          {/* Direct Cash Receipts */}
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
