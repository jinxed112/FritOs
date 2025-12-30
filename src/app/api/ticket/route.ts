import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Générer un ticket en PDF (format 80mm thermique)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get('orderId')
    const type = searchParams.get('type') || 'customer' // 'customer' ou 'kitchen'

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID required' }, { status: 400 })
    }

    // Charger la commande avec les items
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (
          id,
          product_name,
          quantity,
          unit_price,
          line_total,
          options_selected
        )
      `)
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Charger l'établissement
    const { data: establishment } = await supabase
      .from('establishments')
      .select('name, address, phone, vat_number')
      .eq('id', order.establishment_id)
      .single()

    // Générer le HTML du ticket
    const ticketHtml = generateTicketHtml(order, establishment, type)

    // Retourner le HTML (le client peut l'imprimer ou le convertir en PDF)
    return new NextResponse(ticketHtml, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    })

  } catch (error: any) {
    console.error('Ticket generation error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function generateTicketHtml(order: any, establishment: any, type: string): string {
  const isKitchen = type === 'kitchen'
  const orderTypeLabel = order.order_type === 'eat_in' ? 'SUR PLACE' : 'À EMPORTER'
  const date = new Date(order.created_at).toLocaleString('fr-BE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  // Parse les options pour chaque item
  const items = order.order_items.map((item: any) => {
    let options: any[] = []
    if (item.options_selected) {
      try {
        options = JSON.parse(item.options_selected)
      } catch (e) {}
    }
    return { ...item, options }
  })

  if (isKitchen) {
    // Ticket cuisine : gros numéro, juste les items
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', monospace;
      width: 80mm;
      padding: 4mm;
      font-size: 12pt;
    }
    .header {
      text-align: center;
      border-bottom: 2px dashed #000;
      padding-bottom: 4mm;
      margin-bottom: 4mm;
    }
    .order-number {
      font-size: 48pt;
      font-weight: bold;
      line-height: 1;
    }
    .order-type {
      font-size: 16pt;
      font-weight: bold;
      margin-top: 2mm;
      padding: 2mm 4mm;
      background: ${order.order_type === 'eat_in' ? '#000' : '#fff'};
      color: ${order.order_type === 'eat_in' ? '#fff' : '#000'};
      border: 2px solid #000;
      display: inline-block;
    }
    .time {
      font-size: 10pt;
      margin-top: 2mm;
    }
    .items {
      margin-top: 4mm;
    }
    .item {
      margin-bottom: 3mm;
      padding-bottom: 3mm;
      border-bottom: 1px dotted #ccc;
    }
    .item-main {
      display: flex;
      justify-content: space-between;
      font-size: 14pt;
      font-weight: bold;
    }
    .item-qty {
      min-width: 25px;
    }
    .item-option {
      font-size: 10pt;
      color: #333;
      margin-left: 25px;
      margin-top: 1mm;
    }
    @media print {
      body { width: 80mm; }
      @page { size: 80mm auto; margin: 0; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="order-number">${order.order_number}</div>
    <div class="order-type">${orderTypeLabel}</div>
    <div class="time">${date}</div>
  </div>
  
  <div class="items">
    ${items.map((item: any) => `
      <div class="item">
        <div class="item-main">
          <span class="item-qty">${item.quantity}x</span>
          <span class="item-name">${item.product_name}</span>
        </div>
        ${item.options.map((opt: any) => `
          <div class="item-option">+ ${opt.item_name}</div>
        `).join('')}
      </div>
    `).join('')}
  </div>
</body>
</html>`
  }

  // Ticket client : complet avec prix et TVA
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', monospace;
      width: 80mm;
      padding: 4mm;
      font-size: 10pt;
    }
    .header {
      text-align: center;
      margin-bottom: 4mm;
    }
    .shop-name {
      font-size: 14pt;
      font-weight: bold;
    }
    .shop-info {
      font-size: 8pt;
      color: #333;
    }
    .divider {
      border-top: 1px dashed #000;
      margin: 3mm 0;
    }
    .order-info {
      display: flex;
      justify-content: space-between;
      margin-bottom: 2mm;
    }
    .order-number {
      font-size: 18pt;
      font-weight: bold;
      text-align: center;
      margin: 2mm 0;
    }
    .order-type {
      text-align: center;
      font-weight: bold;
      padding: 1mm 3mm;
      background: ${order.order_type === 'eat_in' ? '#000' : '#fff'};
      color: ${order.order_type === 'eat_in' ? '#fff' : '#000'};
      border: 1px solid #000;
      display: inline-block;
      margin-bottom: 2mm;
    }
    .items {
      margin: 3mm 0;
    }
    .item {
      margin-bottom: 2mm;
    }
    .item-line {
      display: flex;
      justify-content: space-between;
    }
    .item-option {
      font-size: 8pt;
      color: #333;
      margin-left: 15px;
    }
    .totals {
      margin-top: 3mm;
      padding-top: 3mm;
      border-top: 1px dashed #000;
    }
    .total-line {
      display: flex;
      justify-content: space-between;
      margin: 1mm 0;
    }
    .total-final {
      font-size: 14pt;
      font-weight: bold;
      margin-top: 2mm;
      padding-top: 2mm;
      border-top: 2px solid #000;
    }
    .footer {
      text-align: center;
      margin-top: 4mm;
      font-size: 8pt;
    }
    .thanks {
      font-size: 12pt;
      font-weight: bold;
      margin-top: 3mm;
    }
    @media print {
      body { width: 80mm; }
      @page { size: 80mm auto; margin: 0; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="shop-name">${establishment?.name || 'MDjambo'}</div>
    <div class="shop-info">${establishment?.address || ''}</div>
    <div class="shop-info">${establishment?.phone || ''}</div>
    ${establishment?.vat_number ? `<div class="shop-info">TVA: ${establishment.vat_number}</div>` : ''}
  </div>
  
  <div class="divider"></div>
  
  <div style="text-align: center;">
    <div class="order-type">${orderTypeLabel}</div>
  </div>
  <div class="order-number">#${order.order_number}</div>
  
  <div class="order-info">
    <span>${date}</span>
    <span>${order.source || 'kiosk'}</span>
  </div>
  
  <div class="divider"></div>
  
  <div class="items">
    ${items.map((item: any) => `
      <div class="item">
        <div class="item-line">
          <span>${item.quantity}x ${item.product_name}</span>
          <span>${(item.line_total || 0).toFixed(2)}€</span>
        </div>
        ${item.options.map((opt: any) => `
          <div class="item-option">+ ${opt.item_name}${opt.price > 0 ? ` (+${opt.price.toFixed(2)}€)` : ''}</div>
        `).join('')}
      </div>
    `).join('')}
  </div>
  
  <div class="totals">
    <div class="total-line">
      <span>Sous-total HT</span>
      <span>${(order.subtotal || 0).toFixed(2)}€</span>
    </div>
    <div class="total-line">
      <span>TVA (${order.order_type === 'eat_in' ? '12' : '6'}%)</span>
      <span>${(order.tax_amount || 0).toFixed(2)}€</span>
    </div>
    <div class="total-line total-final">
      <span>TOTAL</span>
      <span>${(order.total_amount || 0).toFixed(2)}€</span>
    </div>
  </div>
  
  <div class="divider"></div>
  
  <div class="footer">
    <div>Paiement: ${order.payment_method === 'card' ? 'Carte bancaire' : order.payment_method === 'cash' ? 'Espèces' : order.payment_method}</div>
    <div class="thanks">Merci et à bientôt !</div>
  </div>
</body>
</html>`
}