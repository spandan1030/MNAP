'use client'

import { createContext, useContext } from 'react'

interface StaffSession {
  sessionId: string | null
  userId: string | null
}

const StaffSessionContext = createContext<StaffSession>({ sessionId: null, userId: null })

export function StaffSessionProvider({
  sessionId, userId, children,
}: {
  sessionId: string | null
  userId: string
  children: React.ReactNode
}) {
  return (
    <StaffSessionContext.Provider value={{ sessionId, userId }}>
      {children}
    </StaffSessionContext.Provider>
  )
}

export function useStaffSession(): StaffSession {
  return useContext(StaffSessionContext)
}
