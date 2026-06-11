'use client'

import { useState } from 'react'

type SelectedOrder = {
  id: string
  order_number: string
  order_type: string
  total: number
}

type Props = {
  establishmentId: string
  orders: SelectedOrder[]
  isOpen: boolean
  onClose: () => void
}

const ORDER_TYPE_LABEL: Record<string, string> = {
  eat_in: 'Sur place',
  takeaway: 'Emporter',
  delivery: 'Livraison',
  pickup: 'Click&C',
}

export default function AdminInvoiceModal({ establishmentId, orders, isOpen, onClose }: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [vat, setVat] = useState('')
  const [address, setAddress] = useState('')
  const [email, setEmail] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer' | 'pending'>('pending')
  const [notes, setNotes] = useState('')

  const totalSelected = orders.reduce((s, o) => s + Number(o.total || 0), 0)

  async function submit() {
    if (!name.trim()) {
      setError('Le nom du client est obligatoire')
      return
    }
    if (orders.length === 0) {
      setError('Aucune commande sélectionnée')
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
          orderIds: orders.map(o => o.id),
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
      window.open(`/invoice/${data.id}`, '_blank')
      onClose()
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
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="bg-[#3D2314] text-white p-5 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">📄 Nouvelle facture</h2>
            <p className="text-sm opacity-80">{orders.length} commande(s) · {totalSelected.toFixed(2)} € TTC</p>
          </div>
          <button onClick={onClose} className="text-3xl hover:opacity-70">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div className="bg-red-100 border border-red-300 text-red-800 px-4 py-2 rounded-lg text-sm">
              ⚠️ {error}
            </div>
          )}

          {/* Récap commandes */}
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Commandes facturées</p>
            <ul className="space-y-1 text-sm">
              {orders.map(o => (
                <li key={o.id} className="flex justify-between">
                  <span><strong className="text-[#E63329]">#{o.order_number}</strong> · {ORDER_TYPE_LABEL[o.order_type] || o.order_type}</span>
                  <span className="font-semibold">{Number(o.total).toFixed(2)} €</span>
                </li>
              ))}
            </ul>
            <div className="border-t mt-2 pt-2 flex justify-between font-bold">
              <span>Total TTC</span>
              <span>{totalSelected.toFixed(2)} €</span>
            </div>
          </div>

          {/* Form client */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-600">Nom / société *</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Ex: Commune de Boussu"
                autoFocus
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
            <div>
              <label className="text-xs text-gray-600">Email (optionnel)</label>
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                type="email"
                className="w-full border rounded-lg px-3 py-2"
                placeholder="compta@..."
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-600">Adresse</label>
              <textarea
                value={address}
                onChange={e => setAddress(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
                rows={2}
                placeholder="Rue ...&#10;7300 Boussu"
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
            <div>
              <label className="text-xs text-gray-600">Mention / notes</label>
              <input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Ex: Repas Collège 12/06/26"
              />
            </div>
          </div>
        </div>

        <div className="border-t p-5 flex justify-between items-center gap-3">
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-xl border border-gray-300 hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={submitting || !name.trim()}
            className="flex-1 bg-[#E63329] text-white font-bold py-3 rounded-xl hover:bg-[#c12722] transition disabled:opacity-50"
          >
            {submitting ? 'Création...' : `Générer la facture (${totalSelected.toFixed(2)} €)`}
          </button>
        </div>
      </div>
    </div>
  )
}
