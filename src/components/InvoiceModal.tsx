'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type CounterOrder = {
  id: string
  order_number: string
  order_type: string
  total: number
  status: string
  created_at: string
}

type Props = {
  establishmentId: string
  isOpen: boolean
  onClose: () => void
}

const ORDER_TYPE_LABEL: Record<string, string> = {
  eat_in: 'Sur place',
  takeaway: 'Emporter',
  delivery: 'Livraison',
  pickup: 'Click&C',
}

export default function InvoiceModal({ establishmentId, isOpen, onClose }: Props) {
  const supabase = createClient()
  const [orders, setOrders] = useState<CounterOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form client
  const [name, setName] = useState('')
  const [vat, setVat] = useState('')
  const [address, setAddress] = useState('')
  const [email, setEmail] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer' | 'pending'>('pending')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!isOpen || !establishmentId) return
    setLoading(true)
    setError(null)
    // Charge les commandes des 7 derniers jours, exclut déjà facturées (faute de jointure: fetch all, on filtre côté UI plus tard si besoin)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    supabase
      .from('orders')
      .select('id, order_number, order_type, total, status, created_at')
      .eq('establishment_id', establishmentId)
      .gte('created_at', sevenDaysAgo)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data, error: e }) => {
        if (e) {
          setError(e.message)
          return
        }
        setOrders(data || [])
      })
      .then(() => setLoading(false))
  }, [isOpen, establishmentId, supabase])

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const totalSelected = orders
    .filter(o => selected.has(o.id))
    .reduce((s, o) => s + Number(o.total || 0), 0)

  async function submit() {
    if (selected.size === 0) {
      setError('Sélectionne au moins une commande')
      return
    }
    if (!name.trim()) {
      setError('Le nom du client est obligatoire')
      return
    }
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          establishmentId,
          orderIds: Array.from(selected),
          customer: {
            name: name.trim(),
            vat: vat.trim() || null,
            address: address.trim() || null,
            email: email.trim() || null,
          },
          paymentMethod,
          notes: notes.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Erreur lors de la création de la facture')
        setSubmitting(false)
        return
      }
      // Ouvre la facture dans un nouvel onglet
      window.open(`/invoice/${data.id}`, '_blank')
      onClose()
      // Reset
      setSelected(new Set())
      setName(''); setVat(''); setAddress(''); setEmail(''); setNotes('')
      setPaymentMethod('pending')
    } catch (e: any) {
      setError(e.message || 'Erreur réseau')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-[#3D2314] text-white p-5 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">📄 Générer une facture</h2>
            <p className="text-sm opacity-80">Sélectionne les commandes à facturer + infos client</p>
          </div>
          <button onClick={onClose} className="text-3xl hover:opacity-70">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {error && (
            <div className="bg-red-100 border border-red-300 text-red-800 px-4 py-2 rounded-lg text-sm">
              ⚠️ {error}
            </div>
          )}

          {/* Sélection commandes */}
          <div>
            <h3 className="font-bold text-[#3D2314] mb-2">1. Commandes à facturer</h3>
            <p className="text-sm text-gray-500 mb-3">Commandes des 7 derniers jours · {selected.size} sélectionnée(s)</p>
            <div className="border rounded-xl max-h-64 overflow-y-auto divide-y">
              {loading ? (
                <div className="p-4 text-center text-gray-500">Chargement…</div>
              ) : orders.length === 0 ? (
                <div className="p-4 text-center text-gray-500">Aucune commande récente.</div>
              ) : orders.map(o => {
                const isSel = selected.has(o.id)
                const date = new Date(o.created_at).toLocaleDateString('fr-BE', {
                  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                })
                return (
                  <label
                    key={o.id}
                    className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50 ${
                      isSel ? 'bg-yellow-50' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggleSelect(o.id)}
                      className="w-5 h-5 accent-[#E63329]"
                    />
                    <div className="flex-1 grid grid-cols-12 gap-2 text-sm">
                      <span className="col-span-2 font-bold text-[#E63329]">#{o.order_number}</span>
                      <span className="col-span-3 text-gray-600">{date}</span>
                      <span className="col-span-3 text-gray-600">{ORDER_TYPE_LABEL[o.order_type] || o.order_type}</span>
                      <span className="col-span-2 text-gray-500">{o.status}</span>
                      <span className="col-span-2 text-right font-semibold">{Number(o.total).toFixed(2)} €</span>
                    </div>
                  </label>
                )
              })}
            </div>
            {selected.size > 0 && (
              <p className="text-right mt-2 font-semibold text-[#3D2314]">
                Total sélectionné : {totalSelected.toFixed(2)} € TTC
              </p>
            )}
          </div>

          {/* Form client */}
          <div>
            <h3 className="font-bold text-[#3D2314] mb-2">2. Coordonnées client</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600">Nom / société *</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Ex: Commune de Boussu"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">N° TVA / BCE</label>
                <input
                  value={vat}
                  onChange={e => setVat(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="BE0207.665.358"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-600">Adresse (ligne par ligne)</label>
                <textarea
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                  rows={2}
                  placeholder="Rue Aimé Cossement 6&#10;7300 Boussu"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Email (optionnel)</label>
                <input
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  type="email"
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="compta@boussu.be"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Paiement</label>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value as any)}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="pending">À payer</option>
                  <option value="cash">Espèces (acquittée)</option>
                  <option value="card">Carte (acquittée)</option>
                  <option value="transfer">Virement</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-600">Notes internes / mention spéciale</label>
                <input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Ex: Repas du Collège communal du 12/06/2026"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t p-5 flex justify-between items-center gap-3">
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-xl border border-gray-300 hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={submitting || selected.size === 0 || !name.trim()}
            className="flex-1 bg-[#E63329] text-white font-bold py-3 rounded-xl hover:bg-[#c12722] transition disabled:opacity-50"
          >
            {submitting ? 'Création...' : `Générer la facture (${selected.size} cmd, ${totalSelected.toFixed(2)} €)`}
          </button>
        </div>
      </div>
    </div>
  )
}
