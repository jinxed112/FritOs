'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type OrderItem = {
  id: string
  product_name: string
  quantity: number
  unit_price: number
  options_selected: string | null
}

type Order = {
  id: string
  order_number: string
  order_type: string
  status: string
  total: number
  created_at: string
  order_items: OrderItem[]
  establishment: {
    name: string
    address: string | null
    phone: string | null
    vat_number: string | null
  } | null
}

type ParsedOption = {
  item_name: string
  price: number
}

function parseOptions(optionsJson: string | null): ParsedOption[] {
  if (!optionsJson) return []
  try {
    const parsed = JSON.parse(optionsJson)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export default function TicketPage() {
  const params = useParams()
  const orderId = params.orderId as string
  
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  
  const supabase = createClient()

  useEffect(() => {
    loadOrder()
  }, [orderId])

  async function loadOrder() {
    if (!orderId) {
      setError('ID de commande manquant')
      setLoading(false)
      return
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('orders')
        .select(`
          id, order_number, order_type, status, total, created_at,
          order_items (id, product_name, quantity, unit_price, options_selected),
          establishment:establishments (name, address, phone, vat_number)
        `)
        .eq('id', orderId)
        .single()

      if (fetchError || !data) {
        setError('Commande introuvable')
        setLoading(false)
        return
      }

      setOrder(data as Order)
    } catch (err) {
      console.error('Error loading order:', err)
      setError('Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }

  async function downloadPDF() {
    if (!order) return
    
    setDownloading(true)
    try {
      // Import dynamique de jspdf pour éviter les erreurs SSR
      const { jsPDF } = await import('jspdf')
      
      // Format ticket : 80mm x 200mm
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [80, 200]
      })

      const pageWidth = 80
      let y = 10

      // Header
      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      doc.text(order.establishment?.name || 'MDjambo', pageWidth / 2, y, { align: 'center' })
      y += 6

      if (order.establishment?.address) {
        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        doc.text(order.establishment.address, pageWidth / 2, y, { align: 'center' })
        y += 4
      }

      if (order.establishment?.phone) {
        doc.setFontSize(8)
        doc.text(`Tel: ${order.establishment.phone}`, pageWidth / 2, y, { align: 'center' })
        y += 4
      }

      y += 4

      // Numéro de commande
      doc.setFontSize(10)
      doc.text('VOTRE COMMANDE', pageWidth / 2, y, { align: 'center' })
      y += 6

      doc.setFontSize(28)
      doc.setFont('helvetica', 'bold')
      doc.text(order.order_number, pageWidth / 2, y, { align: 'center' })
      y += 10

      // Type de commande
      const orderTypeLabels: Record<string, string> = {
        eat_in: 'Sur place',
        takeaway: 'A emporter',
        delivery: 'Livraison',
        pickup: 'Click & Collect'
      }
      
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(orderTypeLabels[order.order_type] || order.order_type, pageWidth / 2, y, { align: 'center' })
      y += 5

      // Date
      const date = new Date(order.created_at)
      const dateStr = date.toLocaleDateString('fr-BE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
      doc.setFontSize(8)
      doc.text(dateStr, pageWidth / 2, y, { align: 'center' })
      y += 6

      // Ligne de séparation
      doc.setLineWidth(0.1)
      doc.setLineDashPattern([1, 1], 0)
      doc.line(5, y, pageWidth - 5, y)
      y += 6

      // Articles
      let subtotal = 0
      doc.setLineDashPattern([], 0)

      for (const item of order.order_items) {
        const options = parseOptions(item.options_selected)
        const optionsTotal = options.reduce((s, o) => s + o.price, 0)
        const itemTotal = (item.unit_price + optionsTotal) * item.quantity
        subtotal += itemTotal

        // Ligne article
        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        const itemText = `${item.quantity}x ${item.product_name}`
        const priceText = `${itemTotal.toFixed(2)}€`
        
        doc.text(itemText, 5, y)
        doc.text(priceText, pageWidth - 5, y, { align: 'right' })
        y += 4

        // Options
        if (options.length > 0) {
          doc.setFontSize(7)
          doc.setFont('helvetica', 'normal')
          for (const opt of options) {
            let optText = `  + ${opt.item_name}`
            if (opt.price > 0) {
              optText += ` (+${opt.price.toFixed(2)}€)`
            }
            doc.text(optText, 5, y)
            y += 3
          }
        }

        y += 2
      }

      // Ligne de séparation
      y += 2
      doc.setLineDashPattern([1, 1], 0)
      doc.line(5, y, pageWidth - 5, y)
      y += 6

      // Total
      doc.setLineDashPattern([], 0)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('TOTAL', 5, y)
      doc.text(`${(order.total || subtotal).toFixed(2)}€`, pageWidth - 5, y, { align: 'right' })
      y += 8

      // TVA
      if (order.establishment?.vat_number) {
        doc.setFontSize(7)
        doc.setFont('helvetica', 'normal')
        doc.text(`TVA: ${order.establishment.vat_number}`, pageWidth / 2, y, { align: 'center' })
        y += 6
      }

      // Footer
      doc.setLineDashPattern([1, 1], 0)
      doc.line(5, y, pageWidth - 5, y)
      y += 4
      doc.setLineDashPattern([], 0)

      doc.setFontSize(8)
      doc.text('Merci pour votre commande !', pageWidth / 2, y, { align: 'center' })
      y += 4
      doc.text('A bientot chez MDjambo', pageWidth / 2, y, { align: 'center' })
      y += 6

      doc.setFontSize(6)
      doc.text(`Ticket #${order.order_number} - ${dateStr}`, pageWidth / 2, y, { align: 'center' })

      // Télécharger
      doc.save(`ticket-${order.order_number}.pdf`)
    } catch (err) {
      console.error('PDF generation error:', err)
      alert('Erreur lors de la génération du PDF')
    } finally {
      setDownloading(false)
    }
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr)
    return date.toLocaleDateString('fr-BE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  function getOrderTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      eat_in: '🍽️ Sur place',
      takeaway: '🥡 À emporter',
      delivery: '🚗 Livraison',
      pickup: '📦 Click & Collect'
    }
    return labels[type] || type
  }

  function getStatusLabel(status: string): { label: string, color: string } {
    const statuses: Record<string, { label: string, color: string }> = {
      pending: { label: 'En attente', color: 'bg-orange-500' },
      preparing: { label: 'En préparation', color: 'bg-blue-500' },
      ready: { label: 'Prête !', color: 'bg-green-500' },
      completed: { label: 'Terminée', color: 'bg-gray-500' },
      cancelled: { label: 'Annulée', color: 'bg-red-500' }
    }
    return statuses[status] || { label: status, color: 'bg-gray-500' }
  }

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 text-center shadow-2xl">
          <div className="animate-spin text-6xl mb-4">🍟</div>
          <p className="text-gray-600 text-lg">Chargement...</p>
        </div>
      </div>
    )
  }

  // Error
  if (error || !order) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 text-center shadow-2xl max-w-sm">
          <div className="text-6xl mb-4">😕</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Oups !</h1>
          <p className="text-gray-600">{error || 'Commande introuvable'}</p>
        </div>
      </div>
    )
  }

  const statusInfo = getStatusLabel(order.status)
  const subtotal = order.order_items.reduce((sum, item) => {
    const optionsTotal = parseOptions(item.options_selected).reduce((s, o) => s + o.price, 0)
    return sum + (item.unit_price + optionsTotal) * item.quantity
  }, 0)

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        
        {/* Header */}
        <div className="bg-[#E63329] text-white p-6 text-center">
          <div className="text-4xl mb-2">🍟</div>
          <h1 className="text-2xl font-bold">{order.establishment?.name || 'MDjambo'}</h1>
          <p className="text-white/80 text-sm">{order.establishment?.address}</p>
        </div>

        {/* Numéro de commande - ÉNORME */}
        <div className="p-8 text-center border-b-2 border-dashed border-gray-200">
          <p className="text-gray-500 text-sm uppercase tracking-wider mb-2">Votre commande</p>
          <div className="text-7xl font-black text-[#E63329] tracking-wider mb-4">
            {order.order_number}
          </div>
          
          {/* Status badge */}
          <span className={`inline-block px-4 py-2 rounded-full text-white font-semibold ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
        </div>

        {/* Infos commande */}
        <div className="px-6 py-4 bg-gray-50 flex justify-between text-sm">
          <div>
            <span className="text-gray-500">Date</span>
            <p className="font-semibold">{formatDate(order.created_at)}</p>
          </div>
          <div className="text-right">
            <span className="text-gray-500">Type</span>
            <p className="font-semibold">{getOrderTypeLabel(order.order_type)}</p>
          </div>
        </div>

        {/* Articles */}
        <div className="p-6">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span>📋</span> Détail de la commande
          </h3>
          
          <div className="space-y-3">
            {order.order_items.map(item => {
              const options = parseOptions(item.options_selected)
              const itemTotal = (item.unit_price + options.reduce((s, o) => s + o.price, 0)) * item.quantity
              
              return (
                <div key={item.id} className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="bg-[#E63329] text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
                        {item.quantity}
                      </span>
                      <span className="font-medium text-gray-800">{item.product_name}</span>
                    </div>
                    {options.length > 0 && (
                      <div className="ml-8 mt-1 space-y-0.5">
                        {options.map((opt, idx) => (
                          <p key={idx} className="text-sm text-gray-500">
                            + {opt.item_name}
                            {opt.price > 0 && <span className="text-gray-400"> (+{opt.price.toFixed(2)}€)</span>}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="font-semibold text-gray-800">{itemTotal.toFixed(2)}€</span>
                </div>
              )
            })}
          </div>

          {/* Total */}
          <div className="mt-6 pt-4 border-t-2 border-gray-200">
            <div className="flex justify-between items-center text-xl font-bold">
              <span>Total</span>
              <span className="text-[#E63329]">{(order.total || subtotal).toFixed(2)}€</span>
            </div>
          </div>
        </div>

        {/* Bouton télécharger PDF */}
        <div className="p-6 pt-0">
          <button
            onClick={downloadPDF}
            disabled={downloading}
            className="w-full bg-[#3D2314] text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-[#2a1a0f] transition-colors disabled:opacity-50"
          >
            {downloading ? (
              <>
                <span className="animate-spin">⏳</span>
                Génération...
              </>
            ) : (
              <>
                <span>📄</span>
                Télécharger le ticket PDF
              </>
            )}
          </button>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 p-4 text-center text-xs text-gray-500">
          <p>Merci pour votre commande !</p>
          {order.establishment?.phone && <p>📞 {order.establishment.phone}</p>}
          <p className="mt-2">Ticket #{order.order_number} • {formatDate(order.created_at)}</p>
        </div>
      </div>
    </div>
  )
}