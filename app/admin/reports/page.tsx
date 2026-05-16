'use client'

import { useEffect, useState, Fragment } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, PAYMENT_MODE_LABELS } from '@/lib/utils'

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

export default function ReportsPage() {
  const supabase = createClient()
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0])
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [dailyRates, setDailyRates] = useState<any>(null)
  const [checkedItemId, setCheckedItemId] = useState<string | null>(null)
  const [showStockSheet, setShowStockSheet] = useState(false)

  async function loadReport() {
    setLoading(true)
    setData(null)
    setCheckedItemId(null)

    const [sessionRes, billsRes, receiptsRes, expensesRes, ogRes, drRes, ppRes, asRes, ratesRes] = await Promise.all([
      supabase.from('day_sessions').select('*').eq('date', reportDate).single(),
      supabase.from('sales_bills').select('*, sales_line_items(*), sales_payments(*), day_sessions!inner(id)').eq('day_sessions.date', reportDate).eq('status', 'approved'),
      supabase.from('money_receipts').select('*, day_sessions!inner(id)').eq('day_sessions.date', reportDate).eq('status', 'approved'),
      supabase.from('expenses').select('*, day_sessions!inner(id)').eq('day_sessions.date', reportDate).eq('status', 'approved'),
      supabase.from('old_gold_purchases').select('*, day_sessions!inner(id)').eq('day_sessions.date', reportDate).eq('status', 'approved'),
      supabase.from('direct_receipts').select('*, day_sessions!inner(id)').eq('day_sessions.date', reportDate).eq('status', 'approved'),
      supabase.from('party_payments').select('*, day_sessions!inner(id)').eq('day_sessions.date', reportDate).eq('status', 'approved'),
      supabase.from('approval_sales').select('*, approval_sale_items(*), day_sessions!inner(id)').eq('day_sessions.date', reportDate).eq('status', 'approved'),
      supabase.from('daily_rates').select('*').eq('date', reportDate).maybeSingle(),
    ])

    const session = sessionRes.data
    if (!session) { setLoading(false); return }

    const bills = billsRes.data ?? []
    const receipts = receiptsRes.data ?? []
    const expenses = expensesRes.data ?? []
    const oldGoldPurchases = ogRes.data ?? []
    const directReceipts = drRes.data ?? []
    const partyPayments = ppRes.data ?? []
    const approvalSales = asRes.data ?? []
    setDailyRates(ratesRes.data ?? null)

    const allLineItems = bills.flatMap((b: any) => b.sales_line_items ?? [])
    const goldItems = allLineItems.filter((l: any) => l.metal_type === 'gold')
    const silverItems = allLineItems.filter((l: any) => l.metal_type === 'silver')
    const otherItems = allLineItems.filter((l: any) => l.metal_type === 'other')
    const sumPayments = (bs: any[], mode: string) =>
      bs.flatMap((b: any) => b.sales_payments ?? []).filter((p: any) => p.payment_mode === mode).reduce((s: number, p: any) => s + p.amount, 0)

    const opening = (session.register_a_opening ?? 0) + (session.register_b_opening ?? 0)
    const allPayments = bills.flatMap((b: any) => b.sales_payments ?? [])
    const receiptNetAmt = (r: any) => r.amount - (r.old_gold_amount ?? 0) - (r.old_silver_amount ?? 0)
    const receiptByMode = (mode: string) => receipts.filter((r: any) => r.payment_mode === mode).reduce((s: number, r: any) => s + receiptNetAmt(r), 0)
    const cashSales = allPayments.filter((p: any) => p.payment_mode === 'cash').reduce((s: number, p: any) => s + p.amount, 0)
    const cashReceipts = receipts.filter((r: any) => r.payment_mode === 'cash').reduce((s: number, r: any) => s + r.amount - (r.old_gold_amount ?? 0) - (r.old_silver_amount ?? 0), 0)
    const cashExpenses = expenses.filter((e: any) => e.payment_type === 'cash').reduce((s: number, e: any) => s + e.amount, 0)
    const cashOldGoldOut = oldGoldPurchases.filter((p: any) => p.payment_mode === 'cash').reduce((s: number, p: any) => s + p.total_amount, 0)
    const cashDirectIn = directReceipts.filter((r: any) => r.payment_mode === 'cash').reduce((s: number, r: any) => s + r.amount, 0)
    const cashPartyPayOut = partyPayments.filter((p: any) => p.payment_mode === 'cash').reduce((s: number, p: any) => s + p.amount, 0)
    const expectedCash = opening + cashSales + cashReceipts + cashDirectIn - cashExpenses - cashOldGoldOut - cashPartyPayOut
    const actualClosing = (session.register_a_closing ?? 0) + (session.register_b_closing ?? 0)

    const adjustments = [
      ...bills.flatMap((b: any) =>
        (b.sales_payments ?? [])
          .filter((p: any) => p.payment_mode === 'advance_adjustment' || p.payment_mode === 'sip_adjustment')
          .map((p: any) => ({
            source: 'Sale', customer: b.customer_name, reference: b.bill_number,
            mode: p.payment_mode, serial: p.reference_serial ?? null, amount: p.amount,
          }))
      ),
      ...receipts
        .filter((r: any) => r.payment_mode === 'advance_adjustment' || r.payment_mode === 'sip_adjustment')
        .map((r: any) => ({
          source: 'Receipt', customer: r.customer_name, reference: r.serial_number ?? null,
          mode: r.payment_mode, serial: r.reference_serial ?? null, amount: r.amount,
        })),
    ]

    const creditEntries = [
      ...bills.flatMap((b: any) =>
        (b.sales_payments ?? [])
          .filter((p: any) => p.payment_mode === 'customer_credit')
          .map((p: any) => ({
            source: 'Sale', customer: b.customer_name, reference: b.bill_number, amount: p.amount,
          }))
      ),
      ...receipts
        .filter((r: any) => r.payment_mode === 'customer_credit')
        .map((r: any) => ({
          source: 'Receipt', customer: r.customer_name,
          reference: r.serial_number ?? null,
          amount: r.amount - (r.old_gold_amount ?? 0) - (r.old_silver_amount ?? 0),
        })),
    ]

    setData({
      session, bills, receipts, expenses, oldGoldPurchases, directReceipts,
      goldWeight: goldItems.reduce((s: number, l: any) => s + (l.weight ?? 0), 0),
      goldAmount: goldItems.reduce((s: number, l: any) => s + l.amount, 0),
      silverWeight: silverItems.reduce((s: number, l: any) => s + (l.weight ?? 0), 0),
      silverAmount: silverItems.reduce((s: number, l: any) => s + l.amount, 0),
      otherCount: otherItems.length,
      otherAmount: otherItems.reduce((s: number, l: any) => s + l.amount, 0),
      oldGoldWeight: bills.reduce((s: number, b: any) => s + (b.old_gold_weight ?? 0), 0) + receipts.reduce((s: number, r: any) => s + (r.old_gold_weight ?? 0), 0),
      oldGoldAmount: bills.reduce((s: number, b: any) => s + (b.old_gold_amount ?? 0), 0) + receipts.reduce((s: number, r: any) => s + (r.old_gold_amount ?? 0), 0),
      oldSilverWeight: bills.reduce((s: number, b: any) => s + (b.old_silver_weight ?? 0), 0) + receipts.reduce((s: number, r: any) => s + (r.old_silver_weight ?? 0), 0),
      oldSilverAmount: bills.reduce((s: number, b: any) => s + (b.old_silver_amount ?? 0), 0) + receipts.reduce((s: number, r: any) => s + (r.old_silver_amount ?? 0), 0),
      paymentCash: sumPayments(bills, 'cash') + receiptByMode('cash'),
      paymentCard: sumPayments(bills, 'card') + receiptByMode('card'),
      paymentUPI: sumPayments(bills, 'upi') + receiptByMode('upi'),
      paymentPhonePe: sumPayments(bills, 'phonepe') + receiptByMode('phonepe'),
      paymentCheque: sumPayments(bills, 'cheque') + receiptByMode('cheque'),
      paymentCredit: sumPayments(bills, 'customer_credit') + receiptByMode('customer_credit'),
      paymentAdvance: sumPayments(bills, 'advance_adjustment') + receiptByMode('advance_adjustment'),
      paymentSIP: sumPayments(bills, 'sip_adjustment') + receiptByMode('sip_adjustment'),
      totalAdvanceReceipts: receipts.filter((r: any) => r.receipt_type === 'advance').reduce((s: number, r: any) => s + r.amount, 0),
      totalSIPReceipts: receipts.filter((r: any) => r.receipt_type === 'sip').reduce((s: number, r: any) => s + r.amount, 0),
      totalCreditReceipts: receipts.filter((r: any) => r.receipt_type === 'customer_credit').reduce((s: number, r: any) => s + r.amount, 0),
      totalRepairReceipts: receipts.filter((r: any) => r.receipt_type === 'repair').reduce((s: number, r: any) => s + r.amount, 0),
      totalExpenses: expenses.reduce((s: number, e: any) => s + e.amount, 0),
      totalOldGoldPurchases: oldGoldPurchases.reduce((s: number, p: any) => s + p.total_amount, 0),
      totalDirectReceipts: directReceipts.reduce((s: number, r: any) => s + r.amount, 0),
      totalPartyPayments: partyPayments.reduce((s: number, p: any) => s + p.amount, 0),
      partyPayments, approvalSales,
      cashSales, cashReceipts, cashExpenses, cashOldGoldOut, cashDirectIn, cashPartyPayOut,
      opening, expectedCash, actualClosing,
      variance: actualClosing - expectedCash,
      adjustments, creditEntries,
    })
    setLoading(false)
  }

  useEffect(() => { loadReport() }, [reportDate])

  async function exportPDF(mode: 'save' | 'print' | 'share' = 'save') {
    if (!data) return
    setExporting(true)
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')

    const doc = new jsPDF()
    const pdfAmt = (n: number) => 'Rs.' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
      (b.sales_line_items ?? []).map((l: any, i: number) => [
        i === 0 ? b.customer_name : '', l.order_in ? `* ${l.item_name}` : l.item_name,
        l.metal_type, l.purity ?? '—', l.party ?? '—',
        l.weight ? `${l.weight}g` : '—', pdfAmt(l.amount),
        i === 0 && b.old_gold_weight ? `${b.old_gold_weight}g` : '—',
        i === 0 && b.old_silver_weight ? `${b.old_silver_weight}g` : '—',
      ])
    )
    const hasOrderIn = data.bills.some((b: any) => (b.sales_line_items ?? []).some((l: any) => l.order_in))
    if (salesRows.length > 0) {
      autoTable(doc, {
        startY: y, head: [['Customer', 'Item', 'Metal', 'Purity', 'Party', 'Weight', 'Amount', 'Old Gold', 'Old Silver']],
        body: salesRows, styles: { fontSize: 7 }, headStyles: { fillColor: [251, 191, 36] }, margin: { left: 14, right: 14 },
      })
      y = (doc as any).lastAutoTable.finalY + 4
      if (hasOrderIn) {
        doc.setFontSize(7); doc.setFont('helvetica', 'italic')
        doc.text('* Items marked Order In - must be updated in Order Stock', 14, y)
        y += 6
      }
      y += 2
    } else { noRecords('No sales today.') }

    if (y > 250) { doc.addPage(); y = 15 }

    // Section 2 — Approval / Other Party Sales / Stock In
    heading('Section 2 — Approval / Other Party Sales / Stock In')
    const txLabel = (t: string) => t === 'sale' ? 'Party Sale' : t === 'approval' ? 'Approval' : t === 'approval_return' ? 'Approval Return *' : 'Stock In *'
    const asRows = data.approvalSales.flatMap((s: any) =>
      (s.approval_sale_items ?? []).map((l: any, i: number) => [
        i === 0 ? s.party_name : '',
        i === 0 ? txLabel(s.transaction_type) : '',
        l.item_name, l.metal_type, l.purity ?? '—', l.party,
        l.weight ? `${l.weight}g` : '—', l.notes ?? '—',
      ])
    )
    const hasStockIn = data.approvalSales.some((s: any) => s.transaction_type === 'approval_return' || s.transaction_type === 'stock_in')
    if (asRows.length > 0) {
      autoTable(doc, {
        startY: y, head: [['Party', 'Type', 'Item', 'Metal', 'Purity', 'Party (Stock)', 'Weight', 'Notes']],
        body: asRows, styles: { fontSize: 7 }, headStyles: { fillColor: [251, 191, 36] }, margin: { left: 14, right: 14 },
      })
      y = (doc as any).lastAutoTable.finalY + 4
      if (hasStockIn) {
        doc.setFontSize(7); doc.setFont('helvetica', 'italic')
        doc.text('* Approval Return / Stock In items must be updated IN the stock', 14, y)
        y += 6
      }
      y += 2
    } else { noRecords('No approval or party sale entries today.') }

    if (y > 220) { doc.addPage(); y = 15 }

    // Section 3 — Money Receipts
    heading('Section 3 — Money Receipts')
    const receiptRows = data.receipts.map((r: any) => [
      r.receipt_type.replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
      r.serial_number ?? '—',
      r.customer_name,
      r.repair_type ?? '—',
      receiptSettlementLabel(r),
      pdfAmt(r.amount),
      r.notes ?? '—',
    ])
    if (receiptRows.length > 0) {
      receiptRows.push(['', '', '', '', 'TOTAL', pdfAmt(data.totalAdvanceReceipts + data.totalSIPReceipts + data.totalCreditReceipts + data.totalRepairReceipts), ''])
      autoTable(doc, {
        startY: y, head: [['Type', 'Serial', 'Customer', 'Repair', 'Settlement', 'Amount', 'Notes']],
        body: receiptRows, styles: { fontSize: 7 }, headStyles: { fillColor: [251, 191, 36] }, margin: { left: 14, right: 14 },
      })
      y = (doc as any).lastAutoTable.finalY + 8
    } else { noRecords('No money receipts today.') }

    if (y > 220) { doc.addPage(); y = 15 }

    // Section 4 — Old Metal Purchases
    heading('Section 4 — Old Metal Purchases')
    const ogRows = data.oldGoldPurchases.map((p: any) => [
      p.customer_name, p.customer_phone ?? '—', p.metal_type, p.purity ?? '—',
      `${p.weight}g`, p.rate_per_gram ? `Rs.${p.rate_per_gram}` : '—',
      pdfAmt(p.total_amount),
      p.payment_mode === 'bank_transfer' ? 'Bank Transfer' : 'Cash',
      p.notes ?? '—',
    ])
    if (ogRows.length > 0) {
      ogRows.push(['', '', '', '', '', 'TOTAL', pdfAmt(data.totalOldGoldPurchases), '', ''])
      autoTable(doc, {
        startY: y, head: [['Customer', 'Phone', 'Metal', 'Purity', 'Weight', 'Rate/g', 'Amount', 'Payment', 'Notes']],
        body: ogRows, styles: { fontSize: 7 }, headStyles: { fillColor: [251, 191, 36] }, margin: { left: 14, right: 14 },
      })
      y = (doc as any).lastAutoTable.finalY + 8
    } else { noRecords('No old gold purchases today.') }

    if (y > 220) { doc.addPage(); y = 15 }

    // Section 5 — Direct Receipts
    heading('Section 5 — Direct Money Receipts')
    const drRows = data.directReceipts.map((r: any) => [
      r.customer_name, r.customer_number ?? '—',
      pdfAmt(r.amount),
      PAYMENT_MODE_LABELS[r.payment_mode] ?? r.payment_mode,
      r.notes ?? '—',
    ])
    if (drRows.length > 0) {
      drRows.push(['', 'TOTAL', pdfAmt(data.totalDirectReceipts), '', ''])
      autoTable(doc, {
        startY: y, head: [['Customer', 'Phone / Ref', 'Amount', 'Payment', 'Notes']],
        body: drRows, styles: { fontSize: 7 }, headStyles: { fillColor: [251, 191, 36] }, margin: { left: 14, right: 14 },
      })
      y = (doc as any).lastAutoTable.finalY + 8
    } else { noRecords('No direct receipts today.') }

    if (y > 220) { doc.addPage(); y = 15 }

    // Section 6 — Sales + Money Receipts Summary
    heading('Section 6 — Sales + Money Receipts Summary')
    autoTable(doc, {
      startY: y,
      body: [
        ['Gold / Diamond Weight Sold', `${data.goldWeight.toFixed(3)}g`],
        ['Gold / Diamond Amount', pdfAmt(data.goldAmount)],
        ['Silver Weight Sold', `${data.silverWeight.toFixed(3)}g`],
        ['Silver Amount', pdfAmt(data.silverAmount)],
        ['Other / Misc Items', `${data.otherCount} items — ${pdfAmt(data.otherAmount)}`],
        ['Total Money Receipts', pdfAmt(data.totalAdvanceReceipts + data.totalSIPReceipts + data.totalCreditReceipts + data.totalRepairReceipts)],
        ['Old Gold Received (sales + receipts)', `${data.oldGoldWeight.toFixed(3)}g — ${pdfAmt(data.oldGoldAmount)}`],
        ['Old Silver Received (sales + receipts)', `${data.oldSilverWeight.toFixed(3)}g — ${pdfAmt(data.oldSilverAmount)}`],
      ],
      styles: { fontSize: 8 }, columnStyles: { 0: { fontStyle: 'bold' } }, margin: { left: 14, right: 14 },
    })
    y = (doc as any).lastAutoTable.finalY + 8

    if (y > 220) { doc.addPage(); y = 15 }

    // Section 7 — Customer Payment Mode Breakdown
    heading('Section 7 — Customer Payment Mode Breakdown')
    autoTable(doc, {
      startY: y,
      body: [
        ['Cash', pdfAmt(data.paymentCash)],
        ['Card', pdfAmt(data.paymentCard)],
        ['UPI', pdfAmt(data.paymentUPI)],
        ['PhonePe', pdfAmt(data.paymentPhonePe)],
        ['Cheque', pdfAmt(data.paymentCheque)],
        ['Customer Credit (Sales + Receipts)', pdfAmt(data.paymentCredit)],
        ['Advance Adjusted', pdfAmt(data.paymentAdvance)],
        ['SIP Adjusted', pdfAmt(data.paymentSIP)],
      ],
      styles: { fontSize: 8 }, columnStyles: { 0: { fontStyle: 'bold' } }, margin: { left: 14, right: 14 },
    })
    y = (doc as any).lastAutoTable.finalY + 8

    if (y > 220) { doc.addPage(); y = 15 }

    // Section 8 — Payments
    heading('Section 8 — Payments')
    const ppRows = data.partyPayments.map((p: any) => [
      p.party_name,
      pdfAmt(p.amount),
      p.payment_mode === 'bank_transfer' ? 'Bank Transfer' : 'Cash',
      p.notes ?? '—',
    ])
    if (ppRows.length > 0) {
      ppRows.push(['TOTAL', pdfAmt(data.totalPartyPayments), '', ''])
      autoTable(doc, {
        startY: y, head: [['Party', 'Amount', 'Payment', 'Notes']],
        body: ppRows, styles: { fontSize: 7 }, headStyles: { fillColor: [251, 191, 36] }, margin: { left: 14, right: 14 },
      })
      y = (doc as any).lastAutoTable.finalY + 8
    } else { noRecords('No payments today.') }

    if (y > 220) { doc.addPage(); y = 15 }

    // Section 9 — Advance, SIP & Customer Credit
    if (y > 220) { doc.addPage(); y = 15 }
    heading('Section 9 — Advance, SIP & Customer Credit')

    // 9A — Advance & SIP
    doc.setFontSize(8); doc.setFont('helvetica', 'bold')
    doc.text('9A — Advance & SIP Adjustments', 14, y); y += 5
    const adjRows = data.adjustments.map((a: any) => [
      a.source, a.customer, a.reference ?? '—',
      PAYMENT_MODE_LABELS[a.mode], a.serial ?? '—', pdfAmt(a.amount),
    ])
    if (adjRows.length > 0) {
      adjRows.push(['', '', '', '', 'TOTAL', pdfAmt(data.adjustments.reduce((s: number, a: any) => s + a.amount, 0))])
      autoTable(doc, {
        startY: y, head: [['Source', 'Customer', 'Bill / Receipt No.', 'Type', 'Serial No.', 'Amount']],
        body: adjRows, styles: { fontSize: 7 }, headStyles: { fillColor: [251, 191, 36] }, margin: { left: 14, right: 14 },
      })
      y = (doc as any).lastAutoTable.finalY + 6
    } else { noRecords('No advance or SIP adjustments today.') }

    // 9B — Customer Credit
    if (y > 230) { doc.addPage(); y = 15 }
    doc.setFontSize(8); doc.setFont('helvetica', 'bold')
    doc.text('9B — Customer Credit Used', 14, y); y += 5
    if (data.creditEntries.length === 0) {
      noRecords('No customer credit entries today.')
    } else {
      // Group by customer
      const creditGrouped: Record<string, any[]> = {}
      for (const e of data.creditEntries) {
        if (!creditGrouped[e.customer]) creditGrouped[e.customer] = []
        creditGrouped[e.customer].push(e)
      }
      const creditRows: any[] = []
      for (const [customer, entries] of Object.entries(creditGrouped)) {
        const customerTotal = (entries as any[]).reduce((s: number, e: any) => s + e.amount, 0)
        ;(entries as any[]).forEach((e: any, i: number) => {
          creditRows.push([i === 0 ? customer : '', e.source, e.reference ?? '—', pdfAmt(e.amount)])
        })
        if ((entries as any[]).length > 1) {
          creditRows.push(['', '', `${customer} — Subtotal`, pdfAmt(customerTotal)])
        }
      }
      creditRows.push(['', '', 'TOTAL Customer Credit', pdfAmt(data.creditEntries.reduce((s: number, e: any) => s + e.amount, 0))])
      autoTable(doc, {
        startY: y, head: [['Customer', 'Source', 'Bill / Receipt No.', 'Amount']],
        body: creditRows, styles: { fontSize: 7 }, headStyles: { fillColor: [251, 191, 36] }, margin: { left: 14, right: 14 },
      })
      y = (doc as any).lastAutoTable.finalY + 8
    }

    // Section 10 — Expenses
    heading('Section 10 — Expenses')
    const expenseRows = data.expenses.map((e: any) => [
      e.description,
      e.payment_type === 'bank_transfer' ? 'Bank Transfer' : 'Cash',
      pdfAmt(e.amount),
      e.notes ?? '—',
    ])
    if (expenseRows.length > 0) {
      expenseRows.push(['', 'TOTAL', pdfAmt(data.totalExpenses), ''])
      autoTable(doc, {
        startY: y, head: [['Description', 'Payment Type', 'Amount', 'Notes']],
        body: expenseRows, styles: { fontSize: 7 }, headStyles: { fillColor: [251, 191, 36] }, margin: { left: 14, right: 14 },
      })
      y = (doc as any).lastAutoTable.finalY + 8
    } else { noRecords('No expenses today.') }

    if (y > 200) { doc.addPage(); y = 15 }

    // Section 11 — Cash Register
    heading('Section 11 — Cash Register Summary')
    autoTable(doc, {
      startY: y,
      body: [
        ['Register A — Opening', pdfAmt(data.session.register_a_opening)],
        ['Register B — Opening', pdfAmt(data.session.register_b_opening)],
        ['Combined Opening', pdfAmt(data.opening)],
        ['Cash from Sales', pdfAmt(data.cashSales)],
        ['Cash from Money Receipts', pdfAmt(data.cashReceipts)],
        ['Cash from Direct Receipts', pdfAmt(data.cashDirectIn)],
        ['Cash Expenses', `- ${pdfAmt(data.cashExpenses)}`],
        ['Cash Old Metal Purchases', `- ${pdfAmt(data.cashOldGoldOut)}`],
        ['Cash Payments to Parties', `- ${pdfAmt(data.cashPartyPayOut)}`],
        ['Expected Cash In Hand', pdfAmt(data.expectedCash)],
        ['Register A — Closing', pdfAmt(data.session.register_a_closing ?? 0)],
        ['Register B — Closing', pdfAmt(data.session.register_b_closing ?? 0)],
        ['Actual Closing (A+B)', pdfAmt(data.actualClosing)],
        ['Variance', `${data.variance >= 0 ? '+' : '-'}${pdfAmt(Math.abs(data.variance))}`],
      ],
      styles: { fontSize: 8 }, columnStyles: { 0: { fontStyle: 'bold' } }, margin: { left: 14, right: 14 },
    })

    if (mode === 'print') {
      doc.autoPrint()
      doc.output('dataurlnewwindow')
    } else if (mode === 'share') {
      const blob = doc.output('blob')
      const file = new File([blob], `MNAP_Report_${reportDate}.pdf`, { type: 'application/pdf' })
      if (typeof navigator !== 'undefined' && (navigator as any).canShare?.({ files: [file] })) {
        await (navigator as any).share({ files: [file], title: `MNAP Report ${reportDate}` })
      } else {
        doc.save(`MNAP_Report_${reportDate}.pdf`)
        window.open('https://web.whatsapp.com', '_blank')
      }
    } else {
      doc.save(`MNAP_Report_${reportDate}.pdf`)
    }
    setExporting(false)
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-900">End-of-Day Report</h1>
          <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
        {data && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => exportPDF('share')} disabled={exporting}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
              {exporting ? 'Working…' : '💬 WhatsApp'}
            </button>
            <button onClick={() => exportPDF('print')} disabled={exporting}
              className="bg-gray-700 hover:bg-gray-800 disabled:bg-gray-300 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
              {exporting ? 'Working…' : '⎙ Print PDF'}
            </button>
            <button onClick={() => exportPDF('save')} disabled={exporting}
              className="bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
              {exporting ? 'Exporting…' : '↓ Export PDF'}
            </button>
            <button onClick={() => setShowStockSheet(true)}
              className="bg-sky-700 hover:bg-sky-800 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
              📦 Stock Sheet
            </button>
          </div>
        )}
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
            {data.bills.some((b: any) => (b.sales_line_items ?? []).some((l: any) => l.order_in)) && (
              <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
                <span className="inline-block w-3 h-3 rounded-sm bg-sky-200 border border-sky-300 flex-shrink-0" />
                <span>Items marked <strong>Order In</strong> must be updated in Order Stock</span>
              </div>
            )}
            {['gold', 'silver', 'other'].map(metal => {
              const metalItems = data.bills.flatMap((b: any) =>
                (b.sales_line_items ?? [])
                  .filter((l: any) => l.metal_type === metal)
                  .map((l: any, lIdx: number) => ({
                    ...l,
                    customer_name: b.customer_name,
                    isFirstInBill: lIdx === 0,
                    old_gold_weight: b.old_gold_weight,
                    old_gold_amount: b.old_gold_amount,
                    old_silver_weight: b.old_silver_weight,
                    old_silver_amount: b.old_silver_amount,
                  }))
              )
              if (!metalItems.length) return null
              return (
                <div key={metal} className="mb-4">
                  <p className="text-xs font-semibold uppercase text-amber-700 mb-2 capitalize">
                    {metal}
                    {metal !== 'other' && <span className="ml-1.5 text-gray-400 font-normal normal-case">· tap a row to verify amount</span>}
                  </p>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className={metalItems.some((l: any) => l.order_in) ? 'bg-sky-100' : 'bg-gray-50'}>
                        <th className="text-left p-2 font-medium">Customer</th>
                        <th className="text-left p-2 font-medium">Item</th>
                        <th className="text-left p-2 font-medium">Purity</th>
                        <th className="text-left p-2 font-medium">Party</th>
                        <th className="text-right p-2 font-medium">Weight</th>
                        <th className="text-right p-2 font-medium">Amount</th>
                        <th className="text-right p-2 font-medium">Old Gold</th>
                        <th className="text-right p-2 font-medium">Old Silver</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metalItems.map((item: any, i: number) => {
                        const isOpen = checkedItemId === item.id
                        const canCheck = item.metal_type !== 'other' && item.weight
                        return (
                          <Fragment key={`${item.id}-${i}`}>
                            <tr
                              onClick={() => canCheck && setCheckedItemId(isOpen ? null : item.id)}
                              className={`transition-colors
                                ${item.order_in ? 'border-t border-sky-300 bg-sky-100 border-l-4 border-l-sky-400' : 'border-t border-gray-100'}
                                ${canCheck && !item.order_in ? 'cursor-pointer hover:bg-amber-50' : ''}
                                ${canCheck && item.order_in ? 'cursor-pointer hover:bg-sky-200' : ''}
                                ${isOpen && !item.order_in ? 'bg-amber-50' : ''}`}
                            >
                              <td className="p-2">{item.customer_name}</td>
                              <td className="p-2">
                                {item.item_name}
                                {item.order_in && <span className="ml-1.5 text-[10px] font-semibold text-sky-700 bg-sky-200 border border-sky-300 px-1.5 py-0.5 rounded-full">Order In</span>}
                              </td>
                              <td className="p-2">{item.purity ?? '—'}</td>
                              <td className="p-2">{item.party ?? '—'}</td>
                              <td className="p-2 text-right">{item.weight ? `${item.weight}g` : '—'}</td>
                              <td className="p-2 text-right">{formatCurrency(item.amount)}</td>
                              <td className="p-2 text-right">{item.isFirstInBill && item.old_gold_weight ? `${item.old_gold_weight}g` : '—'}</td>
                              <td className="p-2 text-right">{item.isFirstInBill && item.old_silver_weight ? `${item.old_silver_weight}g` : '—'}</td>
                            </tr>
                            {isOpen && (
                              <tr>
                                <td colSpan={8} className="px-2 pb-2">
                                  <RateCheckPanel item={item} rates={dailyRates} onClose={() => setCheckedItemId(null)} />
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </ReportSection>

          {/* Section 2 — Approval / Other Party Sales / Stock In */}
          <ReportSection title="Section 2 — Approval / Other Party Sales / Stock In">
            {data.approvalSales.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-2">No approval or party sale entries today.</p>
            ) : (
              <>
                {data.approvalSales.some((s: any) => s.transaction_type === 'approval_return' || s.transaction_type === 'stock_in') && (
                  <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
                    <span className="inline-block w-3 h-3 rounded-sm bg-red-200 border border-red-400 flex-shrink-0" />
                    <span>Items highlighted in red must be updated <strong>IN</strong> the stock</span>
                  </div>
                )}
                <div className="space-y-4">
                  {data.approvalSales.map((s: any) => {
                    const isStockIn = s.transaction_type === 'approval_return' || s.transaction_type === 'stock_in'
                    const typeLabel = s.transaction_type === 'sale' ? 'Party Sale'
                      : s.transaction_type === 'approval' ? 'Approval'
                      : s.transaction_type === 'approval_return' ? 'Approval Return'
                      : 'Stock In'
                    return (
                      <div key={s.id} className={`border rounded-lg p-3 ${isStockIn ? 'border-red-300 bg-red-50' : 'border-gray-100'}`}>
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`text-xs font-semibold uppercase ${isStockIn ? 'text-red-700' : 'text-amber-700'}`}>{typeLabel}</span>
                          <span className="text-sm font-medium text-gray-900">{s.party_name}</span>
                        </div>
                        <table className="w-full text-xs border-collapse">
                          <thead><tr className={isStockIn ? 'bg-red-100' : 'bg-gray-50'}>
                            <th className="text-left p-1.5 font-medium">Item</th>
                            <th className="text-left p-1.5 font-medium">Metal</th>
                            <th className="text-left p-1.5 font-medium">Purity</th>
                            <th className="text-left p-1.5 font-medium">Party</th>
                            <th className="text-right p-1.5 font-medium">Weight</th>
                            <th className="text-left p-1.5 font-medium">Notes</th>
                          </tr></thead>
                          <tbody>
                            {(s.approval_sale_items ?? []).map((l: any) => (
                              <tr key={l.id} className={`border-t ${isStockIn ? 'border-red-200' : 'border-gray-100'}`}>
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
                    )
                  })}
                </div>
              </>
            )}
          </ReportSection>

          {/* Section 3 — Money Receipts */}
          <ReportSection title="Section 3 — Money Receipts">
            {data.receipts.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-2">No money receipts today.</p>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead><tr className="bg-gray-50">
                  <th className="text-left p-2 font-medium">Type</th>
                  <th className="text-left p-2 font-medium">Serial No.</th>
                  <th className="text-left p-2 font-medium">Customer</th>
                  <th className="text-left p-2 font-medium">Repair Type</th>
                  <th className="text-left p-2 font-medium">Settlement</th>
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
                      <td className="p-2">{receiptSettlementLabel(r)}</td>
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

          {/* Section 4 — Old Metal Purchases */}
          <ReportSection title="Section 4 — Old Metal Purchases">
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

          {/* Section 5 — Direct Money Receipts */}
          <ReportSection title="Section 5 — Direct Money Receipts">
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

          {/* Section 6 — Sales + Money Receipts Summary */}
          <ReportSection title="Section 6 — Sales + Money Receipts Summary">
            <SummaryTable rows={[
              ['Gold / Diamond Weight Sold', `${data.goldWeight.toFixed(3)}g`],
              ['Gold / Diamond Amount', formatCurrency(data.goldAmount)],
              ['Silver Weight Sold', `${data.silverWeight.toFixed(3)}g`],
              ['Silver Amount', formatCurrency(data.silverAmount)],
              ['Other / Misc Items', `${data.otherCount} items — ${formatCurrency(data.otherAmount)}`],
              ['Total Money Receipts', formatCurrency(data.totalAdvanceReceipts + data.totalSIPReceipts + data.totalCreditReceipts + data.totalRepairReceipts)],
              ['Old Gold Received (sales + receipts)', `${data.oldGoldWeight.toFixed(3)}g — ${formatCurrency(data.oldGoldAmount)}`],
              ['Old Silver Received (sales + receipts)', `${data.oldSilverWeight.toFixed(3)}g — ${formatCurrency(data.oldSilverAmount)}`],
            ]} />
          </ReportSection>

          {/* Section 7 — Customer Payment Mode Breakdown */}
          <ReportSection title="Section 7 — Customer Payment Mode Breakdown">
            <SummaryTable rows={[
              ['Cash', formatCurrency(data.paymentCash)],
              ['Card', formatCurrency(data.paymentCard)],
              ['UPI', formatCurrency(data.paymentUPI)],
              ['PhonePe', formatCurrency(data.paymentPhonePe)],
              ['Cheque', formatCurrency(data.paymentCheque)],
              ['Customer Credit', formatCurrency(data.paymentCredit)],
              ['Advance Adjusted', formatCurrency(data.paymentAdvance)],
              ['SIP Adjusted', formatCurrency(data.paymentSIP)],
            ]} />
          </ReportSection>

          {/* Section 8 — Payments */}
          <ReportSection title="Section 8 — Payments">
            {data.partyPayments.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-2">No payments today.</p>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead><tr className="bg-gray-50">
                  <th className="text-left p-2 font-medium">Party</th>
                  <th className="text-right p-2 font-medium">Amount</th>
                  <th className="text-left p-2 font-medium">Payment Mode</th>
                  <th className="text-left p-2 font-medium">Notes</th>
                </tr></thead>
                <tbody>
                  {data.partyPayments.map((p: any) => (
                    <tr key={p.id} className="border-t border-gray-100">
                      <td className="p-2">{p.party_name}</td>
                      <td className="p-2 text-right">{formatCurrency(p.amount)}</td>
                      <td className="p-2">{p.payment_mode === 'bank_transfer' ? 'Bank Transfer' : 'Cash'}</td>
                      <td className="p-2 text-gray-500">{p.notes ?? '—'}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-sm">
                    <td className="p-2">Total Payments</td>
                    <td className="p-2 text-right">{formatCurrency(data.totalPartyPayments)}</td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            )}
          </ReportSection>

          {/* Section 9 — Advance, SIP & Customer Credit */}
          <ReportSection title="Section 9 — Advance, SIP & Customer Credit">
            <div className="space-y-5">
              {/* 9A — Advance & SIP Adjustments */}
              <div>
                <p className="text-xs font-semibold uppercase text-amber-700 mb-2">Advance &amp; SIP Adjustments</p>
                {data.adjustments.length === 0 ? (
                  <p className="text-xs text-gray-400">No advance or SIP adjustments today.</p>
                ) : (
                  <table className="w-full text-xs border-collapse">
                    <thead><tr className="bg-gray-50">
                      <th className="text-left p-2 font-medium">Source</th>
                      <th className="text-left p-2 font-medium">Customer</th>
                      <th className="text-left p-2 font-medium">Bill / Receipt No.</th>
                      <th className="text-left p-2 font-medium">Type</th>
                      <th className="text-left p-2 font-medium">Serial No.</th>
                      <th className="text-right p-2 font-medium">Amount</th>
                    </tr></thead>
                    <tbody>
                      {data.adjustments.map((a: any, i: number) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="p-2">{a.source}</td>
                          <td className="p-2">{a.customer}</td>
                          <td className="p-2">{a.reference ?? '—'}</td>
                          <td className="p-2">{PAYMENT_MODE_LABELS[a.mode]}</td>
                          <td className="p-2 font-medium">{a.serial ?? '—'}</td>
                          <td className="p-2 text-right">{formatCurrency(a.amount)}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-sm">
                        <td colSpan={5} className="p-2">Total Adjusted</td>
                        <td className="p-2 text-right">{formatCurrency(data.adjustments.reduce((s: number, a: any) => s + a.amount, 0))}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>

              {/* 9B — Customer Credit Used */}
              <div>
                <p className="text-xs font-semibold uppercase text-amber-700 mb-2">Customer Credit Used</p>
                {data.creditEntries.length === 0 ? (
                  <p className="text-xs text-gray-400">No customer credit entries today.</p>
                ) : (() => {
                  // Group by customer name
                  const grouped: Record<string, typeof data.creditEntries> = {}
                  for (const e of data.creditEntries) {
                    if (!grouped[e.customer]) grouped[e.customer] = []
                    grouped[e.customer].push(e)
                  }
                  const grandTotal = data.creditEntries.reduce((s: number, e: any) => s + e.amount, 0)
                  return (
                    <table className="w-full text-xs border-collapse">
                      <thead><tr className="bg-gray-50">
                        <th className="text-left p-2 font-medium">Customer</th>
                        <th className="text-left p-2 font-medium">Source</th>
                        <th className="text-left p-2 font-medium">Bill / Receipt No.</th>
                        <th className="text-right p-2 font-medium">Amount</th>
                      </tr></thead>
                      <tbody>
                        {Object.entries(grouped).map(([customer, entries]) => {
                          const customerTotal = (entries as any[]).reduce((s: number, e: any) => s + e.amount, 0)
                          return (
                            <Fragment key={customer}>
                              {(entries as any[]).map((e: any, i: number) => (
                                <tr key={i} className="border-t border-gray-100">
                                  <td className="p-2">{i === 0 ? e.customer : ''}</td>
                                  <td className="p-2 text-gray-500">{e.source}</td>
                                  <td className="p-2">{e.reference ?? '—'}</td>
                                  <td className="p-2 text-right">{formatCurrency(e.amount)}</td>
                                </tr>
                              ))}
                              {(entries as any[]).length > 1 && (
                                <tr className="border-t border-amber-200 bg-amber-50">
                                  <td className="p-2 font-semibold" colSpan={3}>{customer} — Subtotal</td>
                                  <td className="p-2 text-right font-semibold">{formatCurrency(customerTotal)}</td>
                                </tr>
                              )}
                            </Fragment>
                          )
                        })}
                        <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-sm">
                          <td colSpan={3} className="p-2">Total Customer Credit</td>
                          <td className="p-2 text-right">{formatCurrency(grandTotal)}</td>
                        </tr>
                      </tbody>
                    </table>
                  )
                })()}
              </div>
            </div>
          </ReportSection>

          {/* Section 10 — Expenses */}
          <ReportSection title="Section 10 — Expenses">
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

          {/* Section 11 — Cash Register Summary */}
          <ReportSection title="Section 11 — Cash Register Summary">
            <SummaryTable rows={[
              ['Register A — Opening Balance', formatCurrency(data.session.register_a_opening)],
              ['Register B — Opening Balance', formatCurrency(data.session.register_b_opening)],
              ['Combined Opening Balance', formatCurrency(data.opening)],
              ['Cash from Sales', formatCurrency(data.cashSales)],
              ['Cash from Money Receipts', formatCurrency(data.cashReceipts)],
              ['Cash from Direct Receipts', formatCurrency(data.cashDirectIn)],
              ['Cash Expenses', `− ${formatCurrency(data.cashExpenses)}`],
              ['Cash Old Metal Purchases', `− ${formatCurrency(data.cashOldGoldOut)}`],
              ['Cash Payments to Parties', `− ${formatCurrency(data.cashPartyPayOut)}`],
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

      {showStockSheet && data && (
        <StockSheetModal data={data} date={reportDate} onClose={() => setShowStockSheet(false)} />
      )}
    </div>
  )
}

function StockSheetModal({ data, date, onClose }: { data: any; date: string; onClose: () => void }) {
  // Collect all items across the four categories
  const orderInItems = (data.bills ?? []).flatMap((b: any) =>
    (b.sales_line_items ?? []).map((l: any) => ({
      item_name: l.item_name, party: l.party ?? '—', purity: l.purity ?? '—',
      weight: l.weight, metal_type: l.metal_type, order_in: !!l.order_in, _cat: 'Sales Register',
    }))
  )

  const fromApproval = (type: string, label: string) =>
    (data.approvalSales ?? [])
      .filter((s: any) => s.transaction_type === type)
      .flatMap((s: any) => (s.approval_sale_items ?? []).map((l: any) => ({
        item_name: l.item_name, party: s.party_name, purity: l.purity ?? '—',
        weight: l.weight, metal_type: l.metal_type, _cat: label,
      })))

  const approvalItems   = fromApproval('approval', 'Approval')
  const partySaleItems  = fromApproval('sale', 'Party Sale')
  const stockInItems    = [
    ...fromApproval('stock_in', 'Stock In'),
    ...fromApproval('approval_return', 'Approval Return'),
  ]

  const categories = [
    { label: 'Sales Register', items: orderInItems },
    { label: 'Approval', items: approvalItems },
    { label: 'Party Sale', items: partySaleItems },
    { label: 'Stock In / Approval Return', items: stockInItems },
  ].filter(c => c.items.length > 0)

  const metalGroup = (items: any[]) => {
    const gold    = items.filter((l: any) => l.metal_type === 'gold' && l.purity !== 'Diamond').sort((a: any, b: any) => a.item_name.localeCompare(b.item_name))
    const diamond = items.filter((l: any) => l.purity === 'Diamond').sort((a: any, b: any) => a.item_name.localeCompare(b.item_name))
    const silver  = items.filter((l: any) => l.metal_type === 'silver').sort((a: any, b: any) => a.item_name.localeCompare(b.item_name))
    return { gold, diamond, silver }
  }

  const fmtDate = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl w-full max-w-2xl my-8 shadow-2xl">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Stock Update Sheet</h2>
            <p className="text-xs text-gray-400 mt-0.5">{fmtDate(date)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
        </div>

        <div className="p-5 space-y-6 max-h-[80vh] overflow-y-auto">
          {categories.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">No stock update items today.</p>
          )}

          {categories.map(cat => {
            const { gold, diamond, silver } = metalGroup(cat.items)
            const metals = [
              { label: 'Gold', rows: gold },
              { label: 'Diamond', rows: diamond },
              { label: 'Silver', rows: silver },
            ].filter(m => m.rows.length > 0)

            return (
              <div key={cat.label}>
                <div className="bg-amber-600 px-3 py-1.5 rounded-lg mb-3">
                  <h3 className="text-white font-semibold text-sm">{cat.label}</h3>
                </div>
                <div className="space-y-4">
                  {metals.map(({ label, rows }) => (
                    <div key={label}>
                      <p className="text-xs font-semibold uppercase text-amber-700 mb-1.5">{label}</p>
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="text-left p-2 font-medium">Item</th>
                            <th className="text-left p-2 font-medium">Party</th>
                            <th className="text-left p-2 font-medium">Purity</th>
                            <th className="text-right p-2 font-medium">Weight</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r: any, i: number) => (
                            <tr key={i} className={`border-t ${r.order_in ? 'bg-sky-50 border-sky-200' : 'border-gray-100'}`}>
                              <td className="p-2 font-medium text-gray-900">
                                {r.item_name}
                                {r.order_in && <span className="ml-1.5 text-[10px] font-semibold text-sky-700 bg-sky-200 border border-sky-300 px-1.5 py-0.5 rounded-full">Order In</span>}
                              </td>
                              <td className="p-2 text-gray-600">{r.party}</td>
                              <td className="p-2 text-gray-600">{r.purity}</td>
                              <td className="p-2 text-right text-gray-800">{r.weight ? `${r.weight}g` : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

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
  const metalValue = rateInfo ? rateInfo.rate * weight : null
  const makingPct = metalValue && metalValue > 0 && billedAmount > 0
    ? ((billedAmount / (metalValue * 1.03)) - 1) * 100
    : null

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs space-y-1.5 mt-1 mb-1">
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold text-amber-800 text-[11px] uppercase tracking-wide">Rate Check — {item.item_name}</span>
        <button onClick={onClose} className="text-amber-400 hover:text-amber-700 font-bold text-sm leading-none">×</button>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
        <span className="text-gray-500">Weight</span>
        <span className="font-medium text-gray-900">{weight}g</span>

        <span className="text-gray-500">Rate ({rateInfo ? rateInfo.label : (item.purity ?? item.metal_type)})</span>
        <span className="font-medium text-gray-900">
          {rateInfo
            ? `₹${rateInfo.rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}/g`
            : <span className="text-red-500">No rate saved for this date</span>}
        </span>

        {metalValue != null && <>
          <span className="text-gray-500">Metal value</span>
          <span className="font-medium text-gray-900">{formatCurrency(metalValue)}</span>
        </>}

        <span className="text-gray-500">Billed amount</span>
        <span className="font-medium text-gray-900">{formatCurrency(billedAmount)}</span>

        {makingPct != null && <>
          <span className="text-gray-500">Making charge (back-calc)</span>
          <span className="font-semibold text-amber-700">{makingPct.toFixed(2)}%</span>
        </>}
      </div>
      {!rateInfo && rates && item.metal_type !== 'other' && (
        <p className="text-gray-400 italic pt-1">No {item.purity ?? item.metal_type} rate saved for this date.</p>
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
      <div className="p-4 overflow-x-auto">{children}</div>
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
