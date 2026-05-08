'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  selectEstablishment,
  useEstablishmentContext,
} from '@/lib/establishment/client'

export function EstablishmentSwitcher() {
  const { current, allowed, loading } = useEstablishmentContext()
  const router = useRouter()
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState('')

  if (loading || !current) return null

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newId = e.target.value
    if (!current || newId === current.id) return
    setError('')
    setSwitching(true)
    const result = await selectEstablishment(newId)
    setSwitching(false)
    if (result.success) {
      router.refresh()
    } else {
      setError(result.error || 'Erreur')
    }
  }

  if (allowed.length <= 1) {
    return (
      <div className="px-4 py-3 border-b border-gray-800">
        <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
          Établissement
        </p>
        <p className="text-sm font-medium text-white truncate" title={current.name}>
          {current.name}
        </p>
      </div>
    )
  }

  return (
    <div className="px-4 py-3 border-b border-gray-800">
      <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">
        Établissement
      </label>
      <select
        value={current.id}
        onChange={handleChange}
        disabled={switching}
        className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
      >
        {allowed.map(est => (
          <option key={est.id} value={est.id}>
            {est.name}
          </option>
        ))}
      </select>
      {error && (
        <p className="text-xs text-red-400 mt-1">{error}</p>
      )}
    </div>
  )
}
