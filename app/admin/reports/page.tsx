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
    if (!session) { setLoading(false); setData(null); return }

    const [billsRes, receiptsRes, expensesRes] = await Promise.all([
      supabase.from('sales_bills').select('*, sales_line_items(*), sales_payments(*)').eq('day_session_id', session.id).eq('status', 'approved'),
      supabase.from('money_receipts').select('*').eq('day_session_id', session.id).eq('status', 'approved'),
      supabase.from('expenses').select('*').eq('day_session_id', session.id).eq('status', 'approved'),
    ])

    const bills = billsRes.data ?? []
    const receipts = receiptsRes.data ?? []
    const expenses = expensesRes.data ?? []

    // Section 2 — Sales Summary
    const goldBills = bills.filter((b: any) => b.metal_type === 'gold')
    const silverBills = bills.filter((b: any) => b.metal_type === 'silver')
    const otherBills = bills.filter((b: any) => b.metal_type === 'other')

    const sumWeight = (bs: any[]) => bs.flatMap((b: any) => b.sales_line_items ?? []).reduce((s: number, l: any) => s + (l.weight ?? 0), 0)
    const sumAmount = (bs: any[]) => bs.reduce((s: number, b: any) => s + b.total_amount, 0)
    const sumPayments = (bs: any[], mode: string) => bs.flatMap((b: any) => b.sales_payments ?? []).filter((p: any) => p.payment_mode === mode).reduce((s: number, p: any) => s + p.amount, 0)

    // Cash calculations
    const opening = (session.register_a_opening ?? 0) + (session.register_b_opening ?? 0)
    const allPayments = bills.flatMap((b: any) => b.sales_payments ?? [])
    const cashSales = allPayments.filter((p: any) => p.payment_mode === 'cash').reduce((s: number, p: any) => s + p.amount, 0)
    const cashReceipts = receipts.filter((r: any) => r.payment_mode === 'cash').reduce((s: number, r: any) => s + r.amount, 0)
    const cashExpenses = expenses.filter((e: any) => e.payment_type === 'cash').reduce((s: number, e: any) => s + e.amount, 0)
    const expectedCash = opening + cashSales + cashReceipts - cashExpenses
    const actualClosing = (session.register_a_closing ?? 0) + (session.register_b_closing ?? 0)

    setData({
      session, bills, receipts, expenses,
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
      paymentCheque: sumPayments(bills, 'cheque'),
      paymentCredit: sumPayments(bills, 'customer_credit'),
      paymentAdvance: sumPayments(bills, 'advance_adjustment'),
      paymentSIP: sumPayments(bills, 'sip_adjustment'),
      totalAdvanceReceipts: receipts.filter((r: any) => r.receipt_type === 'advance').reduce((s: number, r: any) => s + r.amount, 0),
      totalSIPReceipts: receipts.filter((r: any) => r.receipt_type === 'sip').reduce((s: number, r: any) => s + r.amount, 0),
      totalCreditReceipts: receipts.filter((r: any) => r.receipt_type === 'customer_credit').reduce((s: number, r: any) => s + r.amount, 0),
      totalRepairReceipts: receipts.filter((r: any) => r.receipt_type === 'repair').reduce((s: number, r: any) => s + r.amount, 0),
      totalExpenses: expenses.reduce((s: number, e: any) => s + e.amount, 0),
      cashExpenses, cashSales, cashReceipts,
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

    doc.setFontSize(16); doc.setFont('helvetica', 'bold')
    doc.text('M N Alankar Palace', 105, y, { align: 'center' }); y += 7
    doc.setFontSize(10); doc.setFont('helvetica', 'normal')
    doc.text(`End-of-Day Report — ${date}`, 105, y, { align: 'center' }); y += 10

    // Section 1 — Detailed Sales
    heading('Section 1 — Sales Register')
    const salesRows = data.bills.flatMap((b: any) =>
      (b.sales_line_items ?? []).map((l: any) => [
        b.customer_name, l.item_name, b.metal_type, b.purity ?? '—',
        l.weight ? `${l.weight}g` : '—', `₹${l.amount.toFixed(2)}`,
        b.old_gold_weight ? `${b.old_gold_weight}g` : '—',
        b.old_silver_weight ? `${b.old_silver_weight}g` : '—',
      ])
    )
    autoTable(doc, {
      startY: y, head: [['Customer', 'Item', 'Metal', 'Purity', 'Weight', 'Amount', 'Old Gold', 'Old Silver']],
      body: salesRows, styles: { fontSize: 7 }, headStyles: { fillColor: [251, 191, 36] }, margin: { left: 14, right: 14 },
    })
    y = (doc as any).lastAutoTable.finalY + 8

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
        ['Old Gold Received', `${data.oldGoldWeight.toFixed(3)}g — ${formatCurrency(data.oldGoldAmount)}`],
        ['Old Silver Received', `${data.oldSilverWeight.toFixed(3)}g — ${formatCurrency(data.oldSilverAmount)}`],
      ],
      styles: { fontSize: 8 }, columnStyles: { 0: { fontStyle: 'bold' } }, margin: { left: 14, right: 14 },
    })
    y = (doc as any).lastAutoTable.finalY + 8

    if (y > 230) { doc.addPage(); y = 15 }

    // Section 3 — Payment Breakdown
    heading('Section 3 — Payment Mode Breakdown')
    autoTable(doc, {
      startY: y,
      body: [
        ['Cash Received', formatCurrency(data.paymentCash)],
        ['Card Received', formatCurrency(data.paymentCard)],
        ['UPI Received', formatCurrency(data.paymentUPI)],
        ['Cheque Received', formatCurrency(data.paymentCheque)],
        ['Customer Credit', formatCurrency(data.paymentCredit)],
        ['Advance Adjusted', formatCurrency(data.paymentAdvance)],
        ['SIP Adjusted', formatCurrency(data.paymentSIP)],
      ],
      styles: { fontSize: 8 }, columnStyles: { 0: { fontStyle: 'bold' } }, margin: { left: 14, right: 14 },
    })
    y = (doc as any).lastAutoTable.finalY + 8

    // Section 4 — Money Receipts
    heading('Section 4 — Money Receipts Summary')
    autoTable(doc, {
      startY: y,
      body: [
        ['Advance Received', formatCurrency(data.totalAdvanceReceipts)],
        ['SIP Received', formatCurrency(data.totalSIPReceipts)],
        ['Customer Credit Received', formatCurrency(data.totalCreditReceipts)],
        ['Repair Receipts', formatCurrency(data.totalRepairReceipts)],
        ['Grand Total Receipts', formatCurrency(data.totalAdvanceReceipts + data.totalSIPReceipts + data.totalCreditReceipts + data.totalRepairReceipts)],
      ],
      styles: { fontSize: 8 }, columnStyles: { 0: { fontStyle: 'bold' } }, margin: { left: 14, right: 14 },
    })
    y = (doc as any).lastAutoTable.finalY + 8

    if (y > 220) { doc.addPage(); y = 15 }

    // Section 5 — Expenses
    heading('Section 5 — Expenses')
    autoTable(doc, {
      startY: y,
      head: [['Description', 'Amount', 'Payment Type']],
      body: [
        ...data.expenses.map((e: any) => [e.description, formatCurrency(e.amount), e.payment_type === 'bank_transfer' ? 'Bank Transfer' : 'Cash']),
        ['TOTAL EXPENSES', formatCurrency(data.totalExpenses), ''],
      ],
      styles: { fontSize: 8 }, headStyles: { fillColor: [251, 191, 36] }, margin: { left: 14, right: 14 },
    })
    y = (doc as any).lastAutoTable.finalY + 8

    // Section 6 — Cash Register
    heading('Section 6 — Cash Register Summary')
    autoTable(doc, {
      startY: y,
      body: [
        ['Register A — Opening', formatCurrency(data.session.register_a_opening)],
        ['Register B — Opening', formatCurrency(data.session.register_b_opening)],
        ['Combined Opening', formatCurrency(data.opening)],
        ['Total Cash Inflows', formatCurrency(data.cashSales + data.cashReceipts)],
        ['Total Cash Outflows', formatCurrency(data.cashExpenses)],
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
              ['Old Gold Received', `${data.oldGoldWeight.toFixed(3)}g — ${formatCurrency(data.oldGoldAmount)}`],
              ['Old Silver Received', `${data.oldSilverWeight.toFixed(3)}g — ${formatCurrency(data.oldSilverAmount)}`],
            ]} />
          </ReportSection>

          {/* Section 3 — Payment Breakdown */}
          <ReportSection title="Section 3 — Payment Mode Breakdown">
            <SummaryTable rows={[
              ['Cash Received', formatCurrency(data.paymentCash)],
              ['Card Received', formatCurrency(data.paymentCard)],
              ['UPI Received', formatCurrency(data.paymentUPI)],
              ['Cheque Received', formatCurrency(data.paymentCheque)],
              ['Customer Credit (new)', formatCurrency(data.paymentCredit)],
              ['Advance Adjusted', formatCurrency(data.paymentAdvance)],
              ['SIP Adjusted', formatCurrency(data.paymentSIP)],
            ]} />
          </ReportSection>

          {/* Section 4 — Money Receipts */}
          <ReportSection title="Section 4 — Money Receipts Summary">
            <SummaryTable rows={[
              ['Advance Received', formatCurrency(data.totalAdvanceReceipts)],
              ['SIP Received', formatCurrency(data.totalSIPReceipts)],
              ['Customer Credit Received', formatCurrency(data.totalCreditReceipts)],
              ['Repair Receipts', formatCurrency(data.totalRepairReceipts)],
              ['Grand Total Receipts', formatCurrency(data.totalAdvanceReceipts + data.totalSIPReceipts + data.totalCreditReceipts + data.totalRepairReceipts)],
            ]} bold={[4]} />
          </ReportSection>

          {/* Section 5 — Expenses */}
          <ReportSection title="Section 5 — Expenses">
            <table className="w-full text-sm border-collapse">
              <thead><tr className="bg-gray-50">
                <th className="text-left p-2 font-medium">Description</th>
                <th className="text-right p-2 font-medium">Amount</th>
                <th className="text-right p-2 font-medium">Type</th>
              </tr></thead>
              <tbody>
                {data.expenses.map((e: any) => (
                  <tr key={e.id} className="border-t border-gray-100">
                    <td className="p-2">{e.description}</td>
                    <td className="p-2 text-right">{formatCurrency(e.amount)}</td>
                    <td className="p-2 text-right capitalize">{e.payment_type === 'bank_transfer' ? 'Bank Transfer' : 'Cash'}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                  <td className="p-2">Total Expenses</td>
                  <td className="p-2 text-right">{formatCurrency(data.totalExpenses)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </ReportSection>

          {/* Section 6 — Cash Register */}
          <ReportSection title="Section 6 — Cash Register Summary">
            <SummaryTable rows={[
              ['Register A — Opening Balance', formatCurrency(data.session.register_a_opening)],
              ['Register B — Opening Balance', formatCurrency(data.session.register_b_opening)],
              ['Combined Opening Balance', formatCurrency(data.opening)],
              ['Total Cash Inflows', formatCurrency(data.cashSales + data.cashReceipts)],
              ['Total Cash Outflows', formatCurrency(data.cashExpenses)],
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

function SummaryTable({ rows, bold = [] }: { rows: [string, string][]; bold?: number[] }) {
  return (
    <div className="space-y-1">
      {rows.map(([k, v], i) => (
        <div key={i} className={`flex justify-between text-sm py-1 ${bold.includes(i) ? 'font-bold border-t border-gray-200 mt-1 pt-2' : ''}`}>
          <span className="text-gray-600">{k}</span>
          <span className="font-medium text-gray-900">{v}</span>
        </div>
      ))}
    </div>
  )
}
