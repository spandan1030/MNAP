'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Item { id: string; name: string; is_active: boolean }

export default function ItemMasterPage() {
  const supabase = createClient()
  const [items, setItems] = useState<Item[]>([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => { fetchItems() }, [])

  async function fetchItems() {
    const { data } = await supabase.from('item_master').select('*').order('name')
    setItems(data ?? [])
    setLoading(false)
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    const { error } = await supabase.from('item_master').insert({ name: newName.trim() })
    if (error) { setMessage(error.message) }
    else { setMessage(`"${newName}" added.`); setNewName(''); await fetchItems() }
    setSaving(false)
    setTimeout(() => setMessage(''), 3000)
  }

  async function toggleActive(item: Item) {
    await supabase.from('item_master').update({ is_active: !item.is_active }).eq('id', item.id)
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: !i.is_active } : i))
  }

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Item Master</h1>

      <form onSubmit={addItem} className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-800 mb-3 text-sm">Add New Item</h3>
        <div className="flex gap-2">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Item name (e.g. Necklace)"
            className="input flex-1" required />
          <button type="submit" disabled={saving} className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">
            {saving ? '…' : 'Add'}
          </button>
        </div>
        {message && <p className="mt-2 text-sm text-green-600">{message}</p>}
      </form>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        <div className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {items.length} Items
        </div>
        {loading ? (
          <div className="p-5 text-sm text-gray-400">Loading…</div>
        ) : items.map(item => (
          <div key={item.id} className="px-5 py-3 flex items-center justify-between">
            <span className={`text-sm font-medium ${item.is_active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
              {item.name}
            </span>
            <button onClick={() => toggleActive(item)}
              className={`text-xs font-medium px-3 py-1 rounded-full border transition-colors ${item.is_active
                ? 'bg-green-50 text-green-700 border-green-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200'
                : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-green-50 hover:text-green-700 hover:border-green-200'}`}>
              {item.is_active ? 'Active' : 'Inactive'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
