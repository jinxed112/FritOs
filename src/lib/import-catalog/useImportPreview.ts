'use client'

/**
 * Hook React qui charge l'aperçu du catalogue d'un établissement source.
 *
 * Utilisation : passer `sourceEstablishmentId` (sélecteur UI), retourne
 * `preview` (catégories + produits + propositions) + `loading` + `error`.
 *
 * Re-fetch automatique quand `sourceEstablishmentId` change.
 */

import { useEffect, useState } from 'react'
import { loadImportPreview } from '@/app/actions/import-catalog'
import type { ImportPreview } from './types'

export type UseImportPreviewResult = {
  preview: ImportPreview | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useImportPreview(
  sourceEstablishmentId: string | null
): UseImportPreviewResult {
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPreview = async () => {
    if (!sourceEstablishmentId) {
      setPreview(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await loadImportPreview(sourceEstablishmentId)
      setPreview(data)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur inconnue'
      setError(msg)
      setPreview(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceEstablishmentId])

  return { preview, loading, error, refetch: fetchPreview }
}
