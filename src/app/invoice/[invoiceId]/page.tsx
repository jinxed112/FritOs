'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type Establishment = {
  name: string
  address: string | null
  phone: string | null
  vat_number: string | null
}

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
  total: number
  created_at: string
  order_items: OrderItem[]
}

type Invoice = {
  id: string
  invoice_number: string
  customer_name: string
  customer_vat: string | null
  customer_address: string | null
  customer_email: string | null
  total_ht: number
  vat_6: number
  vat_12: number
  total_ttc: number
  payment_method: string | null
  paid_at: string | null
  notes: string | null
  created_at: string
  establishment: Establishment | null
  orders: Order[]
}

function parseOptions(json: string | null): { item_name: string; price: number }[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

const ORDER_TYPE_LABEL: Record<string, string> = {
  eat_in: 'Sur place',
  takeaway: 'À emporter',
  delivery: 'Livraison',
  pickup: 'Click & Collect',
}

const PAYMENT_LABEL: Record<string, string> = {
  cash: 'Espèces',
  card: 'Carte',
  transfer: 'Virement',
  pending: 'En attente',
}

export default function InvoicePage() {
  const params = useParams()
  const invoiceId = params.invoiceId as string

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!invoiceId) return
    fetch(`/api/invoices/${encodeURIComponent(invoiceId)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(d => setInvoice(d))
      .catch(() => setError('Facture introuvable'))
      .finally(() => setLoading(false))
  }, [invoiceId])

  async function downloadPDF() {
    if (!invoice) return
    setDownloading(true)
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

      const W = 210
      const margin = 15
      let y = 20

      // === Header SBURGS ===
      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.text(invoice.establishment?.name || 'MDjambo', margin, y)
      y += 6
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      if (invoice.establishment?.address) {
        doc.text(invoice.establishment.address, margin, y)
        y += 4
      }
      doc.text('SBURGS SRL', margin, y); y += 4
      doc.text('TVA BE 1009.237.290', margin, y); y += 4
      if (invoice.establishment?.phone) {
        doc.text(`Tel : ${invoice.establishment.phone}`, margin, y); y += 4
      }

      // === Bloc FACTURE (haut droite) ===
      doc.setFontSize(22)
      doc.setFont('helvetica', 'bold')
      doc.text('FACTURE', W - margin, 22, { align: 'right' })
      doc.setFontSize(11)
      doc.setFont('helvetica', 'normal')
      doc.text(`N° ${invoice.invoice_number}`, W - margin, 30, { align: 'right' })
      const invoiceDate = new Date(invoice.created_at).toLocaleDateString('fr-BE')
      doc.text(`Date : ${invoiceDate}`, W - margin, 36, { align: 'right' })

      // === Bloc Client ===
      y = Math.max(y, 50) + 8
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text('FACTURÉ À', margin, y)
      y += 5
      doc.setFontSize(11)
      doc.text(invoice.customer_name, margin, y); y += 5
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      if (invoice.customer_address) {
        const addrLines = invoice.customer_address.split('\n')
        for (const line of addrLines) {
          doc.text(line, margin, y); y += 4
        }
      }
      if (invoice.customer_vat) {
        doc.text(`TVA : ${invoice.customer_vat}`, margin, y); y += 4
      }
      if (invoice.customer_email) {
        doc.text(invoice.customer_email, margin, y); y += 4
      }

      y += 6

      // === Tableau commandes ===
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setFillColor(240, 240, 240)
      doc.rect(margin, y - 4, W - 2 * margin, 7, 'F')
      doc.text('Commande', margin + 2, y)
      doc.text('Description', margin + 35, y)
      doc.text('Type', W - margin - 50, y)
      doc.text('Total TTC', W - margin - 2, y, { align: 'right' })
      y += 6

      doc.setFont('helvetica', 'normal')
      for (const order of invoice.orders) {
        // Ligne commande
        const orderDate = new Date(order.created_at).toLocaleDateString('fr-BE')
        doc.setFont('helvetica', 'bold')
        doc.text(`#${order.order_number}`, margin + 2, y)
        doc.text(orderDate, margin + 35, y)
        doc.text(ORDER_TYPE_LABEL[order.order_type] || order.order_type, W - margin - 50, y)
        doc.text(`${Number(order.total).toFixed(2)} €`, W - margin - 2, y, { align: 'right' })
        y += 4

        // Items
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        for (const item of order.order_items) {
          const options = parseOptions(item.options_selected)
          doc.text(`  ${item.quantity}× ${item.product_name}`, margin + 5, y)
          y += 3.5
          for (const opt of options) {
            const optTxt = opt.price > 0
              ? `    + ${opt.item_name} (+${opt.price.toFixed(2)} €)`
              : `    + ${opt.item_name}`
            doc.text(optTxt, margin + 5, y)
            y += 3
          }
        }
        doc.setFontSize(9)
        y += 2

        // Page break si proche du bas
        if (y > 250) {
          doc.addPage()
          y = 20
        }
      }

      // === Totaux ===
      y += 4
      doc.setLineWidth(0.3)
      doc.line(margin, y, W - margin, y)
      y += 6

      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      const labelX = W - margin - 50
      const valueX = W - margin - 2

      doc.text('Total HTVA', labelX, y)
      doc.text(`${Number(invoice.total_ht).toFixed(2)} €`, valueX, y, { align: 'right' })
      y += 5

      if (Number(invoice.vat_6) > 0) {
        doc.text('TVA 6 % (à emporter / livraison)', labelX, y)
        doc.text(`${Number(invoice.vat_6).toFixed(2)} €`, valueX, y, { align: 'right' })
        y += 5
      }
      if (Number(invoice.vat_12) > 0) {
        doc.text('TVA 12 % (sur place)', labelX, y)
        doc.text(`${Number(invoice.vat_12).toFixed(2)} €`, valueX, y, { align: 'right' })
        y += 5
      }

      y += 2
      doc.setLineWidth(0.3)
      doc.line(labelX, y, valueX, y)
      y += 6

      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text('TOTAL TTC', labelX, y)
      doc.text(`${Number(invoice.total_ttc).toFixed(2)} €`, valueX, y, { align: 'right' })
      y += 10

      // === Paiement ===
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      if (invoice.payment_method && invoice.payment_method !== 'pending') {
        const paidDate = invoice.paid_at
          ? new Date(invoice.paid_at).toLocaleDateString('fr-BE')
          : invoiceDate
        doc.text(
          `Facture acquittée le ${paidDate} par ${PAYMENT_LABEL[invoice.payment_method] || invoice.payment_method}.`,
          margin, y
        )
      } else {
        doc.setFont('helvetica', 'bold')
        doc.text('À payer.', margin, y)
        doc.setFont('helvetica', 'normal')
      }
      y += 8

      if (invoice.notes) {
        doc.setFontSize(9)
        doc.text(invoice.notes, margin, y, { maxWidth: W - 2 * margin })
        y += 6
      }

      // === Footer ===
      const footerY = 280
      doc.setFontSize(8)
      doc.setTextColor(120, 120, 120)
      doc.text('SBURGS SRL · Rue de Ghlin 2, 7050 Jurbise · TVA BE 1009.237.290', W / 2, footerY, { align: 'center' })
      doc.text('IBAN BE90 7512 1305 9732 · contact@mdjambo.be', W / 2, footerY + 4, { align: 'center' })

      doc.save(`facture-${invoice.invoice_number.replace(/\//g, '-')}.pdf`)
    } catch (err) {
      console.error('PDF generation error:', err)
      alert('Erreur lors de la génération du PDF')
    } finally {
      setDownloading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-600">Chargement de la facture...</div>
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white rounded-2xl p-8 text-center shadow">
          <div className="text-5xl mb-3">❌</div>
          <p className="text-gray-700">{error || 'Facture introuvable'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#E63329] text-white p-8">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold">{invoice.establishment?.name || 'MDjambo'}</h1>
              <p className="opacity-90 text-sm mt-1">SBURGS SRL</p>
              <p className="opacity-90 text-sm">TVA BE 1009.237.290</p>
            </div>
            <div className="text-right">
              <h2 className="text-2xl font-bold">FACTURE</h2>
              <p className="text-sm mt-1">N° {invoice.invoice_number}</p>
              <p className="text-sm">{new Date(invoice.created_at).toLocaleDateString('fr-BE')}</p>
            </div>
          </div>
        </div>

        {/* Client */}
        <div className="p-8 border-b">
          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Facturé à</h3>
          <p className="font-bold text-gray-800">{invoice.customer_name}</p>
          {invoice.customer_address && (
            <p className="text-gray-600 whitespace-pre-line">{invoice.customer_address}</p>
          )}
          {invoice.customer_vat && <p className="text-gray-600">TVA : {invoice.customer_vat}</p>}
          {invoice.customer_email && <p className="text-gray-600">{invoice.customer_email}</p>}
        </div>

        {/* Orders */}
        <div className="p-8 border-b">
          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-4">Détail</h3>
          <div className="space-y-4">
            {invoice.orders.map(o => (
              <div key={o.id} className="border-l-4 border-[#E63329] pl-3">
                <div className="flex justify-between font-semibold text-gray-800">
                  <span>Commande #{o.order_number} · {ORDER_TYPE_LABEL[o.order_type] || o.order_type}</span>
                  <span>{Number(o.total).toFixed(2)} €</span>
                </div>
                <ul className="text-sm text-gray-600 mt-1 space-y-0.5">
                  {o.order_items.map(it => (
                    <li key={it.id}>
                      {it.quantity}× {it.product_name}
                      {parseOptions(it.options_selected).map((op, i) => (
                        <span key={i} className="ml-2 text-gray-400">+ {op.item_name}</span>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="p-8 bg-gray-50">
          <div className="space-y-2 max-w-xs ml-auto">
            <div className="flex justify-between text-gray-700">
              <span>Total HTVA</span><span>{Number(invoice.total_ht).toFixed(2)} €</span>
            </div>
            {Number(invoice.vat_6) > 0 && (
              <div className="flex justify-between text-gray-700">
                <span>TVA 6 %</span><span>{Number(invoice.vat_6).toFixed(2)} €</span>
              </div>
            )}
            {Number(invoice.vat_12) > 0 && (
              <div className="flex justify-between text-gray-700">
                <span>TVA 12 %</span><span>{Number(invoice.vat_12).toFixed(2)} €</span>
              </div>
            )}
            <div className="border-t pt-2 flex justify-between text-xl font-bold text-gray-900">
              <span>TOTAL TTC</span><span>{Number(invoice.total_ttc).toFixed(2)} €</span>
            </div>
          </div>
        </div>

        {/* Payment status */}
        <div className="p-8 border-t">
          {invoice.payment_method && invoice.payment_method !== 'pending' ? (
            <p className="text-green-700 font-semibold">
              ✅ Facture acquittée le{' '}
              {(invoice.paid_at ? new Date(invoice.paid_at) : new Date(invoice.created_at))
                .toLocaleDateString('fr-BE')}{' '}
              par {PAYMENT_LABEL[invoice.payment_method] || invoice.payment_method}.
            </p>
          ) : (
            <p className="text-orange-700 font-semibold">À payer.</p>
          )}
          {invoice.notes && (
            <p className="text-gray-600 text-sm mt-3 whitespace-pre-line">{invoice.notes}</p>
          )}
        </div>

        {/* Download */}
        <div className="p-8 pt-0">
          <button
            onClick={downloadPDF}
            disabled={downloading}
            className="w-full bg-[#3D2314] text-white font-bold py-4 rounded-2xl hover:bg-[#2a1a0f] transition disabled:opacity-50"
          >
            {downloading ? '⏳ Génération PDF...' : '📄 Télécharger la facture PDF'}
          </button>
        </div>

        <div className="bg-gray-100 text-center text-xs text-gray-500 py-3">
          SBURGS SRL · Rue de Ghlin 2, 7050 Jurbise · IBAN BE90 7512 1305 9732
        </div>
      </div>
    </div>
  )
}
