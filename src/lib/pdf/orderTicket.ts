import type { jsPDF as JsPDF } from 'jspdf'

export type OrderTicketItem = {
  id?: string
  product_name: string
  quantity: number
  unit_price: number
  options_selected?: unknown
  line_total?: number | null
  options_total?: number | null
  notes?: string | null
  is_free?: boolean | null
}

export type OrderTicketEstablishment = {
  name?: string | null
  address?: string | null
  phone?: string | null
  vat_number?: string | null
}

export type OrderTicketData = {
  id: string
  order_number: string
  order_type: string
  status?: string | null
  created_at: string
  total: number
  customer_name?: string | null
  customer_email?: string | null
  customer_phone?: string | null
  payment_status?: string | null
  payment_method?: string | null
  eat_in?: boolean | null
  source?: string | null
  subtotal?: number | null
  vat_amount?: number | null
  tax_amount?: number | null
  discount_amount?: number | null
  total_amount?: number | null
  notes?: string | null
  is_offered?: boolean | null
  offered_reason?: string | null
  order_items: OrderTicketItem[]
  establishment?: OrderTicketEstablishment | null
}

export type OrderTicketFormat = 'thermal' | 'a5'

export type OrderTicketOptions = {
  format?: OrderTicketFormat
  logoDataUrl?: string | null
}

type ParsedOption = {
  item_name: string
  price: number
  quantity: number
}

function parseOptions(raw: unknown): ParsedOption[] {
  if (raw == null) return []
  let val: unknown = raw
  if (typeof val === 'string') {
    try {
      val = JSON.parse(val)
      if (typeof val === 'string') val = JSON.parse(val)
    } catch {
      return []
    }
  }
  if (!Array.isArray(val)) return []
  return val.map((opt: any) => ({
    item_name: opt.item_name || opt.name || opt.option_name || '?',
    price: parseFloat(opt.price ?? opt.item_price ?? 0) || 0,
    quantity: opt.quantity ? Number(opt.quantity) : 1,
  }))
}

function formatDateBE(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-BE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  eat_in: 'Sur place',
  takeaway: 'A emporter',
  delivery: 'Livraison',
  pickup: 'Click & Collect',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  preparing: 'En preparation',
  ready: 'Pret',
  completed: 'Termine',
  cancelled: 'Annule',
  awaiting_payment: 'Paiement en attente',
  confirmed: 'Confirmee',
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  paid: 'Paye',
  pending: 'En attente',
  failed: 'Echoue',
  refunded: 'Rembourse',
}

const SOURCE_LABELS: Record<string, string> = {
  kiosk: 'Borne',
  counter: 'Comptoir',
  online: 'En ligne',
}

export async function generateOrderTicketPDF(
  order: OrderTicketData,
  opts: OrderTicketOptions = {}
): Promise<JsPDF> {
  const { jsPDF } = await import('jspdf')
  const format = opts.format ?? 'thermal'
  return format === 'a5'
    ? renderA5(jsPDF, order, opts)
    : renderThermal(jsPDF, order, opts)
}

function renderThermal(
  JsPDFCtor: typeof JsPDF,
  order: OrderTicketData,
  _opts: OrderTicketOptions
): JsPDF {
  const pageWidth = 80
  const doc = new JsPDFCtor({
    orientation: 'portrait',
    unit: 'mm',
    format: [80, 200],
  })
  let y = 10

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

  doc.setFontSize(10)
  doc.text('VOTRE COMMANDE', pageWidth / 2, y, { align: 'center' })
  y += 6
  doc.setFontSize(28)
  doc.setFont('helvetica', 'bold')
  doc.text(order.order_number, pageWidth / 2, y, { align: 'center' })
  y += 10

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(
    ORDER_TYPE_LABELS[order.order_type] || order.order_type,
    pageWidth / 2,
    y,
    { align: 'center' }
  )
  y += 5

  const dateStr = formatDateBE(order.created_at)
  doc.setFontSize(8)
  doc.text(dateStr, pageWidth / 2, y, { align: 'center' })
  y += 6

  doc.setLineWidth(0.1)
  doc.setLineDashPattern([1, 1], 0)
  doc.line(5, y, pageWidth - 5, y)
  y += 6

  let subtotal = 0
  doc.setLineDashPattern([], 0)

  for (const item of order.order_items) {
    const options = parseOptions(item.options_selected)
    const optionsTotal = options.reduce((s, o) => s + o.price, 0)
    const itemTotal = (item.unit_price + optionsTotal) * item.quantity
    subtotal += itemTotal

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text(`${item.quantity}x ${item.product_name}`, 5, y)
    doc.text(`${itemTotal.toFixed(2)}€`, pageWidth - 5, y, { align: 'right' })
    y += 4

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

  y += 2
  doc.setLineDashPattern([1, 1], 0)
  doc.line(5, y, pageWidth - 5, y)
  y += 6

  doc.setLineDashPattern([], 0)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('TOTAL', 5, y)
  doc.text(`${(order.total || subtotal).toFixed(2)}€`, pageWidth - 5, y, { align: 'right' })
  y += 8

  if (order.establishment?.vat_number) {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text(`TVA: ${order.establishment.vat_number}`, pageWidth / 2, y, { align: 'center' })
    y += 6
  }

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

  return doc
}

function renderA5(
  JsPDFCtor: typeof JsPDF,
  order: OrderTicketData,
  opts: OrderTicketOptions
): JsPDF {
  const pageW = 148
  const pageH = 210
  const margin = 12
  const innerW = pageW - margin * 2
  const doc = new JsPDFCtor({ orientation: 'portrait', unit: 'mm', format: 'a5' })

  let y = margin

  // ===== Header : logo + nom etablissement =====
  const establishmentName = order.establishment?.name || 'MDjambo'
  if (opts.logoDataUrl) {
    try {
      doc.addImage(opts.logoDataUrl, 'PNG', margin, y, 22, 18)
    } catch {
      // ignore logo failures
    }
  }
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text(establishmentName, pageW - margin, y + 6, { align: 'right' })
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  if (order.establishment?.address) {
    doc.text(order.establishment.address, pageW - margin, y + 11, { align: 'right' })
  }
  if (order.establishment?.phone) {
    doc.text(`Tel: ${order.establishment.phone}`, pageW - margin, y + 15, { align: 'right' })
  }
  y += 22

  doc.setLineWidth(0.3)
  doc.setLineDashPattern([], 0)
  doc.line(margin, y, pageW - margin, y)
  y += 6

  // ===== Bloc commande =====
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120)
  doc.text('COMMANDE', margin, y)
  doc.setTextColor(0)
  doc.setFontSize(28)
  doc.setFont('helvetica', 'bold')
  doc.text(`#${order.order_number}`, margin, y + 10)

  // Colonne droite : meta
  const metaX = margin + innerW / 2
  let metaY = y
  const metaLine = (label: string, value: string) => {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(120)
    doc.text(label, metaX, metaY)
    doc.setTextColor(0)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(value, metaX + 28, metaY)
    metaY += 5
  }
  metaLine('Date', formatDateBE(order.created_at))
  if (order.status) {
    metaLine('Statut', STATUS_LABELS[order.status] || order.status)
  }
  const modeLabel =
    order.eat_in === true
      ? 'Sur place'
      : ORDER_TYPE_LABELS[order.order_type] || order.order_type
  metaLine('Mode', modeLabel)
  if (order.source) {
    metaLine('Source', SOURCE_LABELS[order.source] || order.source)
  }
  if (order.payment_status) {
    metaLine(
      'Paiement',
      PAYMENT_STATUS_LABELS[order.payment_status] || order.payment_status
    )
  }

  y = Math.max(y + 14, metaY) + 4

  // ===== Bloc client =====
  const hasClient =
    order.customer_name || order.customer_email || order.customer_phone
  if (hasClient) {
    doc.setLineWidth(0.1)
    doc.setLineDashPattern([0.5, 0.5], 0)
    doc.line(margin, y, pageW - margin, y)
    doc.setLineDashPattern([], 0)
    y += 5
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(120)
    doc.text('CLIENT', margin, y)
    doc.setTextColor(0)
    y += 5
    doc.setFontSize(10)
    if (order.customer_name) {
      doc.setFont('helvetica', 'bold')
      doc.text(order.customer_name, margin, y)
      y += 5
    }
    doc.setFont('helvetica', 'normal')
    if (order.customer_email) {
      doc.text(order.customer_email, margin, y)
      y += 5
    }
    if (order.customer_phone) {
      doc.text(order.customer_phone, margin, y)
      y += 5
    }
    y += 1
  }

  // ===== Items =====
  doc.setLineWidth(0.3)
  doc.setLineDashPattern([], 0)
  doc.line(margin, y, pageW - margin, y)
  y += 5
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(120)
  doc.text('ARTICLE', margin, y)
  doc.text('PRIX', pageW - margin, y, { align: 'right' })
  doc.setTextColor(0)
  y += 4
  doc.setLineWidth(0.1)
  doc.line(margin, y, pageW - margin, y)
  y += 4

  let subtotal = 0
  for (const item of order.order_items) {
    if (y > pageH - 50) {
      doc.addPage()
      y = margin
    }
    const options = parseOptions(item.options_selected)
    const optionsTotal =
      item.options_total != null
        ? item.options_total
        : options.reduce((s, o) => s + o.price * o.quantity, 0)
    const lineTotal =
      item.line_total != null
        ? item.line_total
        : (item.unit_price + optionsTotal) * item.quantity
    subtotal += lineTotal

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(`${item.quantity}x ${item.product_name}`, margin, y)
    doc.text(`${lineTotal.toFixed(2)}€`, pageW - margin, y, { align: 'right' })
    y += 5

    if (options.length > 0) {
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(80)
      for (const opt of options) {
        let optText = `   + ${opt.item_name}`
        if (opt.quantity > 1) optText += ` x${opt.quantity}`
        doc.text(optText, margin, y)
        if (opt.price > 0) {
          doc.text(
            `+${(opt.price * opt.quantity * item.quantity).toFixed(2)}€`,
            pageW - margin,
            y,
            { align: 'right' }
          )
        }
        y += 4
      }
      doc.setTextColor(0)
    }

    if (item.notes) {
      doc.setFontSize(8)
      doc.setFont('helvetica', 'italic')
      doc.setTextColor(150, 100, 0)
      doc.text(`Note: ${item.notes}`, margin + 3, y)
      doc.setTextColor(0)
      y += 4
    }
    y += 2
  }

  // ===== Totaux =====
  y += 2
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageW - margin, y)
  y += 6

  const totalsRight = pageW - margin
  const labelLine = (label: string, value: string, bold = false) => {
    doc.setFontSize(bold ? 14 : 10)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.text(label, margin, y)
    doc.text(value, totalsRight, y, { align: 'right' })
    y += bold ? 8 : 5
  }
  if (order.subtotal != null) {
    labelLine('Sous-total', `${order.subtotal.toFixed(2)}€`)
  }
  if (order.discount_amount && order.discount_amount > 0) {
    labelLine('Remise', `-${order.discount_amount.toFixed(2)}€`)
  }
  const vat = order.vat_amount ?? order.tax_amount
  if (vat != null) {
    labelLine('TVA', `${vat.toFixed(2)}€`)
  }
  doc.setLineWidth(0.1)
  doc.line(margin, y, pageW - margin, y)
  y += 5
  const totalAmount = order.total_amount ?? order.total ?? subtotal
  labelLine('TOTAL', `${totalAmount.toFixed(2)}€`, true)

  if (order.payment_method) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(120)
    const pm =
      order.payment_method === 'card'
        ? 'carte bancaire'
        : order.payment_method === 'cash'
        ? 'especes'
        : order.payment_method
    doc.text(`Paye par ${pm}`, totalsRight, y, { align: 'right' })
    doc.setTextColor(0)
    y += 5
  }

  if (order.is_offered) {
    y += 2
    doc.setFillColor(245, 235, 255)
    doc.rect(margin, y - 4, innerW, 7, 'F')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(110, 50, 170)
    doc.text(
      `Commande offerte${order.offered_reason ? ` - ${order.offered_reason}` : ''}`,
      margin + 2,
      y
    )
    doc.setTextColor(0)
    y += 6
  }

  if (order.notes) {
    y += 2
    doc.setFontSize(8)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(120)
    doc.text(`Note commande: ${order.notes}`, margin, y)
    doc.setTextColor(0)
    y += 4
  }

  // ===== Footer =====
  const footerY = pageH - margin - 6
  doc.setLineWidth(0.1)
  doc.setLineDashPattern([0.5, 0.5], 0)
  doc.line(margin, footerY - 4, pageW - margin, footerY - 4)
  doc.setLineDashPattern([], 0)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120)
  const footerLeft = order.establishment?.vat_number
    ? `TVA: ${order.establishment.vat_number}`
    : ''
  if (footerLeft) doc.text(footerLeft, margin, footerY)
  doc.text(
    `Ticket #${order.order_number} - ${formatDateBE(order.created_at)}`,
    pageW - margin,
    footerY,
    { align: 'right' }
  )
  doc.setTextColor(0)

  return doc
}
