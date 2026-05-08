'use client'

import { useCallback, useEffect, useState } from 'react'

export type ClientEstablishment = { id: string; name: string; slug: string }
export type ClientUser = {
  id: string
  role: string
  pinned_establishment_id: string | null
}

export type EstablishmentContext = {
  current: ClientEstablishment | null
  user: ClientUser | null
  allowed: ClientEstablishment[]
  loading: boolean
  refetch: () => Promise<void>
}

const ESTABLISHMENT_CHANGED_EVENT = 'fritos:establishment-changed'

export function useEstablishmentContext(): EstablishmentContext {
  const [current, setCurrent] = useState<ClientEstablishment | null>(null)
  const [user, setUser] = useState<ClientUser | null>(null)
  const [allowed, setAllowed] = useState<ClientEstablishment[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/current-establishment', {
        cache: 'no-store',
        credentials: 'same-origin',
      })
      if (!res.ok) {
        setCurrent(null)
        setUser(null)
        setAllowed([])
        return
      }
      const data = await res.json()
      setCurrent(data.current ?? null)
      setUser(data.user ?? null)
      setAllowed(Array.isArray(data.allowed) ? data.allowed : [])
    } catch {
      setCurrent(null)
      setUser(null)
      setAllowed([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refetch()
    const listener = () => { refetch() }
    window.addEventListener(ESTABLISHMENT_CHANGED_EVENT, listener)
    return () => window.removeEventListener(ESTABLISHMENT_CHANGED_EVENT, listener)
  }, [refetch])

  return { current, user, allowed, loading, refetch }
}

export function useCurrentEstablishment(): {
  establishment: ClientEstablishment | null
  loading: boolean
} {
  const { current, loading } = useEstablishmentContext()
  return { establishment: current, loading }
}

export async function selectEstablishment(
  establishmentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/admin/select-establishment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ establishmentId }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { success: false, error: data.error || `HTTP ${res.status}` }
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(ESTABLISHMENT_CHANGED_EVENT))
    }
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erreur réseau' }
  }
}
