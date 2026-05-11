import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Navbar } from '@/components/ui/Navbar'
import { HomeButton } from '@/components/ui/HomeButton'

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, name')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar role={profile.role as 'admin' | 'staff'} userName={profile.name} />
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6">
        <HomeButton href="/staff" />
        {children}
      </main>
    </div>
  )
}
