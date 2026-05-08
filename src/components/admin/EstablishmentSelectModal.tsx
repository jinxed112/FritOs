'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  selectEstablishment,
  useEstablishmentContext,
} from '@/lib/establishment/client'

export function EstablishmentSelectModal() {
  const { current, allowed, user, loading } = useEstablishmentContext()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const autoSelectAttempted = useRef(false)

  // Auto-select when the user has exactly one allowed establishment.
  useEffect(() => {
    if (loading || current || autoSelectAttempted.current) return
    if (allowed.length !== 1) return
    autoSelectAttempted.current = true
    setBusy(true)
    selectEstablishment(allowed[0].id).then(result => {
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error || 'Erreur lors de la sélection automatique')
        setBusy(false)
      }
    })
  }, [loading, current, allowed, router])

  if (loading) return null
  if (current) return null

  if (allowed.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
          <h2 className="text-xl font-bold text-gray-900 mb-3">
            Aucun établissement disponible
          </h2>
          <p className="text-gray-700 mb-4 text-sm">
            Votre compte n&apos;est rattaché à aucun établissement actif. Contactez
            un administrateur pour configurer vos accès.
          </p>
          {user?.role && (
            <p className="text-xs text-gray-400">Rôle : {user.role}</p>
          )}
        </div>
      </div>
    )
  }

  if (allowed.length === 1) {
    return (
      <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl text-center">
          <p className="text-gray-700">Sélection de votre établissement…</p>
          {error && <p className="text-red-600 mt-2 text-sm">{error}</p>}
        </div>
      </div>
    )
  }

  async function handlePick(id: string) {
    setError('')
    setBusy(true)
    const result = await selectEstablishment(id)
    if (result.success) {
      router.refresh()
    } else {
      setError(result.error || 'Erreur')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          Choisir un établissement
        </h2>
        <p className="text-gray-600 text-sm mb-4">
          Sélectionnez l&apos;établissement que vous voulez gérer.
        </p>
        <div className="space-y-2">
          {allowed.map(est => (
            <button
              key={est.id}
              onClick={() => handlePick(est.id)}
              disabled={busy}
              className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-orange-500 hover:bg-orange-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <p className="font-medium text-gray-900">{est.name}</p>
              <p className="text-xs text-gray-500">/{est.slug}</p>
            </button>
          ))}
        </div>
        {error && <p className="text-red-600 mt-3 text-sm">{error}</p>}
      </div>
    </div>
  )
}
