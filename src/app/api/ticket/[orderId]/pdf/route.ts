import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import PDFDocument from 'pdfkit'

// Utilise le service role pour bypasser RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

export async function GET(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  const { orderId } = params

  if (!orderId) {
    return NextResponse.json({ error: 'Order ID required' }, { status: 400 })
  }

  try {
    // Charger la commande
    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        id, order_number, order_type, status, total, created_at,
        order_items (id, product_name, quantity, unit_price, options_selected),
        establishment:establishments (name, address, phone, vat_number)
      `)
      .eq('id', orderId)
      .single()

    if (error || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Générer le PDF
    const pdfBuffer = await generateTicketPDF(order)

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="ticket-${order.order_number}.pdf"`,
      },
    })
  } catch (err) {
    console.error('PDF generation error:', err)
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 })
  }
}

async function generateTicketPDF(order: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      // Format ticket : 80mm de large (environ 226 points)
      const doc = new PDFDocument({
        size: [226, 600], // Largeur ticket, hauteur auto
        margins: { top: 20, bottom: 20, left: 15, right: 15 }
      })

      const chunks: Buffer[] = []
      doc.on('data', (chunk) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const pageWidth = 226
      const contentWidth = pageWidth - 30 // margins

      // === HEADER ===
      doc.fontSize(16).font('Helvetica-Bold')
      doc.text(order.establishment?.name || 'MDjambo', { align: 'center' })
      
      if (order.establishment?.address) {
        doc.fontSize(8).font('Helvetica')
        doc.text(order.establishment.address, { align: 'center' })
      }
      
      if (order.establishment?.phone) {
        doc.fontSize(8)
        doc.text(`Tel: ${order.establishment.phone}`, { align: 'center' })
      }

      doc.moveDown(0.5)

      // === NUMÉRO DE COMMANDE ===
      doc.fontSize(10).font('Helvetica')
      doc.text('VOTRE COMMANDE', { align: 'center' })
      
      doc.moveDown(0.3)
      doc.fontSize(36).font('Helvetica-Bold')
      doc.text(order.order_number, { align: 'center' })
      doc.moveDown(0.5)

      // === TYPE DE COMMANDE ===
      const orderTypeLabels: Record<string, string> = {
        eat_in: 'Sur place',
        takeaway: 'A emporter',
        delivery: 'Livraison',
        pickup: 'Click & Collect'
      }
      
      doc.fontSize(10).font('Helvetica')
      doc.text(orderTypeLabels[order.order_type] || order.order_type, { align: 'center' })
      
      // Date
      const date = new Date(order.created_at)
      const dateStr = date.toLocaleDateString('fr-BE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
      doc.fontSize(8)
      doc.text(dateStr, { align: 'center' })

      doc.moveDown(0.5)

      // === LIGNE DE SÉPARATION ===
      doc.text('─'.repeat(30), { align: 'center' })
      doc.moveDown(0.5)

      // === ARTICLES ===
      let subtotal = 0

      for (const item of order.order_items) {
        const options = parseOptions(item.options_selected)
        const optionsTotal = options.reduce((s: number, o: ParsedOption) => s + o.price, 0)
        const itemTotal = (item.unit_price + optionsTotal) * item.quantity
        subtotal += itemTotal

        // Ligne article
        doc.fontSize(9).font('Helvetica-Bold')
        const itemText = `${item.quantity}x ${item.product_name}`
        const priceText = `${itemTotal.toFixed(2)}€`
        
        // Calculer la position pour aligner le prix à droite
        const itemWidth = doc.widthOfString(itemText)
        const priceWidth = doc.widthOfString(priceText)
        
        doc.text(itemText, 15, doc.y, { continued: false })
        doc.text(priceText, pageWidth - 15 - priceWidth, doc.y - doc.currentLineHeight())

        // Options
        if (options.length > 0) {
          doc.fontSize(8).font('Helvetica')
          for (const opt of options) {
            let optText = `  + ${opt.item_name}`
            if (opt.price > 0) {
              optText += ` (+${opt.price.toFixed(2)}€)`
            }
            doc.text(optText, 15)
          }
        }

        doc.moveDown(0.3)
      }

      // === LIGNE DE SÉPARATION ===
      doc.moveDown(0.3)
      doc.fontSize(8)
      doc.text('─'.repeat(30), { align: 'center' })
      doc.moveDown(0.5)

      // === TOTAL ===
      doc.fontSize(12).font('Helvetica-Bold')
      const totalText = 'TOTAL'
      const totalPrice = `${(order.total || subtotal).toFixed(2)}€`
      doc.text(totalText, 15, doc.y, { continued: false })
      doc.text(totalPrice, pageWidth - 15 - doc.widthOfString(totalPrice), doc.y - doc.currentLineHeight())

      // TVA info (si disponible)
      if (order.establishment?.vat_number) {
        doc.moveDown(0.5)
        doc.fontSize(7).font('Helvetica')
        doc.text(`TVA: ${order.establishment.vat_number}`, { align: 'center' })
      }

      // === FOOTER ===
      doc.moveDown(1)
      doc.fontSize(8).font('Helvetica')
      doc.text('─'.repeat(30), { align: 'center' })
      doc.moveDown(0.3)
      doc.text('Merci pour votre commande !', { align: 'center' })
      doc.text('A bientot chez MDjambo', { align: 'center' })
      
      doc.moveDown(0.5)
      doc.fontSize(6)
      doc.text(`Ticket #${order.order_number}`, { align: 'center' })
      doc.text(dateStr, { align: 'center' })

      // Finaliser le PDF
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}
