'use client'

/**
 * Modal d'import de catalogue depuis un établissement source.
 *
 * Brief Michele 09/05 verrouillé :
 *  - Cascade auto à la coche catégorie (Q1)
 *  - État par produit ✓ (importer) / ⊕ (ignorer) (Q2)
 *  - Propositions dans onglet séparé (Q3)
 *  - Sélecteur source dynamique (pas hardcode "Boussu" — architecture
 *    réutilisable pour 3e friterie future)
 *
 * **TODO Michele (décisions ouvertes)** :
 *  - Comportement si slug conflit côté target → aujourd'hui refus + listing
 *  - Stratégie prix (copie identique vs prompt multiplicateur)
 *  - Image bucket partagé vs par établissement
 */

import { useMemo, useState } from 'react'
import { useImportPreview } from '@/lib/import-catalog/useImportPreview'
import {
  makeEmptySelection,
  selectionToPayload,
  toggleCategoryCascade,
  toggleOptionGroup,
  toggleProduct,
} from '@/lib/import-catalog/cascade'
import type {
  ImportResult,
  ImportSelection,
  ImportableCategory,
  ImportableProduct,
  ImportableOptionGroup,
} from '@/lib/import-catalog/types'
import { executeImport } from '@/app/actions/import-catalog'
import type { ClientEstablishment } from '@/lib/establishment/client'

type Tab = 'catalog' | 'options'

type Props = {
  isOpen: boolean
  onClose: () => void
  onImportComplete?: (result: ImportResult) => void
  /** Liste des établissements possibles comme source (exclu le current côté parent). */
  sourceCandidates: ClientEstablishment[]
  targetName: string
}

export function ImportFromSourceModal({
  isOpen,
  onClose,
  onImportComplete,
  sourceCandidates,
  targetName,
}: Props) {
  const [sourceId, setSourceId] = useState<string | null>(
    sourceCandidates.length === 1 ? sourceCandidates[0].id : null
  )
  const { preview, loading, error } = useImportPreview(sourceId)
  const [selection, setSelection] = useState<ImportSelection>(makeEmptySelection())
  const [tab, setTab] = useState<Tab>('catalog')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const products = preview?.products ?? []
  const categories = preview?.categories ?? []
  const optionGroups = preview?.optionGroups ?? []

  const stats = useMemo(() => {
    const selectedProductIds = Object.entries(selection.products)
      .filter(([, v]) => v)
      .map(([k]) => k)
    const selectedOgIds = Object.entries(selection.optionGroups)
      .filter(([, v]) => v)
      .map(([k]) => k)
    const selectedProds = products.filter((p) => selectedProductIds.includes(p.id))
    const distinctCats = new Set(selectedProds.map((p) => p.category_id)).size
    return {
      productCount: selectedProductIds.length,
      categoryCount: distinctCats,
      optionGroupCount: selectedOgIds.length,
    }
  }, [selection, products])

  if (!isOpen) return null

  const handleSourceChange = (id: string) => {
    setSourceId(id)
    setSelection(makeEmptySelection())
    setResult(null)
  }

  const handleImport = async () => {
    if (!sourceId) return
    setImporting(true)
    setResult(null)
    try {
      const payload = selectionToPayload(selection, products)
      const res = await executeImport({
        source_establishment_id: sourceId,
        ...payload,
      })
      setResult(res)
      onImportComplete?.(res)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur inconnue'
      setResult({
        success: false,
        inserted: {
          categories: 0,
          products: 0,
          product_ingredients: 0,
          product_option_groups: 0,
          product_stock_mapping: 0,
          option_groups: 0,
          ingredients: 0,
          stock_items: 0,
        },
        conflicts: [],
        errors: [msg],
      })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Importer un catalogue
            </h2>
            <p className="text-sm text-gray-500">
              Vers <strong>{targetName}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-lg"
            aria-label="Fermer"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Sélecteur source */}
        <div className="px-6 py-4 border-b bg-gray-50">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Source de l&apos;import
          </label>
          {sourceCandidates.length === 0 ? (
            <p className="text-sm text-red-600">
              Aucun autre établissement disponible comme source.
            </p>
          ) : (
            <select
              value={sourceId ?? ''}
              onChange={(e) => handleSourceChange(e.target.value)}
              className="block w-full max-w-md border border-gray-300 rounded-lg px-3 py-2 bg-white"
            >
              <option value="">— Choisir l&apos;établissement source —</option>
              {sourceCandidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Tabs */}
        {sourceId && preview && (
          <div className="px-6 border-b flex gap-1">
            <TabButton
              active={tab === 'catalog'}
              onClick={() => setTab('catalog')}
              label={`Catégories + Produits (${stats.productCount}/${products.length})`}
            />
            <TabButton
              active={tab === 'options'}
              onClick={() => setTab('options')}
              label={`Propositions (${stats.optionGroupCount}/${optionGroups.length})`}
            />
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!sourceId && (
            <EmptyHint message="Sélectionnez un établissement source ci-dessus pour commencer." />
          )}
          {sourceId && loading && <EmptyHint message="Chargement du catalogue…" />}
          {sourceId && error && (
            <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
              {error}
            </p>
          )}
          {sourceId && preview && !loading && tab === 'catalog' && (
            <CatalogTab
              categories={categories}
              products={products}
              selection={selection}
              onToggleCategory={(catId, checked) =>
                setSelection((s) =>
                  toggleCategoryCascade(s, catId, checked, products)
                )
              }
              onToggleProduct={(prodId, checked) =>
                setSelection((s) => toggleProduct(s, prodId, checked))
              }
            />
          )}
          {sourceId && preview && !loading && tab === 'options' && (
            <OptionsTab
              optionGroups={optionGroups}
              selection={selection}
              onToggle={(ogId, checked) =>
                setSelection((s) => toggleOptionGroup(s, ogId, checked))
              }
            />
          )}
        </div>

        {/* Result */}
        {result && (
          <div
            className={`mx-6 mb-2 p-3 rounded-lg text-sm ${
              result.success
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            <p className="font-semibold mb-1">
              {result.success ? 'Import terminé' : 'Import partiel / erreur'}
            </p>
            <ul className="list-disc list-inside text-xs space-y-0.5">
              <li>{result.inserted.categories} catégories</li>
              <li>{result.inserted.products} produits</li>
              <li>{result.inserted.ingredients} ingrédients (créés)</li>
              <li>{result.inserted.product_ingredients} liens produit-ingrédient</li>
              <li>{result.inserted.stock_items} stock items (créés)</li>
              <li>{result.inserted.product_stock_mapping} mappings stock</li>
              <li>{result.inserted.option_groups} propositions (créées)</li>
              <li>{result.inserted.product_option_groups} liens produit-proposition</li>
            </ul>
            {result.conflicts.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-orange-700 font-medium">
                  {result.conflicts.length} conflit(s) — non importé(s)
                </summary>
                <ul className="ml-4 mt-1 list-disc list-inside text-xs">
                  {result.conflicts.map((c, i) => (
                    <li key={i}>
                      <code>{c.type}</code> — {c.source_name} (
                      {c.conflicting_slug_or_name})
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {result.errors.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-red-700 font-medium">
                  {result.errors.length} erreur(s)
                </summary>
                <ul className="ml-4 mt-1 list-disc list-inside text-xs">
                  {result.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between bg-gray-50 rounded-b-2xl">
          <div className="text-sm text-gray-600">
            <strong>{stats.productCount}</strong> produit(s) dans{' '}
            <strong>{stats.categoryCount}</strong> catégorie(s) •{' '}
            <strong>{stats.optionGroupCount}</strong> proposition(s)
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 text-sm"
              disabled={importing}
            >
              Annuler
            </button>
            <button
              onClick={handleImport}
              disabled={
                !sourceId ||
                importing ||
                (stats.productCount === 0 && stats.optionGroupCount === 0)
              }
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
            >
              {importing ? 'Import en cours…' : 'Importer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? 'border-orange-500 text-orange-700'
          : 'border-transparent text-gray-500 hover:text-gray-800'
      }`}
    >
      {label}
    </button>
  )
}

function EmptyHint({ message }: { message: string }) {
  return (
    <div className="text-center text-gray-500 py-12 text-sm">{message}</div>
  )
}

function CatalogTab({
  categories,
  products,
  selection,
  onToggleCategory,
  onToggleProduct,
}: {
  categories: ImportableCategory[]
  products: ImportableProduct[]
  selection: ImportSelection
  onToggleCategory: (catId: string, checked: boolean) => void
  onToggleProduct: (prodId: string, checked: boolean) => void
}) {
  if (categories.length === 0) {
    return <EmptyHint message="L'établissement source n'a aucune catégorie." />
  }
  return (
    <div className="space-y-3">
      {categories.map((cat) => {
        const catProducts = products.filter((p) => p.category_id === cat.id)
        const catChecked = !!selection.categories[cat.id]
        return (
          <div key={cat.id} className="border border-gray-200 rounded-lg overflow-hidden">
            <label className="flex items-center gap-3 px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100">
              <input
                type="checkbox"
                checked={catChecked}
                onChange={(e) => onToggleCategory(cat.id, e.target.checked)}
                className="w-4 h-4 rounded text-orange-500 focus:ring-orange-500"
              />
              <div className="flex-1">
                <div className="font-semibold text-gray-900">{cat.name}</div>
                <div className="text-xs text-gray-500">
                  {cat.product_count} produit(s) • slug <code>{cat.slug}</code>
                </div>
              </div>
            </label>
            {catProducts.length > 0 && (
              <ul className="divide-y divide-gray-100">
                {catProducts.map((p) => {
                  const checked = !!selection.products[p.id]
                  return (
                    <li
                      key={p.id}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-orange-50/50"
                    >
                      <button
                        type="button"
                        onClick={() => onToggleProduct(p.id, !checked)}
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                          checked
                            ? 'bg-green-500 text-white hover:bg-green-600'
                            : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                        }`}
                        title={checked ? 'Importer' : 'Ignorer'}
                        aria-label={checked ? 'Importer' : 'Ignorer'}
                      >
                        {checked ? '✓' : '⊕'}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {p.name}
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-2">
                          <span>{p.price.toFixed(2)} €</span>
                          {p.has_ingredients && (
                            <span className="bg-blue-100 text-blue-700 px-1.5 rounded">
                              ingrédients
                            </span>
                          )}
                          {p.has_options && (
                            <span className="bg-purple-100 text-purple-700 px-1.5 rounded">
                              propositions
                            </span>
                          )}
                          {p.has_stock_mapping && (
                            <span className="bg-amber-100 text-amber-700 px-1.5 rounded">
                              stock
                            </span>
                          )}
                          {!p.is_active && (
                            <span className="bg-gray-200 text-gray-600 px-1.5 rounded">
                              inactif
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

function OptionsTab({
  optionGroups,
  selection,
  onToggle,
}: {
  optionGroups: ImportableOptionGroup[]
  selection: ImportSelection
  onToggle: (ogId: string, checked: boolean) => void
}) {
  if (optionGroups.length === 0) {
    return <EmptyHint message="L'établissement source n'a aucune proposition." />
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 mb-3">
        Les propositions sont des groupes d&apos;options (suppléments, choix de
        cuisson, etc.). Cocher pour importer le groupe + ses items.
      </p>
      {optionGroups.map((og) => {
        const checked = !!selection.optionGroups[og.id]
        return (
          <label
            key={og.id}
            className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => onToggle(og.id, e.target.checked)}
              className="w-4 h-4 rounded text-orange-500 focus:ring-orange-500"
            />
            <div className="flex-1">
              <div className="font-medium text-gray-900">{og.name}</div>
              <div className="text-xs text-gray-500">
                Sélection <code>{og.selection_type}</code>
                {!og.is_active && ' • inactif'}
              </div>
            </div>
          </label>
        )
      })}
    </div>
  )
}
