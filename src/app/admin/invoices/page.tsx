'use client'

import { useState, useEffect, useCallback } from 'react'
import { useCurrentEstablishment } from '@/lib/establishment/client'

type Invoice = {
  id: string
  invoice_number: string
  customer_name: string
  customer_vat: string | null
  customer_email: string | null
  total_ttc: number
  payment_method: 'cash' | 'card' | 'transfer' | 'pending'
  paid_at: string | null
  created_at: string
  notes: string | null
  overdue: boolean
}

type Totals = {
  total: number
  pending: number
  paid: number
}

type Filter = 'all' | 'pending' | 'overdue' | 'paid'

const PAYMENT_LABEL: Record<string, string> = {
  cash: '💵 Espèces',
  card: '💳 Carte',
  transfer: '🏦 Virement',
  pending: '⏳ À payer',
}

const PAYMENT_COLOR: Record<string, string> = {
  cash: 'bg-green-100 text-green-700',
  card: 'bg-green-100 text-green-700',
  transfer: 'bg-green-100 text-green-700',
  pending: 'bg-orange-100 text-orange-700',
}

export default function InvoicesPage() {
  const { establishment } = useCurrentEstablishment()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [totals, setTotals] = useState<Totals>({ total: 0, pending: 0, paid: 0 })
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [actionFor, setActionFor] = useState<Invoice | null>(null)
  const [serviceTypeFor, setServiceTypeFor] = useState<Invoice | null>(null)

  const load = useCallback(async () => {
    if (!establishment) return
    setLoading(true)
    try {
      const res = await fetch(
        `/api/invoices/list?establishmentId=${encodeURIComponent(establishment.id)}&status=${filter}`,
        { cache: 'no-store' }
      )
      const data = await res.json()
      if (res.ok) {
        setInvoices(data.invoices || [])
        setTotals(data.totals || { total: 0, pending: 0, paid: 0 })
      }
    } finally {
      setLoading(false)
    }
  }, [establishment, filter])

  useEffect(() => {
    load()
  }, [load])

  const filtered = invoices.filter(i => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      i.invoice_number.toLowerCase().includes(q) ||
      i.customer_name.toLowerCase().includes(q) ||
      (i.customer_vat || '').toLowerCase().includes(q)
    )
  })

  async function markAs(inv: Invoice, method: 'cash' | 'card' | 'transfer' | 'pending') {
    const res = await fetch(`/api/invoices/${inv.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentMethod: method }),
    })
    if (res.ok) {
      setActionFor(null)
      load()
    } else {
      alert('Erreur lors de la mise à jour')
    }
  }

  async function setServiceType(inv: Invoice, serviceType: 'eat_in' | 'takeaway') {
    const res = await fetch(`/api/invoices/${inv.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceType }),
    })
    if (res.ok) {
      setServiceTypeFor(null)
      load()
    } else {
      alert('Erreur lors du recalcul TVA')
    }
  }

  async function sendToAccountant(inv: Invoice) {
    if (!confirm(`Envoyer la facture ${inv.invoice_number} au comptable (UBL via WinAuditor) ?`)) return
    const res = await fetch(`/api/invoices/${inv.id}/send-to-accountant`, {
      method: 'POST',
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      alert(`✅ Envoyé à ${data.sentTo}`)
      load()
    } else {
      const detailMsg = data.details
        ? `\n\nDétail :\n${typeof data.details === 'string' ? data.details : JSON.stringify(data.details, null, 2)}`
        : ''
      alert(`Erreur envoi : ${data.error || 'inconnue'}${detailMsg}`)
    }
  }

  return (
    <div className="p-4 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Factures</h1>
          <p className="text-gray-500 text-sm">{filtered.length} facture(s)</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4 mb-6">
        <div className="bg-orange-50 rounded-xl p-4">
          <p className="text-xs uppercase text-orange-700 font-semibold">À recevoir</p>
          <p className="text-2xl lg:text-3xl font-bold text-orange-700">
            {totals.pending.toFixed(2)} €
          </p>
        </div>
        <div className="bg-green-50 rounded-xl p-4">
          <p className="text-xs uppercase text-green-700 font-semibold">Encaissé</p>
          <p className="text-2xl lg:text-3xl font-bold text-green-700">
            {totals.paid.toFixed(2)} €
          </p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-xs uppercase text-gray-600 font-semibold">Total émis</p>
          <p className="text-2xl lg:text-3xl font-bold text-gray-800">
            {totals.total.toFixed(2)} €
          </p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {(['all', 'pending', 'overdue', 'paid'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
              filter === f
                ? 'bg-[#E63329] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f === 'all' ? 'Toutes' :
             f === 'pending' ? '⏳ À payer' :
             f === 'overdue' ? '🚨 En retard (>30j)' :
             '✅ Payées'}
          </button>
        ))}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 N°, client, TVA..."
          className="flex-1 min-w-[150px] px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      {/* Liste */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center text-gray-400">Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center">
          <p className="text-gray-500">Aucune facture</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full hidden lg:table">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">N° Facture</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Date</th>
                <th className="text-left px-6 py-4 font-semibold text-gray-600">Client</th>
                <th className="text-center px-6 py-4 font-semibold text-gray-600">Statut</th>
                <th className="text-right px-6 py-4 font-semibold text-gray-600">Total TTC</th>
                <th className="text-right px-6 py-4 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(inv => (
                <tr key={inv.id} className={inv.overdue ? 'bg-red-50' : 'hover:bg-gray-50'}>
                  <td className="px-6 py-4">
                    <span className="font-bold">{inv.invoice_number}</span>
                    {inv.overdue && <span className="ml-2 text-xs text-red-600">🚨</span>}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(inv.created_at).toLocaleDateString('fr-BE')}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-800">{inv.customer_name}</div>
                    {inv.customer_vat && (
                      <div className="text-xs text-gray-500">{inv.customer_vat}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${PAYMENT_COLOR[inv.payment_method] || 'bg-gray-100 text-gray-600'}`}>
                      {PAYMENT_LABEL[inv.payment_method] || inv.payment_method}
                    </span>
                    {inv.paid_at && (
                      <div className="text-xs text-gray-500 mt-1">
                        le {new Date(inv.paid_at).toLocaleDateString('fr-BE')}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right font-bold">
                    {Number(inv.total_ttc).toFixed(2)} €
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <a
                        href={`/invoice/${inv.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm"
                        title="Voir / Télécharger PDF"
                      >
                        📄
                      </a>
                      <button
                        onClick={() => setServiceTypeFor(inv)}
                        className="px-3 py-1.5 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm"
                        title="Requalifier sur place / emporter (recalcule la TVA)"
                      >
                        ⇄
                      </button>
                      <button
                        onClick={() => sendToAccountant(inv)}
                        className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm"
                        title="Envoyer au comptable (UBL PEPPOL → WinAuditor)"
                      >
                        📤
                      </button>
                      {inv.payment_method === 'pending' ? (
                        <button
                          onClick={() => setActionFor(inv)}
                          className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-semibold"
                        >
                          ✓ Marquer payée
                        </button>
                      ) : (
                        <button
                          onClick={() => markAs(inv, 'pending')}
                          className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 text-sm"
                          title="Repasser en attente"
                        >
                          ↺
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile cards */}
          <div className="lg:hidden divide-y divide-gray-100">
            {filtered.map(inv => (
              <div key={inv.id} className={`p-4 ${inv.overdue ? 'bg-red-50' : ''}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-lg">{inv.invoice_number}</div>
                    <div className="text-sm text-gray-600">{inv.customer_name}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(inv.created_at).toLocaleDateString('fr-BE')}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{Number(inv.total_ttc).toFixed(2)} €</div>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold mt-1 ${PAYMENT_COLOR[inv.payment_method] || ''}`}>
                      {PAYMENT_LABEL[inv.payment_method]}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <a href={`/invoice/${inv.id}`} target="_blank" rel="noreferrer"
                     className="flex-1 px-3 py-2 bg-gray-100 rounded-lg text-center text-sm">
                    📄 PDF
                  </a>
                  <button
                    onClick={() => setServiceTypeFor(inv)}
                    className="px-3 py-2 bg-gray-100 rounded-lg text-sm"
                    title="Requalifier sur place / emporter"
                  >
                    ⇄
                  </button>
                  <button
                    onClick={() => sendToAccountant(inv)}
                    className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm"
                    title="Envoyer au comptable (UBL)"
                  >
                    📤
                  </button>
                  {inv.payment_method === 'pending' && (
                    <button
                      onClick={() => setActionFor(inv)}
                      className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold"
                    >
                      ✓ Marquer payée
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal "Marquer comme payée" */}
      {actionFor && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-2">Marquer comme payée</h2>
            <p className="text-sm text-gray-600 mb-4">
              Facture <span className="font-bold">{actionFor.invoice_number}</span> ·{' '}
              {Number(actionFor.total_ttc).toFixed(2)} €
              <br />
              <span className="text-gray-500">{actionFor.customer_name}</span>
            </p>
            <p className="text-sm text-gray-700 mb-3 font-semibold">Mode de paiement :</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <button onClick={() => markAs(actionFor, 'transfer')}
                      className="px-4 py-3 bg-blue-100 text-blue-700 rounded-xl hover:bg-blue-200 font-semibold">
                🏦 Virement
              </button>
              <button onClick={() => markAs(actionFor, 'cash')}
                      className="px-4 py-3 bg-green-100 text-green-700 rounded-xl hover:bg-green-200 font-semibold">
                💵 Espèces
              </button>
              <button onClick={() => markAs(actionFor, 'card')}
                      className="px-4 py-3 bg-purple-100 text-purple-700 rounded-xl hover:bg-purple-200 font-semibold">
                💳 Carte
              </button>
            </div>
            <button onClick={() => setActionFor(null)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl hover:bg-gray-50">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Modal "Type de service" — requalification fiscale */}
      {serviceTypeFor && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-2">Type de service</h2>
            <p className="text-sm text-gray-600 mb-2">
              Facture <span className="font-bold">{serviceTypeFor.invoice_number}</span> ·{' '}
              {Number(serviceTypeFor.total_ttc).toFixed(2)} €
              <br />
              <span className="text-gray-500">{serviceTypeFor.customer_name}</span>
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
              ⚠️ Recalcul la TVA sur l&apos;ensemble de la facture. Le total TTC reste inchangé.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button onClick={() => setServiceType(serviceTypeFor, 'eat_in')}
                      className="px-4 py-4 bg-orange-100 text-orange-800 rounded-xl hover:bg-orange-200 font-semibold flex flex-col items-center gap-1">
                <span className="text-2xl">🍽️</span>
                <span>Sur place</span>
                <span className="text-xs font-normal">TVA 12 %</span>
              </button>
              <button onClick={() => setServiceType(serviceTypeFor, 'takeaway')}
                      className="px-4 py-4 bg-blue-100 text-blue-800 rounded-xl hover:bg-blue-200 font-semibold flex flex-col items-center gap-1">
                <span className="text-2xl">🥡</span>
                <span>À emporter</span>
                <span className="text-xs font-normal">TVA 6 %</span>
              </button>
            </div>
            <button onClick={() => setServiceTypeFor(null)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-xl hover:bg-gray-50">
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
