'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDateTime } from '@/lib/utils'

interface RateForm {
  rate_24kt: string
  rate_22kt: string
  rate_18kt: string
  rate_silver: string
}

const EMPTY_FORM: RateForm = { rate_24kt: '', rate_22kt: '', rate_18kt: '', rate_silver: '' }

const RATE_LABELS: { key: keyof RateForm; label: string; sub: string }[] = [
  { key: 'rate_24kt',   label: '24 KT',  sub: 'Gold / gram' },
  { key: 'rate_22kt',   label: '22 KT',  sub: 'Gold / gram' },
  { key: 'rate_18kt',   label: '18 KT',  sub: 'Gold / gram' },
  { key: 'rate_silver', label: 'Silver', sub: 'Silver / gram' },
]

function fmt(val: number | null) {
  if (val == null) return '—'
  return '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function rateToForm(r: any): RateForm {
  return {
    rate_24kt:   r?.rate_24kt   != null ? String(r.rate_24kt)   : '',
    rate_22kt:   r?.rate_22kt   != null ? String(r.rate_22kt)   : '',
    rate_18kt:   r?.rate_18kt   != null ? String(r.rate_18kt)   : '',
    rate_silver: r?.rate_silver != null ? String(r.rate_silver) : '',
  }
}

export default function RatesPage() {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]

  const [selectedDate, setSelectedDate] = useState(today)
  const [form, setForm] = useState<RateForm>(EMPTY_FORM)
  const [selectedRate, setSelectedRate] = useState<any>(null)   // row for selected date
  const [history, setHistory] = useState<any[]>([])             // all stored rows, newest first
  const [loadingDate, setLoadingDate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // Load history once on mount
  useEffect(() => { loadHistory() }, [])

  // Reload selected-date row whenever date changes
  useEffect(() => { loadSelectedDate() }, [selectedDate])

  async function loadHistory() {
    const { data } = await supabase
      .from('daily_rates')
      .select('*, updater:updated_by(name)')
      .order('date', { ascending: false })
    setHistory(data ?? [])
  }

  async function loadSelectedDate() {
    setLoadingDate(true)
    const { data } = await supabase
      .from('daily_rates')
      .select('*, updater:updated_by(name)')
      .eq('date', selectedDate)
      .maybeSingle()
    setSelectedRate(data ?? null)
    setForm(data ? rateToForm(data) : EMPTY_FORM)
    setLoadingDate(false)
  }

  // Single upsert function — called by manual save and (future) Sheets sync
  async function upsertRates(date: string, values: RateForm, source: 'manual' | 'google_sheets' = 'manual') {
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('daily_rates').upsert({
      date,
      rate_24kt:   values.rate_24kt   !== '' ? parseFloat(values.rate_24kt)   : null,
      rate_22kt:   values.rate_22kt   !== '' ? parseFloat(values.rate_22kt)   : null,
      rate_18kt:   values.rate_18kt   !== '' ? parseFloat(values.rate_18kt)   : null,
      rate_silver: values.rate_silver !== '' ? parseFloat(values.rate_silver) : null,
      source,
      updated_by: user!.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'date' })
    return error
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setSaving(true)
    const err = await upsertRates(selectedDate, form, 'manual')
    if (err) { setError(err.message); setSaving(false); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    setSaving(false)
    // Refresh both the selected-date view and the history list
    await Promise.all([loadSelectedDate(), loadHistory()])
  }

  const isToday = selectedDate === today

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Daily Rates</h1>
          <p className="text-sm text-gray-500 mt-1">View or set gold &amp; silver rates for any date.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-600">Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => { setSaved(false); setError(''); setSelectedDate(e.target.value) }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          {!isToday && (
            <button
              onClick={() => setSelectedDate(today)}
              className="text-xs text-amber-700 hover:text-amber-900 font-medium underline underline-offset-2"
            >
              Back to today
            </button>
          )}
        </div>
      </div>

      {/* Rate card for selected date */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h2 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">
              {isToday ? `Today — ${fmtDate(today)}` : fmtDate(selectedDate)}
              {!isToday && <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full normal-case">Viewing past date</span>}
            </h2>
            {selectedRate ? (
              <p className="text-xs text-gray-400 mt-0.5">
                Last updated {formatDateTime(selectedRate.updated_at)}
                {selectedRate.updater?.name ? ` by ${selectedRate.updater.name}` : ''}
                {' · '}
                <span className={`font-medium ${selectedRate.source === 'google_sheets' ? 'text-green-600' : 'text-gray-500'}`}>
                  {selectedRate.source === 'google_sheets' ? 'Auto-fetched from Sheets' : 'Manual entry'}
                </span>
              </p>
            ) : !loadingDate ? (
              <p className="text-xs text-gray-400 mt-0.5">No rates recorded for this date yet.</p>
            ) : null}
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
                    disabled={loadingDate}
                  />
                </div>
              </div>
            ))}
          </div>

          {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

          <button type="submit" disabled={saving || loadingDate}
            className="bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white font-semibold px-6 py-2 rounded-lg text-sm transition-colors">
            {saving ? 'Saving…' : selectedRate ? 'Update Rates' : 'Save Rates'}
          </button>
        </form>
      </div>

      {/* Full rate history */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-amber-600 px-5 py-2.5 flex items-center justify-between">
          <h3 className="text-white font-semibold text-sm">Rate History — All Dates</h3>
          <span className="text-amber-200 text-xs">{history.length} {history.length === 1 ? 'entry' : 'entries'} · click any row to load</span>
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
                  <th className="p-3 font-medium text-gray-600">Updated at</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r: any) => {
                  const isSelected = r.date === selectedDate
                  const isHistoryToday = r.date === today
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedDate(r.date)}
                      className={`border-t border-gray-100 cursor-pointer transition-colors
                        ${isSelected ? 'bg-amber-100 hover:bg-amber-100' : isHistoryToday ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-gray-50'}`}
                    >
                      <td className="p-3 font-medium text-gray-900">
                        {fmtDate(r.date)}
                        {isHistoryToday && <span className="ml-2 text-xs bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded">Today</span>}
                        {isSelected && !isHistoryToday && <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Viewing</span>}
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
                      <td className="p-3 text-gray-400 text-xs">{formatDateTime(r.updated_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
