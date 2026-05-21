'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface NavItem { href: string; label: string }

interface NavbarProps {
  role: 'admin' | 'staff'
  userName: string
}

const adminLinks: NavItem[] = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/qc', label: 'QC Review' },
  { href: '/admin/day', label: 'Day Register' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/range-report', label: 'Range Report' },
  { href: '/admin/archival', label: 'Archival' },
  { href: '/admin/items', label: 'Item Master' },
  { href: '/admin/rates', label: 'Rates' },
]

const staffLinks: NavItem[] = [
  { href: '/staff', label: 'Home' },
  { href: '/staff/sales', label: 'New Sale' },
  { href: '/staff/receipts', label: 'Money Receipt' },
  { href: '/staff/expenses', label: 'Expense' },
  { href: '/staff/old-gold-purchase', label: 'Old Metal' },
  { href: '/staff/direct-receipt', label: 'Direct Cash Receipt' },
  { href: '/staff/payments', label: 'Payment' },
  { href: '/staff/approval-sales', label: 'Approval' },
]

export function Navbar({ role, userName }: NavbarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const links = role === 'admin' ? adminLinks : staffLinks
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className="bg-amber-800 text-white shadow-md relative z-50">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <span className="font-bold text-amber-100 text-sm tracking-wide">M N Alankar Palace</span>
          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-1">
            {links.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  pathname === link.href
                    ? 'bg-amber-700 text-white'
                    : 'text-amber-100 hover:bg-amber-700 hover:text-white'
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-amber-200 text-xs hidden sm:inline">{userName}</span>
          <span className="text-amber-400 text-xs capitalize bg-amber-900 px-2 py-0.5 rounded hidden sm:inline">{role}</span>
          <button
            onClick={handleLogout}
            className="text-xs text-amber-200 hover:text-white border border-amber-600 hover:border-amber-400 px-2 py-1 rounded transition-colors"
          >
            Logout
          </button>
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="md:hidden flex flex-col justify-center items-center w-8 h-8 gap-1.5"
            aria-label="Toggle menu"
          >
            <span className={cn('block w-5 h-0.5 bg-amber-100 transition-transform duration-200', menuOpen && 'translate-y-2 rotate-45')} />
            <span className={cn('block w-5 h-0.5 bg-amber-100 transition-opacity duration-200', menuOpen && 'opacity-0')} />
            <span className={cn('block w-5 h-0.5 bg-amber-100 transition-transform duration-200', menuOpen && '-translate-y-2 -rotate-45')} />
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden absolute top-14 left-0 right-0 bg-amber-900 border-t border-amber-700 shadow-lg">
          <div className="px-3 py-2 border-b border-amber-700 flex items-center justify-between">
            <span className="text-amber-200 text-xs">{userName}</span>
            <span className="text-amber-400 text-xs capitalize bg-amber-800 px-2 py-0.5 rounded">{role}</span>
          </div>
          <div className="py-2">
            {links.map(link => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  'block px-4 py-2.5 text-sm font-medium transition-colors',
                  pathname === link.href
                    ? 'bg-amber-700 text-white'
                    : 'text-amber-100 hover:bg-amber-700 hover:text-white'
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  )
}
