'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, PAYMENT_MODE_LABELS } from '@/lib/utils'

export default function ReportsPage() {
  const supabase = createClient()
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0])
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  async function loadReport() {
    setLoading(true)
    setData(null)

    const { data: session } = await supabase.from('day_sessions').select('*').eq('date', reportDate).single()
    if (!session) { setLoading(false); return }

    const [billsRes, receiptsRes, expensesRes, ogRes, drRes] = await Promise.all([
      supabase.from('sales_bills').select('*, sales_line_items(*), sales_payments(*)').eq('day_session_id', session.id).eq('status', 'approved'),
      supabase.from('money_receipts').select('*').eq('day_session_id', session.id).eq('status', 'approved'),
      supabase.from('expenses').select('*').eq('day_session_id', session.id).eq('status', 'approved'),
      supabase.from('old_gold_purchases').select('*').eq('day_session_id', session.id).eq('status', 'approved'),
      supabase.from('direct_receipts').select('*').eq('day_session_id', session.id).eq('status', 'approved'),
    ])

    const bills = billsRes.data ?? []
    const receipts = receiptsRes.data ?? []
    const expenses = expensesRes.data ?? []
    const oldGoldPurchases = ogRes.data ?? []
    const directReceipts = drRes.data ?? []

    const goldBills = bills.filter((b: any) => b.metal_type === 'gold')
    const silverBills = bills.filter((b: any) => b.metal_type === 'silver')
    const otherBills = bills.filter((b: any) => b.metal_type === 'other')

    const sumWeight = (bs: any[]) => bs.flatMap((b: any) => b.sales_line_items ?? []).reduce((s: number, l: any) => s + (l.weight ?? 0), 0)
    const sumAmount = (bs: any[]) => bs.reduce((s: number, b: any) => s + b.total_amount, 0)
    const sumPayments = (bs: any[], mode: string) =>
      bs.flatMap((b: any) => b.sales_payments ?? []).filter((p: any) => p.payment_mode === mode).reduce((s: number, p: any) => s + p.amount, 0)

    const opening = (session.register_a_opening ?? 0) + (session.register_b_opening ?? 0)
    const allPayments = bills.flatMap((b: any) => b.sales_payments ?? [])
    const cashSales = allPayments.filter((p: any) => p.payment_mode === 'cash').reduce((s: number, p: any) => s + p.amount, 0)
    const cashReceipts = receipts.filter((r: any) => r.payment_mode === 'cash').reduce((s: number, r: any) => s + r.amount, 0)
    const cashExpenses = expenses.filter((e: any) => e.payment_type === 'cash').reduce((s: number, e: any) => s + e.amount, 0)
    const cashOldGoldOut = oldGoldPurchases.filter((p: any) => p.payment_mode === 'cash').reduce((s: number, p: any) => s + p.total_amount, 0)
    const cashDirectIn = directReceipts.filter((r: any) => r.payment_mode === 'cash').reduce((s: number, r: any) => s + r.amount, 0)
    const expectedCash = opening + cashSales + cashReceipts + cashDirectIn - cashExpenses - cashOldGoldOut
    const actualClosing = (session.register_a_closing ?? 0) + (session.register_b_closing ?? 0)

    setData({
      session, bills, receipts, expenses, oldGoldPurchases, directReceipts,
      goldWeight: sumWeight(goldBills), goldAmount: sumAmount(goldBills),
      silverWeight: sumWeight(silverBills), silverAmount: sumAmount(silverBills),
      otherCount: otherBills.length, otherAmount: sumAmount(otherBills),
      oldGoldWeight: bills.reduce((s: number, b: any) => s + (b.old_gold_weight ?? 0), 0),
      oldGoldAmount: bills.reduce((s: number, b: any) => s + (b.old_gold_amount ?? 0), 0),
      oldSilverWeight: bills.reduce((s: number, b: any) => s + (b.old_silver_weight ?? 0), 0),
      oldSilverAmount: bills.reduce((s: number, b: any) => s + (b.old_silver_amount ?? 0), 0),
      paymentCash: sumPayments(bills, 'cash'),
      paymentCard: sumPayments(bills, 'card'),
      paymentUPI: sumPayments(bills, 'upi'),
      paymentPhonePe: sumPayments(bills, 'phonepe'),
      paymentCheque: sumPayments(bills, 'cheque'),
      paymentCredit: sumPayments(bills, 'customer_credit'),
      paymentAdvance: sumPayments(bills, 'advance_adjustment'),
      paymentSIP: sumPayments(bills, 'sip_adjustment'),
      totalAdvanceReceipts: receipts.filter((r: any) => r.receipt_type === 'advance').reduce((s: number, r: any) => s + r.amount, 0),
      totalSIPReceipts: receipts.filter((r: any) => r.receipt_type === 'sip').reduce((s: number, r: any) => s + r.amount, 0),
      totalCreditReceipts: receipts.filter((r: any) => r.receipt_type === 'customer_credit').reduce((s: number, r: any) => s + r.amount, 0),
      totalRepairReceipts: receipts.filter((r: any) => r.receipt_type === 'repair').reduce((s: number, r: any) => s + r.amount, 0),
      totalExpenses: expenses.reduce((s: number, e: any) => s + e.amount, 0),
      totalOldGoldPurchases: oldGoldPurchases.reduce((s: number, p: any) => s + p.total_amount, 0),
      totalDirectReceipts: directReceipts.reduce((s: number, r: any) => s + r.amount, 0),
      cashSales, cashReceipts, cashExpenses, cashOldGoldOut, cashDirectIn,
      opening, expectedCash, actualClosing,
      variance: actualClosing - expectedCash,
    })
    setLoading(false)
  }

  useEffect(() => { loadReport() }, [reportDate])

  async function exportPDF() {
    if (!data) return
    setExporting(true)
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')

    const doc = new jsPDF()
    const date = formatDate(reportDate)
    let y = 15

    const heading = (text: string) => {
      doc.setFontSize(11); doc.setFont('helvetica', 'bold')
      doc.setFillColor(245, 158, 11); doc.rect(14, y, 182, 7, 'F')
      doc.setTextColor(255, 255, 255); doc.text(text, 16, y + 5)
      doc.setTextColor(0, 0, 0); y += 10
    }

    const noRecords = (msg: string) => {
      doc.setFontSize(8); doc.setFont('helvetica', 'normal')
      doc.text(msg, 14, y); y += 8
    }

    doc.setFontSize(16); doc.setFont('helvetica', 'bold')
    doc.text('M N Alankar Palace', 105, y, { align: 'center' }); y += 7
    doc.setFontSize(10); doc.setFont('helvetica', 'normal')
    doc.text(`End-of-Day Report — ${date}`, 105, y, { align: 'center' }); y += 10

    // Section 1 — Sales Register
    heading('Section 1 — Sales Register')
    const salesRows = data.bills.flatMap((b: any) =>
      (b.sales_line_items ?? []).map((l: any) => [
        b.customer_name, l.item_name, b.metal_type, b.purity ?? '—',
        l.weight ? `${l.weight}g` : '—', `₹${l.amount.toFixed(2)}`,
        b.old_gold_weight ? `${b.old_gold_weight}g` : '—',
        b.old_silver_weight ? `${b.old_silver_weight}g` : '—',
      ])
    )
    if (salesRows.length > 0) {
      autoTable(doc, {
        startY: y, head: [['Customer', 'Item', 'Metal', 'Purity', 'Weight', 'Amount', 'Old Gold', 'Old Silver']],
        body: salesRows, styles: { fontSize: 7 }, headStyles: { fillColor: [251, 191, 36] }, margin: { left: 14, right: 14 },
      })
      y = (doc as any).lastAutoTable.finalY + 8
    } else { noRecords('No sales today.') }

    if (y > 250) { doc.addPage(); y = 15 }

    // Section 2 — Sales Summary
    heading('Section 2 — Sales Summary')
    autoTable(doc, {
      startY: y,
      body: [
        ['Gold / Diamond Weight Sold', `${data.goldWeight.toFixed(3)}g`],
        ['Gold / Diamond Amount', formatCurrency(data.goldAmount)],
        ['Silver Weight Sold', `${data.silverWeight.toFixed(3)}g`],
        ['Silver Amount', formatCurrency(data.silverAmount)],
        ['Other / Misc Items', `${data.otherCount} items — ${formatCurrency(data.otherAmount)}`],
        ['Old Gold Received (from sales)', `${data.oldGoldWeight.toFixed(3)}g — ${formatCurrency(data.oldGoldAmount)}`],
        ['Old Silver Received (from sales)', `${data.oldSilverWeight.toFixed(3)}g — ${formatCurrency(data.oldSilverAmount)}`],
      ],
      styles: { fontSize: 8 }, columnStyles: { 0: { fontStyle: 'bold' } }, margin: { left: 14, right: 14 },
    })
    y = (doc as any).lastAutoTable.finalY + 8

    if (y > 230) { doc.addPage(); y = 15 }

    // Section 3 — Payment Breakdown
    heading('Section 3 — Payment Mode Breakdown (Sales)')
    autoTable(doc, {
      startY: y,
      body: [
        ['Cash', formatCurrency(data.paymentCash)],
        ['Card', formatCurrency(data.paymentCard)],
        ['UPI', formatCurrency(data.paymentUPI)],
        ['PhonePe', formatCurrency(data.paymentPhonePe)],
        ['Cheque', formatCurrency(data.paymentCheque)],
        ['Customer Credit', formatCurrency(data.paymentCredit)],
        ['Advance Adjusted', formatCurrency(data.paymentAdvance)],
        ['SIP Adjusted', formatCurrency(data.paymentSIP)],
      ],
      styles: { fontSize: 8 }, columnStyles: { 0: { fontStyle: 'bold' } }, margin: { left: 14, right: 14 },
    })
    y = (doc as any).lastAutoTable.finalY + 8

    if (y > 220) { doc.addPage(); y = 15 }

    // Section 4 — Money Receipts
    heading('Section 4 — Money Receipts')
    const receiptRows = data.receipts.map((r: any) => [
      r.receipt_type.replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
      r.serial_number ?? '—',
      r.customer_name,
      r.repair_type ?? '—',
      r.payment_mode.toUpperCase(),
      formatCurrency(r.amount),
      r.notes ?? '—',
    ])
    if (receiptRows.length > 0) {
      receiptRows.push(['', '', '', '', 'TOTAL', formatCurrency(data.totalAdvanceReceipts + data.totalSIPReceipts + data.totalCreditReceipts + data.totalRepairReceipts), ''])
      autoTable(doc, {
        startY: y, head: [['Type', 'Serial', 'Customer', 'Repair', 'Mode', 'Amount', 'Notes']],
        body: receiptRows, styles: { fontSize: 7 }, headStyles: { fillColor: [251, 191, 36] }, margin: { left: 14, right: 14 },
      })
      y = (doc as any).lastAutoTable.finalY + 8
    } else { noRecords('No money receipts today.') }

    if (y > 220) { doc.addPage(); y = 15 }

    // Section 5 — Old Gold Purchases
    heading('Section 5 — Old Gold Purchases')
    const ogRows = data.oldGoldPurchases.map((p: any) => [
      p.customer_name, p.customer_phone ?? '—', p.metal_type, p.purity ?? '—',
      `${p.weight}g`, p.rate_per_gram ? `₹${p.rate_per_gram}` : '—',
      formatCurrency(p.total_amount),
      p.payment_mode === 'bank_transfer' ? 'Bank Transfer' : 'Cash',
      p.notes ?? '—',
    ])
    if (ogRows.length > 0) {
      ogRows.push(['', '', '', '', '', 'TOTAL', formatCurrency(data.totalOldGoldPurchases), '', ''])
      autoTable(doc, {
        startY: y, head: [['Customer', 'Phone', 'Metal', 'Purity', 'Weight', 'Rate/g', 'Amount', 'Payment', 'Notes']],
        body: ogRows, styles: { fontSize: 7 }, headStyles: { fillColor: [251, 191, 36] }, margin: { left: 14, right: 14 },
      })
      y = (doc as any).lastAutoTable.finalY + 8
    } else { noRecords('No old gold purchases today.') }

    if (y > 220) { doc.addPage(); y = 15 }

    // Section 6 — Direct Receipts
    heading('Section 6 — Direct Money Receipts')
    const drRows = data.directReceipts.map((r: any) => [
      r.customer_name, r.customer_number ?? '—',
      formatCurrency(r.amount),
      PAYMENT_MODE_LABELS[r.payment_mode] ?? r.payment_mode,
      r.notes ?? '—',
    ])
    if (drRows.length > 0) {
      drRows.push(['', 'TOTAL', formatCurrency(data.totalDirectReceipts), '', ''])
      autoTable(doc, {
        startY: y, head: [['Customer', 'Phone / Ref', 'Amount', 'Payment', 'Notes']],
        body: drRows, styles: { fontSize: 7 }, headStyles: { fillColor: [251, 191, 36] }, margin: { left: 14, right: 14 },
      })
      y = (doc as any).lastAutoTable.finalY + 8
    } else { noRecords('No direct receipts today.') }

    if (y > 220) { doc.addPage(); y = 15 }

    // Section 7 — Expenses
    heading('Section 7 — Expenses')
    const expenseRows = data.expenses.map((e: any) => [
      e.description,
      e.payment_type === 'bank_transfer' ? 'Bank Transfer' : 'Cash',
      formatCurrency(e.amount),
      e.notes ?? '—',
    ])
    if (expenseRows.length > 0) {
      expenseRows.push(['', 'TOTAL', formatCurrency(data.totalExpenses), ''])
      autoTable(doc, {
        startY: y, head: [['Description', 'Payment Type', 'Amount', 'Notes']],
        body: expenseRows, styles: { fontSize: 7 }, headStyles: { fillColor: [251, 191, 36] }, margin: { left: 14, right: 14 },
      })
      y = (doc as any).lastAutoTable.finalY + 8
    } else { noRecords('No expenses today.') }

    if (y > 200) { doc.addPage(); y = 15 }

    // Section 8 — Cash Register
    heading('Section 8 — Cash Register Summary')
    autoTable(doc, {
      startY: y,
      body: [
        ['Register A — Opening', formatCurrency(data.session.register_a_opening)],
        ['Register B — Opening', formatCurrency(data.session.register_b_opening)],
        ['Combined Opening', formatCurrency(data.opening)],
        ['Cash from Sales', formatCurrency(data.cashSales)],
        ['Cash from Money Receipts', formatCurrency(data.cashReceipts)],
        ['Cash from Direct Receipts', formatCurrency(data.cashDirectIn)],
        ['Cash Expenses', `− ${formatCurrency(data.cashExpenses)}`],
        ['Cash Old Gold Purchases', `− ${formatCurrency(data.cashOldGoldOut)}`],
        ['Expected Cash In Hand', formatCurrency(data.expectedCash)],
        ['Register A — Closing', formatCurrency(data.session.register_a_closing ?? 0)],
        ['Register B — Closing', formatCurrency(data.session.register_b_closing ?? 0)],
        ['Actual Closing (A+B)', formatCurrency(data.actualClosing)],
        ['Variance', `${data.variance >= 0 ? '+' : ''}${formatCurrency(data.variance)}`],
      ],
      styles: { fontSize: 8 }, columnStyles: { 0: { fontStyle: 'bold' } }, margin: { left: 14, right: 14 },
    })

    doc.save(`MNAP_Report_${reportDate}.pdf`)
    setExporting(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">End-of-Day Report</h1>
        <div className="flex items-center gap-3">
          <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
          {data && (
            <button onClick={exportPDF} disabled={exporting}
              className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
              {exporting ? 'Exporting…' : '↓ Export PDF'}
            </button>
          )}
        </div>
      </div>

      {loading && <div className="text-gray-500 text-sm">Loading report…</div>}

      {!loading && !data && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center text-gray-500">
          No day session found for {reportDate}.
        </div>
      )}

      {data && (
        <div className="space-y-4">
          {/* Section 1 — Sales Register */}
          <ReportSection title="Section 1 — Sales Register">
            {['gold', 'silver', 'other'].map(metal => {
              const metalBills = data.bills.filter((b: any) => b.metal_type === metal)
              if (!metalBills.length) return null
              return (
                <div key={metal} className="mb-4">
                  <p className="text-xs font-semibold uppercase text-amber-700 mb-2 capitalize">{metal}</p>
                  <table className="w-full text-xs border-collapse">
                    <thead><tr className="bg-gray-50">
                      <th className="text-left p-2 font-medium">Customer</th>
                      <th className="text-left p-2 font-medium">Item</th>
                      <th className="text-right p-2 font-medium">Weight</th>
                      <th className="text-right p-2 font-medium">Amount</th>
                      <th className="text-right p-2 font-medium">Old Gold</th>
                      <th className="text-right p-2 font-medium">Old Silver</th>
                    </tr></thead>
                    <tbody>
                      {metalBills.flatMap((b: any) =>
                        (b.sales_line_items ?? []).map((l: any, i: number) => (
                          <tr key={`${b.id}-${i}`} className="border-t border-gray-100">
                            <td className="p-2">{i === 0 ? b.customer_name : ''}</td>
                            <td className="p-2">{l.item_name}</td>
                            <td className="p-2 text-right">{l.weight ? `${l.weight}g` : '—'}</td>
                            <td className="p-2 text-right">{formatCurrency(l.amount)}</td>
                            <td className="p-2 text-right">{i === 0 && b.old_gold_weight ? `${b.old_gold_weight}g` : '—'}</td>
                            <td className="p-2 text-right">{i === 0 && b.old_silver_weight ? `${b.old_silver_weight}g` : '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </ReportSection>

          {/* Section 2 — Sales Summary */}
          <ReportSection title="Section 2 — Sales Summary">
            <SummaryTable rows={[
              ['Gold / Diamond Weight Sold', `${data.goldWeight.toFixed(3)}g`],
              ['Gold / Diamond Amount', formatCurrency(data.goldAmount)],
              ['Silver Weight Sold', `${data.silverWeight.toFixed(3)}g`],
              ['Silver Amount', formatCurrency(data.silverAmount)],
              ['Other / Misc Items', `${data.otherCount} items — ${formatCurrency(data.otherAmount)}`],
              ['Old Gold Received (from sales)', `${data.oldGoldWeight.toFixed(3)}g — ${formatCurrency(data.oldGoldAmount)}`],
              ['Old Silver Received (from sales)', `${data.oldSilverWeight.toFixed(3)}g — ${formatCurrency(data.oldSilverAmount)}`],
            ]} />
          </ReportSection>

          {/* Section 3 — Payment Breakdown */}
          <ReportSection title="Section 3 — Payment Mode Breakdown (Sales)">
            <SummaryTable rows={[
              ['Cash', formatCurrency(data.paymentCash)],
              ['Card', formatCurrency(data.paymentCard)],
              ['UPI', formatCurrency(data.paymentUPI)],
              ['PhonePe', formatCurrency(data.paymentPhonePe)],
              ['Cheque', formatCurrency(data.paymentCheque)],
              ['Customer Credit (new)', formatCurrency(data.paymentCredit)],
              ['Advance Adjusted', formatCurrency(data.paymentAdvance)],
              ['SIP Adjusted', formatCurrency(data.paymentSIP)],
            ]} />
          </ReportSection>

          {/* Section 4 — Money Receipts */}
          <ReportSection title="Section 4 — Money Receipts">
            {data.receipts.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-2">No money receipts today.</p>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead><tr className="bg-gray-50">
                  <th className="text-left p-2 font-medium">Type</th>
                  <th className="text-left p-2 font-medium">Serial No.</th>
                  <th className="text-left p-2 font-medium">Customer</th>
                  <th className="text-left p-2 font-medium">Repair Type</th>
                  <th className="text-left p-2 font-medium">Mode</th>
                  <th className="text-right p-2 font-medium">Amount</th>
                  <th className="text-left p-2 font-medium">Notes</th>
                </tr></thead>
                <tbody>
                  {data.receipts.map((r: any) => (
                    <tr key={r.id} className="border-t border-gray-100">
                      <td className="p-2 capitalize">{r.receipt_type.replace('_', ' ')}</td>
                      <td className="p-2">{r.serial_number ?? '—'}</td>
                      <td className="p-2">{r.customer_name}</td>
                      <td className="p-2">{r.repair_type ?? '—'}</td>
                      <td className="p-2 uppercase">{r.payment_mode}</td>
                      <td className="p-2 text-right">{formatCurrency(r.amount)}</td>
                      <td className="p-2 text-gray-500">{r.notes ?? '—'}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-sm">
                    <td colSpan={5} className="p-2">Grand Total Receipts</td>
                    <td className="p-2 text-right">{formatCurrency(data.totalAdvanceReceipts + data.totalSIPReceipts + data.totalCreditReceipts + data.totalRepairReceipts)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            )}
          </ReportSection>

          {/* Section 5 — Old Gold Purchases */}
          <ReportSection title="Section 5 — Old Gold Purchases">
            {data.oldGoldPurchases.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-2">No old gold purchases today.</p>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead><tr className="bg-gray-50">
                  <th className="text-left p-2 font-medium">Customer</th>
                  <th className="text-left p-2 font-medium">Phone</th>
                  <th className="text-left p-2 font-medium">Metal</th>
                  <th className="text-left p-2 font-medium">Purity</th>
                  <th className="text-right p-2 font-medium">Weight</th>
                  <th className="text-right p-2 font-medium">Rate/g</th>
                  <th className="text-right p-2 font-medium">Amount</th>
                  <th className="text-left p-2 font-medium">Payment</th>
                  <th className="text-left p-2 font-medium">Notes</th>
                </tr></thead>
                <tbody>
                  {data.oldGoldPurchases.map((p: any) => (
                    <tr key={p.id} className="border-t border-gray-100">
                      <td className="p-2">{p.customer_name}</td>
                      <td className="p-2">{p.customer_phone ?? '—'}</td>
                      <td className="p-2 capitalize">{p.metal_type}</td>
                      <td className="p-2">{p.purity ?? '—'}</td>
                      <td className="p-2 text-right">{p.weight}g</td>
                      <td className="p-2 text-right">{p.rate_per_gram ? `₹${p.rate_per_gram}` : '—'}</td>
                      <td className="p-2 text-right">{formatCurrency(p.total_amount)}</td>
                      <td className="p-2">{p.payment_mode === 'bank_transfer' ? 'Bank Transfer' : 'Cash'}</td>
                      <td className="p-2 text-gray-500">{p.notes ?? '—'}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-sm">
                    <td colSpan={6} className="p-2">Total Paid to Customers</td>
                    <td className="p-2 text-right">{formatCurrency(data.totalOldGoldPurchases)}</td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            )}
          </ReportSection>

          {/* Section 6 — Direct Money Receipts */}
          <ReportSection title="Section 6 — Direct Money Receipts">
            {data.directReceipts.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-2">No direct receipts today.</p>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead><tr className="bg-gray-50">
                  <th className="text-left p-2 font-medium">Customer</th>
                  <th className="text-left p-2 font-medium">Phone / Ref</th>
                  <th className="text-right p-2 font-medium">Amount</th>
                  <th className="text-left p-2 font-medium">Payment Mode</th>
                  <th className="text-left p-2 font-medium">Notes</th>
                </tr></thead>
                <tbody>
                  {data.directReceipts.map((r: any) => (
                    <tr key={r.id} className="border-t border-gray-100">
                      <td className="p-2">{r.customer_name}</td>
                      <td className="p-2">{r.customer_number ?? '—'}</td>
                      <td className="p-2 text-right">{formatCurrency(r.amount)}</td>
                      <td className="p-2">{PAYMENT_MODE_LABELS[r.payment_mode] ?? r.payment_mode}</td>
                      <td className="p-2 text-gray-500">{r.notes ?? '—'}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-sm">
                    <td colSpan={2} className="p-2">Total Direct Receipts</td>
                    <td className="p-2 text-right">{formatCurrency(data.totalDirectReceipts)}</td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            )}
          </ReportSection>

          {/* Section 7 — Expenses */}
          <ReportSection title="Section 7 — Expenses">
            {data.expenses.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-2">No expenses today.</p>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead><tr className="bg-gray-50">
                  <th className="text-left p-2 font-medium">Description</th>
                  <th className="text-left p-2 font-medium">Payment Type</th>
                  <th className="text-right p-2 font-medium">Amount</th>
                  <th className="text-left p-2 font-medium">Notes</th>
                </tr></thead>
                <tbody>
                  {data.expenses.map((e: any) => (
                    <tr key={e.id} className="border-t border-gray-100">
                      <td className="p-2">{e.description}</td>
                      <td className="p-2">{e.payment_type === 'bank_transfer' ? 'Bank Transfer' : 'Cash'}</td>
                      <td className="p-2 text-right">{formatCurrency(e.amount)}</td>
                      <td className="p-2 text-gray-500">{e.notes ?? '—'}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-sm">
                    <td colSpan={2} className="p-2">Total Expenses</td>
                    <td className="p-2 text-right">{formatCurrency(data.totalExpenses)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            )}
          </ReportSection>

          {/* Section 8 — Cash Register */}
          <ReportSection title="Section 8 — Cash Register Summary">
            <SummaryTable rows={[
              ['Register A — Opening Balance', formatCurrency(data.session.register_a_opening)],
              ['Register B — Opening Balance', formatCurrency(data.session.register_b_opening)],
              ['Combined Opening Balance', formatCurrency(data.opening)],
              ['Cash from Sales', formatCurrency(data.cashSales)],
              ['Cash from Money Receipts', formatCurrency(data.cashReceipts)],
              ['Cash from Direct Receipts', formatCurrency(data.cashDirectIn)],
              ['Cash Expenses', `− ${formatCurrency(data.cashExpenses)}`],
              ['Cash Old Gold Purchases', `− ${formatCurrency(data.cashOldGoldOut)}`],
              ['Expected Cash In Hand', formatCurrency(data.expectedCash)],
              ['Register A — Closing Balance', formatCurrency(data.session.register_a_closing ?? 0)],
              ['Register B — Closing Balance', formatCurrency(data.session.register_b_closing ?? 0)],
              ['Actual Closing (A+B)', formatCurrency(data.actualClosing)],
            ]} />
            <div className={`flex justify-between font-bold text-sm px-3 py-2 rounded-lg mt-2 ${Math.abs(data.variance) > 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              <span>Variance</span>
              <span>{data.variance >= 0 ? '+' : ''}{formatCurrency(data.variance)}</span>
            </div>
          </ReportSection>
        </div>
      )}
    </div>
  )
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="bg-amber-600 px-5 py-2.5">
        <h3 className="text-white font-semibold text-sm">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function SummaryTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="space-y-1">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex justify-between text-sm py-1">
          <span className="text-gray-600">{k}</span>
          <span className="font-medium text-gray-900">{v}</span>
        </div>
      ))}
    </div>
  )
}
