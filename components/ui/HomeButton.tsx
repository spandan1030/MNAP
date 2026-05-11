'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function HomeButton({ href }: { href: string }) {
  const pathname = usePathname()
  if (pathname === href) return null
  return (
    <div className="mb-4">
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 text-sm text-amber-700 hover:text-amber-900 font-medium"
      >
        ← Home
      </Link>
    </div>
  )
}
