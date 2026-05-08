import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function StaffHome() {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: session } = await supabase
    .from('day_sessions').select('status').eq('date', today).eq('status', 'open').single()

  const { data: { user } } = await supabase.auth.getUser()

  const [bills, receipts, expenses, ogPurchases, drReceipts, partyPayments, approvalSales] = await Promise.all([
    supabase.from('sales_bills').select('id, bill_number, total_amount, status, submitted_at').eq('submitted_by', user!.id).order('submitted_at', { ascending: false }).limit(5),
    supabase.from('money_receipts').select('id, receipt_type, amount, status, submitted_at').eq('submitted_by', user!.id).order('submitted_at', { ascending: false }).limit(5),
    supabase.from('expenses').select('id, description, amount, status, submitted_at').eq('submitted_by', user!.id).order('submitted_at', { ascending: false }).limit(5),
    supabase.from('old_gold_purchases').select('id, customer_name, total_amount, status, submitted_at').eq('submitted_by', user!.id).order('submitted_at', { ascending: false }).limit(5),
    supabase.from('direct_receipts').select('id, customer_name, amount, status, submitted_at').eq('submitted_by', user!.id).order('submitted_at', { ascending: false }).limit(5),
    supabase.from('party_payments').select('id, party_name, amount, status, submitted_at').eq('submitted_by', user!.id).order('submitted_at', { ascending: false }).limit(5),
    supabase.from('approval_sales').select('id, party_name, transaction_type, status, submitted_at').eq('submitted_by', user!.id).order('submitted_at', { ascending: false }).limit(5),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Staff Portal</h1>
        <p className="text-sm text-gray-500">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>

      {!session && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm">
          Day is not open yet. Please wait for admin to open the day before submitting entries.
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <ActionCard href="/staff/sales" label="New Sale" icon="🏷️" />
        <ActionCard href="/staff/receipts" label="Money Receipt" icon="💰" />
        <ActionCard href="/staff/expenses" label="Expense" icon="📋" />
        <ActionCard href="/staff/old-gold-purchase" label="Old Gold" icon="🥇" />
        <ActionCard href="/staff/direct-receipt" label="Direct Receipt" icon="📥" />
        <ActionCard href="/staff/payments" label="Payment" icon="💸" />
        <ActionCard href="/staff/approval-sales" label="Approval" icon="🤝" />
      </div>

      <div className="space-y-4">
        <RecentList title="Recent Sales" items={(bills.data ?? []).map(b => ({
          id: b.id, label: `Bill #${b.bill_number}`, value: `₹${b.total_amount}`, status: b.status, time: b.submitted_at
        }))} />
        <RecentList title="Recent Money Receipts" items={(receipts.data ?? []).map(r => ({
          id: r.id, label: r.receipt_type.charAt(0).toUpperCase() + r.receipt_type.slice(1), value: `₹${r.amount}`, status: r.status, time: r.submitted_at
        }))} />
        <RecentList title="Recent Old Gold Purchases" items={(ogPurchases.data ?? []).map(p => ({
          id: p.id, label: p.customer_name, value: `₹${p.total_amount}`, status: p.status, time: p.submitted_at
        }))} />
        <RecentList title="Recent Direct Receipts" items={(drReceipts.data ?? []).map(r => ({
          id: r.id, label: r.customer_name, value: `₹${r.amount}`, status: r.status, time: r.submitted_at
        }))} />
        <RecentList title="Recent Expenses" items={(expenses.data ?? []).map(e => ({
          id: e.id, label: e.description, value: `₹${e.amount}`, status: e.status, time: e.submitted_at
        }))} />
        <RecentList title="Recent Payments" items={(partyPayments.data ?? []).map(p => ({
          id: p.id, label: p.party_name, value: `₹${p.amount}`, status: p.status, time: p.submitted_at
        }))} />
        <RecentList title="Recent Approvals / Party Sales" items={(approvalSales.data ?? []).map(s => ({
          id: s.id, label: s.party_name, value: s.transaction_type === 'sale' ? 'Sale' : 'Approval', status: s.status, time: s.submitted_at
        }))} />
      </div>
    </div>
  )
}

function ActionCard({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <Link href={href} className="bg-white rounded-xl border border-gray-200 hover:border-amber-300 p-4 text-center transition-colors block">
      <div className="text-2xl mb-1">{icon}</div>
      <p className="text-sm font-semibold text-gray-700">{label}</p>
    </Link>
  )
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  edited: 'bg-blue-100 text-blue-800',
}

function RecentList({ title, items }: { title: string; items: { id: string; label: string; value: string; status: string; time: string }[] }) {
  if (!items.length) return null
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="font-semibold text-gray-800 text-sm mb-3">{title}</h3>
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id} className="flex items-center justify-between text-sm">
            <span className="text-gray-700 truncate max-w-[50%]">{item.label}</span>
            <div className="flex items-center gap-2">
              <span className="text-gray-600 font-medium">{item.value}</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[item.status] ?? ''}`}>{item.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
