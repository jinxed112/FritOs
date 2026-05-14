'use client'

/**
 * Page `/admin/import` — point d'entrée de la fonctionnalité d'import inter-
 * établissements (PR E sprint multi-tenant FritOS).
 *
 * Réservée aux `super_admin` (vérification à la fois côté UI ici et côté
 * server action `executeImport()`).
 *
 * Brief Michele 09/05 verrouillé.
 */

import { useMemo, useState } from 'react'
import {
  useCurrentEstablishment,
  useEstablishmentContext,
} from '@/lib/establishment/client'
import { ImportFromSourceModal } from '@/components/admin/import/ImportFromSourceModal'
import type { ImportResult } from '@/lib/import-catalog/types'

export default function ImportPage() {
  const { establishment, loading: estLoading } = useCurrentEstablishment()
  const { user, allowed } = useEstablishmentContext()
  const [modalOpen, setModalOpen] = useState(false)
  const [lastResult, setLastResult] = useState<ImportResult | null>(null)

  const sourceCandidates = useMemo(
    () => allowed.filter((e) => e.id !== establishment?.id),
    [allowed, establishment?.id]
  )

  if (estLoading) {
    return (
      <div className="p-8 text-gray-500">Chargement de l&apos;établissement…</div>
    )
  }

  if (!establishment) {
    return (
      <div className="p-8 text-gray-500">
        Sélectionnez d&apos;abord un établissement dans la sidebar.
      </div>
    )
  }

  if (user?.role !== 'super_admin') {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4">
          <p className="font-semibold mb-1">Accès refusé</p>
          <p className="text-sm">
            L&apos;import inter-établissements est réservé aux super-admins.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Importer un catalogue
        </h1>
        <p className="text-gray-600 mt-1">
          Copier catégories, produits, ingrédients, mappings stock et
          propositions depuis un autre établissement vers{' '}
          <strong>{establishment.name}</strong>.
        </p>
      </header>

      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-2">Comment ça marche ?</h2>
        <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1.5">
          <li>
            Choisissez l&apos;établissement <strong>source</strong> dans le
            modal.
          </li>
          <li>
            Cochez les catégories à importer — par défaut, tous leurs produits
            sont cochés (cascade).
          </li>
          <li>
            Affinez : décochez les produits avec ⊕, gardez ceux avec ✓.
          </li>
          <li>
            Onglet <em>Propositions</em> : cochez les groupes d&apos;options à
            copier en plus.
          </li>
          <li>
            Validez. Les prix sont copiés tels quels (éditables ensuite). Les
            URL d&apos;image sont partagées avec la source.
          </li>
        </ol>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-sm">
        <p className="font-semibold text-amber-900 mb-1">Avant d&apos;importer</p>
        <ul className="list-disc list-inside text-amber-800 space-y-0.5">
          <li>
            Les slugs de catégories/produits doivent être uniques côté cible.
            Tout conflit sera listé et l&apos;import sera <strong>refusé</strong>{' '}
            pour les entrées en conflit.
          </li>
          <li>
            Le stock physique (`stock_items.stock_current`) n&apos;est pas copié
            (chaque site gère son propre stock) — seul le <em>mapping</em>{' '}
            produit ↔ stock l&apos;est.
          </li>
          <li>
            Les fournisseurs ne sont pas copiés (cross-tenant). À reconfigurer
            après import.
          </li>
        </ul>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => setModalOpen(true)}
          disabled={sourceCandidates.length === 0}
          className="px-5 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed font-medium"
        >
          Ouvrir le modal d&apos;import
        </button>
        {sourceCandidates.length === 0 && (
          <span className="text-sm text-gray-500">
            Aucun autre établissement disponible comme source.
          </span>
        )}
      </div>

      {lastResult && (
        <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm">
          <p className="font-semibold mb-1">Dernier import</p>
          <p>
            {lastResult.inserted.categories} catégories,{' '}
            {lastResult.inserted.products} produits,{' '}
            {lastResult.inserted.product_ingredients} liens ingrédient,{' '}
            {lastResult.inserted.product_option_groups} liens proposition.
          </p>
          {lastResult.conflicts.length > 0 && (
            <p className="text-orange-700 mt-1">
              {lastResult.conflicts.length} conflit(s).
            </p>
          )}
        </div>
      )}

      <ImportFromSourceModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onImportComplete={setLastResult}
        sourceCandidates={sourceCandidates}
        targetName={establishment.name}
      />
    </div>
  )
}
