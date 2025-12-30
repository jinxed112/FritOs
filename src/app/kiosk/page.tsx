'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function KioskRedirectPage() {
  const router = useRouter()
  
  useEffect(() => {
    // Rediriger vers la page setup pour choisir un device
    router.replace('/kiosk/setup')
  }, [router])
  
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-white text-center">
        <span className="text-8xl block mb-4 animate-pulse">🖥️</span>
        <p className="text-xl">Redirection...</p>
      </div>
    </div>
  )
}
