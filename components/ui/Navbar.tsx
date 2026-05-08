'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
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
  { href: '/admin/items', label: 'Item Master' },
]

const staffLinks: NavItem[] = [
  { href: '/staff', label: 'Home' },
  { href: '/staff/sales', label: 'New Sale' },
  { href: '/staff/receipts', label: 'Money Receipt' },
  { href: '/staff/expenses', label: 'Expense' },
]

export function Navbar({ role, userName }: NavbarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const links = role === 'admin' ? adminLinks : staffLinks

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className="bg-amber-800 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <span className="font-bold text-amber-100 text-sm tracking-wide">M N Alankar Palace</span>
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
          <span className="text-amber-200 text-xs">{userName}</span>
          <span className="text-amber-400 text-xs capitalize bg-amber-900 px-2 py-0.5 rounded">{role}</span>
          <button
            onClick={handleLogout}
            className="text-xs text-amber-200 hover:text-white border border-amber-600 hover:border-amber-400 px-2 py-1 rounded transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  )
}
