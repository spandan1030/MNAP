import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'

export default async function AdminDashboard() {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: session } = await supabase.from('day_sessions').select('*').eq('date', today).single()

  let liveCash = 0
  let pendingCount = 0
  let todaySales = 0
  let todayExpenses = 0
  let todayReceipts = 0
  let todayDirectReceipts = 0
  let todayPayments = 0

  if (session) {
    const opening = (session.register_a_opening ?? 0) + (session.register_b_opening ?? 0)

    const [salesRes, billsRes, receiptsRes, expensesRes, ogpRes, drRes, ppRes] = await Promise.all([
      supabase.from('sales_payments').select('amount, payment_mode, sales_bills!inner(day_session_id, status)')
        .eq('sales_bills.day_session_id', session.id).neq('sales_bills.status', 'rejected'),
      supabase.from('sales_bills').select('total_amount').eq('day_session_id', session.id).neq('status', 'rejected'),
      supabase.from('money_receipts').select('amount, payment_mode, old_gold_amount, old_silver_amount').eq('day_session_id', session.id).neq('status', 'rejected'),
      supabase.from('expenses').select('amount, payment_type').eq('day_session_id', session.id).neq('status', 'rejected'),
      supabase.from('old_gold_purchases').select('total_amount, payment_mode').eq('day_session_id', session.id).neq('status', 'rejected'),
      supabase.from('direct_receipts').select('amount, payment_mode').eq('day_session_id', session.id).neq('status', 'rejected'),
      supabase.from('party_payments').select('amount, payment_mode').eq('day_session_id', session.id).neq('status', 'rejected'),
    ])

    const cashIn = (salesRes.data ?? []).filter((p: any) => p.payment_mode === 'cash').reduce((s: number, p: any) => s + p.amount, 0)
    const receiptCashIn = (receiptsRes.data ?? []).filter((r: any) => r.payment_mode === 'cash').reduce((s: number, r: any) => s + r.amount - (r.old_gold_amount ?? 0) - (r.old_silver_amount ?? 0), 0)
    const cashOut = (expensesRes.data ?? []).filter((e: any) => e.payment_type === 'cash').reduce((s: number, e: any) => s + e.amount, 0)
    const cashOgpOut = (ogpRes.data ?? []).filter((p: any) => p.payment_mode === 'cash').reduce((s: number, p: any) => s + p.total_amount, 0)
    const cashDrIn = (drRes.data ?? []).filter((r: any) => r.payment_mode === 'cash').reduce((s: number, r: any) => s + r.amount, 0)
    const cashPpOut = (ppRes.data ?? []).filter((p: any) => p.payment_mode === 'cash').reduce((s: number, p: any) => s + p.amount, 0)

    liveCash = opening + cashIn + receiptCashIn + cashDrIn - cashOut - cashOgpOut - cashPpOut
    todaySales = (billsRes.data ?? []).reduce((s: number, b: any) => s + b.total_amount, 0)
    todayExpenses = (expensesRes.data ?? []).reduce((s: number, e: any) => s + e.amount, 0)
    todayReceipts = (receiptsRes.data ?? []).reduce((s: number, r: any) => s + r.amount, 0)
    todayDirectReceipts = (drRes.data ?? []).reduce((s: number, r: any) => s + r.amount, 0)
    todayPayments = (ppRes.data ?? []).reduce((s: number, p: any) => s + p.amount, 0)

    const [b, r, e, og, dr, pp] = await Promise.all([
      supabase.from('sales_bills').select('id', { count: 'exact' }).eq('day_session_id', session.id).eq('status', 'pending'),
      supabase.from('money_receipts').select('id', { count: 'exact' }).eq('day_session_id', session.id).eq('status', 'pending'),
      supabase.from('expenses').select('id', { count: 'exact' }).eq('day_session_id', session.id).eq('status', 'pending'),
      supabase.from('old_gold_purchases').select('id', { count: 'exact' }).eq('day_session_id', session.id).eq('status', 'pending'),
      supabase.from('direct_receipts').select('id', { count: 'exact' }).eq('day_session_id', session.id).eq('status', 'pending'),
      supabase.from('party_payments').select('id', { count: 'exact' }).eq('day_session_id', session.id).eq('status', 'pending'),
    ])
    pendingCount = (b.count ?? 0) + (r.count ?? 0) + (e.count ?? 0) + (og.count ?? 0) + (dr.count ?? 0) + (pp.count ?? 0)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        {!session ? (
          <Link href="/admin/day" className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            Open Day
          </Link>
        ) : session.status === 'open' ? (
          <Link href="/admin/day" className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            Close Day
          </Link>
        ) : (
          <span className="text-sm text-gray-500 bg-gray-100 px-3 py-2 rounded-lg">Day Closed</span>
        )}
      </div>

      {!session && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm">
          No day session open today. Go to <Link href="/admin/day" className="font-semibold underline">Day Register</Link> to open the day.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Live Cash In Hand" value={formatCurrency(liveCash)} highlight />
        <StatCard label="Pending Reviews" value={pendingCount.toString()} alert={pendingCount > 0} />
        <StatCard label="Today's Sales" value={formatCurrency(todaySales)} />
        <StatCard label="Today's Expenses" value={formatCurrency(todayExpenses)} />
        <StatCard label="Today's Money Receipts" value={formatCurrency(todayReceipts)} />
        <StatCard label="Today's Direct Receipts" value={formatCurrency(todayDirectReceipts)} />
        <StatCard label="Today's Payments" value={formatCurrency(todayPayments)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <QuickLink href="/admin/qc" title="QC Review" desc={`${pendingCount} entries awaiting approval`} color="amber" />
        <QuickLink href="/admin/reports" title="End-of-Day Report" desc="Generate and export PDF report" color="green" />
        <QuickLink href="/admin/day" title="Day Register" desc="Open or close today's session" color="blue" />
        <QuickLink href="/admin/items" title="Item Master" desc="Manage jewellery item list" color="purple" />
        <QuickLink href="/admin/archival" title="Archival" desc="View all entries across all modules" color="gray" />
      </div>
    </div>
  )
}

function StatCard({ label, value, highlight, alert }: { label: string; value: string; highlight?: boolean; alert?: boolean }) {
  return (
    <div className={`rounded-xl p-4 border ${highlight ? 'bg-amber-50 border-amber-200' : alert ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${highlight ? 'text-amber-700' : alert ? 'text-red-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

function QuickLink({ href, title, desc, color }: { href: string; title: string; desc: string; color: string }) {
  const colors: Record<string, string> = {
    amber: 'hover:bg-amber-50 border-amber-100',
    green: 'hover:bg-green-50 border-green-100',
    blue: 'hover:bg-blue-50 border-blue-100',
    purple: 'hover:bg-purple-50 border-purple-100',
    gray: 'hover:bg-gray-50 border-gray-200',
  }
  return (
    <Link href={href} className={`block bg-white rounded-xl border p-4 transition-colors ${colors[color]}`}>
      <p className="font-semibold text-gray-900">{title}</p>
      <p className="text-sm text-gray-500 mt-0.5">{desc}</p>
    </Link>
  )
}
