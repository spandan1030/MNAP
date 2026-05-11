'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDateTime } from '@/lib/utils'

// ─── FUTURE GOOGLE SHEETS INTEGRATION ───────────────────────────────────────
// When ready to auto-fetch rates from Google Sheets:
// 1. Store your Sheet ID + cell mappings (e.g. A1=24KT, A2=22KT, A3=18KT, A4=Silver)
//    in environment variables: NEXT_PUBLIC_SHEETS_ID, SHEETS_API_KEY
// 2. Create a helper fetchRatesFromSheets() that calls:
//    https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/{RANGE}?key={API_KEY}
// 3. Call upsertRates({ ...parsedRates, source: 'google_sheets' }) — same function used below.
// 4. Wire it to a "Sync from Sheets" button or a server-side cron (Vercel Cron Jobs).
// The DB + upsert logic needs zero changes; only the data source changes.
// ────────────────────────────────────────────────────────────────────────────

interface RateForm {
  rate_24kt: string
  rate_22kt: string
  rate_18kt: string
  rate_silver: string
}

const RATE_LABELS: { key: keyof RateForm; label: string; sub: string }[] = [
  { key: 'rate_24kt',   label: '24 KT',  sub: 'Gold (per gram)' },
  { key: 'rate_22kt',   label: '22 KT',  sub: 'Gold (per gram)' },
  { key: 'rate_18kt',   label: '18 KT',  sub: 'Gold (per gram)' },
  { key: 'rate_silver', label: 'Silver', sub: 'Silver (per gram)' },
]

export default function RatesPage() {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]

  const [form, setForm] = useState<RateForm>({ rate_24kt: '', rate_22kt: '', rate_18kt: '', rate_silver: '' })
  const [currentRate, setCurrentRate] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadRates() }, [])

  async function loadRates() {
    const [todayRes, historyRes] = await Promise.all([
      supabase.from('daily_rates').select('*, updater:updated_by(name)').eq('date', today).maybeSingle(),
      supabase.from('daily_rates').select('*, updater:updated_by(name)').order('date', { ascending: false }).limit(14),
    ])

    const r = todayRes.data
    setCurrentRate(r ?? null)
    setForm({
      rate_24kt:   r?.rate_24kt   != null ? String(r.rate_24kt)   : '',
      rate_22kt:   r?.rate_22kt   != null ? String(r.rate_22kt)   : '',
      rate_18kt:   r?.rate_18kt   != null ? String(r.rate_18kt)   : '',
      rate_silver: r?.rate_silver != null ? String(r.rate_silver) : '',
    })
    setHistory(historyRes.data ?? [])
  }

  async function upsertRates(values: RateForm, source: 'manual' | 'google_sheets' = 'manual') {
    const { data: { user } } = await supabase.auth.getUser()
    const payload = {
      date: today,
      rate_24kt:   values.rate_24kt   !== '' ? parseFloat(values.rate_24kt)   : null,
      rate_22kt:   values.rate_22kt   !== '' ? parseFloat(values.rate_22kt)   : null,
      rate_18kt:   values.rate_18kt   !== '' ? parseFloat(values.rate_18kt)   : null,
      rate_silver: values.rate_silver !== '' ? parseFloat(values.rate_silver) : null,
      source,
      updated_by: user!.id,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase
      .from('daily_rates')
      .upsert(payload, { onConflict: 'date' })
    return error
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setSaving(true)
    const err = await upsertRates(form, 'manual')
    if (err) { setError(err.message); setSaving(false); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    setSaving(false)
    loadRates()
  }

  function fmt(val: number | null) {
    if (val == null) return '—'
    return '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const displayDate = new Date(today + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Daily Rates</h1>
        <p className="text-sm text-gray-500 mt-1">Set today&apos;s gold &amp; silver rates. Staff can reference these while entering bills.</p>
      </div>

      {/* Today's rate form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">Today — {displayDate}</h2>
            {currentRate && (
              <p className="text-xs text-gray-400 mt-0.5">
                Last updated {formatDateTime(currentRate.updated_at)}
                {currentRate.updater?.name ? ` by ${currentRate.updater.name}` : ''}
                {' · '}
                <span className={`font-medium ${currentRate.source === 'google_sheets' ? 'text-green-600' : 'text-gray-500'}`}>
                  {currentRate.source === 'google_sheets' ? 'Auto-fetched from Sheets' : 'Manual entry'}
                </span>
              </p>
            )}
          </div>
          {saved && (
            <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-3 py-1 rounded-full">
              ✓ Saved
            </span>
          )}
        </div>

        <form onSubmit={handleSave}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            {RATE_LABELS.map(({ key, label, sub }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {label}
                  <span className="block text-gray-400 font-normal">{sub}</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                  <input
                    type="number" min="0" step="0.01"
                    value={form[key]}
                    onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder="0.00"
                    className="input pl-7 text-right font-mono"
                  />
                </div>
              </div>
            ))}
          </div>

          {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

          <button type="submit" disabled={saving}
            className="bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white font-semibold px-6 py-2 rounded-lg text-sm transition-colors">
            {saving ? 'Saving…' : 'Save Today\'s Rates'}
          </button>
        </form>
      </div>

      {/* Rate history */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-amber-600 px-5 py-2.5">
          <h3 className="text-white font-semibold text-sm">Rate History (Last 14 Days)</h3>
        </div>
        <div className="overflow-x-auto">
          {history.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No rates recorded yet.</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="p-3 font-medium text-gray-600">Date</th>
                  <th className="p-3 font-medium text-gray-600 text-right">24 KT</th>
                  <th className="p-3 font-medium text-gray-600 text-right">22 KT</th>
                  <th className="p-3 font-medium text-gray-600 text-right">18 KT</th>
                  <th className="p-3 font-medium text-gray-600 text-right">Silver</th>
                  <th className="p-3 font-medium text-gray-600">Source</th>
                  <th className="p-3 font-medium text-gray-600">Updated by</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r: any) => (
                  <tr key={r.id} className={`border-t border-gray-100 ${r.date === today ? 'bg-amber-50' : ''}`}>
                    <td className="p-3 font-medium text-gray-900">
                      {new Date(r.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      {r.date === today && <span className="ml-2 text-xs bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded">Today</span>}
                    </td>
                    <td className="p-3 text-right font-mono text-gray-800">{fmt(r.rate_24kt)}</td>
                    <td className="p-3 text-right font-mono text-gray-800">{fmt(r.rate_22kt)}</td>
                    <td className="p-3 text-right font-mono text-gray-800">{fmt(r.rate_18kt)}</td>
                    <td className="p-3 text-right font-mono text-gray-800">{fmt(r.rate_silver)}</td>
                    <td className="p-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.source === 'google_sheets' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {r.source === 'google_sheets' ? 'Sheets' : 'Manual'}
                      </span>
                    </td>
                    <td className="p-3 text-gray-500 text-xs">{r.updater?.name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
