import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Impression ESC/POS sur imprimante réseau
// Pour Epson TM-T20III ou similaire
export async function POST(request: NextRequest) {
  try {
    const { orderId, type, printerIp } = await request.json()

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID required' }, { status: 400 })
    }

    // IP par défaut ou depuis config
    const ip = printerIp || process.env.PRINTER_IP || '192.168.1.100'
    const port = parseInt(process.env.PRINTER_PORT || '9100')

    // Charger la commande
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

    // Générer les commandes ESC/POS
    const escposData = generateEscPos(order, establishment, type || 'customer')

    // Envoyer à l'imprimante via TCP
    // Note: Ceci nécessite un serveur Node.js ou un proxy car
    // les fonctions Vercel ne supportent pas les sockets TCP directement
    
    // Option 1: Utiliser un service d'impression local
    // Option 2: Webhook vers un Raspberry Pi
    // Option 3: WebSocket vers une app locale
    
    // Pour l'instant, on retourne les données ESC/POS en base64
    // Le client peut les envoyer via une app locale
    const base64Data = Buffer.from(escposData).toString('base64')

    return NextResponse.json({
      success: true,
      message: 'ESC/POS data generated',
      printerIp: ip,
      printerPort: port,
      data: base64Data,
      // Instructions pour impression locale
      instructions: `Pour imprimer, envoyez les données décodées en base64 vers ${ip}:${port} via TCP`
    })

  } catch (error: any) {
    console.error('ESC/POS error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function generateEscPos(order: any, establishment: any, type: string): Uint8Array {
  const encoder = new TextEncoder()
  const commands: number[] = []
  
  // ESC/POS Commands
  const ESC = 0x1B
  const GS = 0x1D
  const LF = 0x0A
  
  // Initialize printer
  commands.push(ESC, 0x40) // ESC @ - Initialize
  
  // Set code page (Western Europe)
  commands.push(ESC, 0x74, 0x10) // ESC t 16
  
  const isKitchen = type === 'kitchen'
  const orderTypeLabel = order.order_type === 'eat_in' ? 'SUR PLACE' : 'A EMPORTER'
  const date = new Date(order.created_at).toLocaleString('fr-BE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  // Parse items
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
    // TICKET CUISINE
    
    // Center align
    commands.push(ESC, 0x61, 0x01)
    
    // Double height + Double width for order number
    commands.push(GS, 0x21, 0x11)
    addText(commands, order.order_number)
    commands.push(LF)
    
    // Normal size
    commands.push(GS, 0x21, 0x00)
    
    // Order type (emphasized)
    commands.push(ESC, 0x45, 0x01) // Bold on
    addText(commands, orderTypeLabel)
    commands.push(LF)
    commands.push(ESC, 0x45, 0x00) // Bold off
    
    addText(commands, date)
    commands.push(LF)
    
    // Divider
    addText(commands, '--------------------------------')
    commands.push(LF)
    
    // Left align for items
    commands.push(ESC, 0x61, 0x00)
    
    // Items - Double height
    commands.push(GS, 0x21, 0x01)
    
    for (const item of items) {
      addText(commands, `${item.quantity}x ${item.product_name}`)
      commands.push(LF)
      
      // Options in normal size
      if (item.options.length > 0) {
        commands.push(GS, 0x21, 0x00)
        for (const opt of item.options) {
          addText(commands, `   + ${opt.item_name}`)
          commands.push(LF)
        }
        commands.push(GS, 0x21, 0x01)
      }
    }
    
  } else {
    // TICKET CLIENT
    
    // Center align
    commands.push(ESC, 0x61, 0x01)
    
    // Shop name - Double width
    commands.push(GS, 0x21, 0x10)
    addText(commands, establishment?.name || 'MDjambo')
    commands.push(LF)
    
    // Normal size
    commands.push(GS, 0x21, 0x00)
    
    if (establishment?.address) {
      addText(commands, establishment.address)
      commands.push(LF)
    }
    if (establishment?.phone) {
      addText(commands, establishment.phone)
      commands.push(LF)
    }
    if (establishment?.vat_number) {
      addText(commands, `TVA: ${establishment.vat_number}`)
      commands.push(LF)
    }
    
    // Divider
    addText(commands, '--------------------------------')
    commands.push(LF)
    
    // Order type
    commands.push(ESC, 0x45, 0x01)
    addText(commands, orderTypeLabel)
    commands.push(LF)
    commands.push(ESC, 0x45, 0x00)
    
    // Order number - Big
    commands.push(GS, 0x21, 0x11)
    addText(commands, `#${order.order_number}`)
    commands.push(LF)
    commands.push(GS, 0x21, 0x00)
    
    addText(commands, date)
    commands.push(LF)
    
    // Divider
    addText(commands, '--------------------------------')
    commands.push(LF)
    
    // Left align for items
    commands.push(ESC, 0x61, 0x00)
    
    for (const item of items) {
      const price = (item.line_total || 0).toFixed(2)
      const line = `${item.quantity}x ${item.product_name}`
      const spaces = 32 - line.length - price.length - 1
      addText(commands, line + ' '.repeat(Math.max(1, spaces)) + price + 'E')
      commands.push(LF)
      
      for (const opt of item.options) {
        addText(commands, `   + ${opt.item_name}`)
        commands.push(LF)
      }
    }
    
    // Divider
    addText(commands, '--------------------------------')
    commands.push(LF)
    
    // Totals - Right align
    commands.push(ESC, 0x61, 0x02)
    
    addText(commands, `Sous-total: ${(order.subtotal || 0).toFixed(2)}E`)
    commands.push(LF)
    addText(commands, `TVA (${order.order_type === 'eat_in' ? '12' : '6'}%): ${(order.tax_amount || 0).toFixed(2)}E`)
    commands.push(LF)
    
    // Total - Bold + Double
    commands.push(ESC, 0x45, 0x01)
    commands.push(GS, 0x21, 0x11)
    addText(commands, `TOTAL: ${(order.total_amount || 0).toFixed(2)}E`)
    commands.push(LF)
    commands.push(GS, 0x21, 0x00)
    commands.push(ESC, 0x45, 0x00)
    
    // Center
    commands.push(ESC, 0x61, 0x01)
    
    // Divider
    addText(commands, '--------------------------------')
    commands.push(LF)
    
    // Payment method
    const paymentLabel = order.payment_method === 'card' ? 'Carte bancaire' : 
                         order.payment_method === 'cash' ? 'Especes' : order.payment_method
    addText(commands, `Paiement: ${paymentLabel}`)
    commands.push(LF)
    commands.push(LF)
    
    // Thanks
    commands.push(ESC, 0x45, 0x01)
    addText(commands, 'Merci et a bientot !')
    commands.push(LF)
    commands.push(ESC, 0x45, 0x00)
  }
  
  // Feed and cut
  commands.push(LF, LF, LF)
  commands.push(GS, 0x56, 0x00) // Full cut
  
  return new Uint8Array(commands)
}

function addText(commands: number[], text: string) {
  // Convert to bytes (ASCII/Latin-1)
  for (let i = 0; i < text.length; i++) {
    let charCode = text.charCodeAt(i)
    // Handle special characters
    if (charCode > 255) {
      // Replace non-Latin1 characters
      switch (text[i]) {
        case 'é': charCode = 0xE9; break
        case 'è': charCode = 0xE8; break
        case 'ê': charCode = 0xEA; break
        case 'à': charCode = 0xE0; break
        case 'ù': charCode = 0xF9; break
        case 'ô': charCode = 0xF4; break
        case 'î': charCode = 0xEE; break
        case 'ï': charCode = 0xEF; break
        case 'ç': charCode = 0xE7; break
        case '€': charCode = 0x45; break // E for Euro
        default: charCode = 0x3F; // ?
      }
    }
    commands.push(charCode)
  }
}