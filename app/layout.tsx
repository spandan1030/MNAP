import type { Metadata } from 'next'
import './globals.css'
import { FormBehavior } from '@/components/ui/FormBehavior'

export const metadata: Metadata = {
  title: 'M N Alankar Palace',
  description: 'Daily Management System',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased min-h-screen">
        <FormBehavior />
        {children}
      </body>
    </html>
  )
}
