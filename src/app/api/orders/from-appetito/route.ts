import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── POST /api/orders/from-appetito ─────────────────────────────────────────
//
// Réception des commandes Appetito Box.
// Le pont sur le Pi (tools/appetito-bridge) capture le ticket BT, parse via
// OCR, et POST ce payload. On crée une order avec source='appetito', dans
// le KDS de l'établissement. Si delivery → la commande apparaît dans
// /admin/deliveries pour assignation au livreur MDjambo.
//
// Auth : token statique (env APPETITO_BRIDGE_TOKEN) vérifié contre header
// X-Bridge-Token, pour empêcher qu'un script externe spamme cet endpoint.

const ItemSchema = z.object({
  productName: z.string().min(1).max(200),
  quantity: z.number().int().positive().max(99),
  unitPrice: z.number().nonnegative().max(500).optional().default(0),
  category: z.string().max(100).optional().nullable(),
  options: z.array(z.string().max(200)).max(20).optional().default([]),
})

const BodySchema = z.object({
  establishmentId: z.string().uuid(),
  appetitoOrderId: z.string().min(1).max(60),
  orderType: z.enum(['takeaway', 'delivery']),
  scheduledTime: z.string().datetime({ offset: true }).optional().nullable(),
  customer: z.object({
    name: z.string().max(200).optional().nullable(),
    phone: z.string().max(40).optional().nullable(),
    address: z.string().max(500).optional().nullable(),
  }).optional().default({}),
  items: z.array(ItemSchema).min(1).max(50),
  subtotal: z.number().nonnegative().max(10000).optional().default(0),
  total: z.number().nonnegative().max(10000).optional().default(0),
  paymentMethod: z.enum(['cash', 'paid']).default('cash'),
  notes: z.string().max(1000).optional().nullable(),
  rawTicketPath: z.string().max(500).optional().nullable(),
})

export async function POST(req: NextRequest) {
  // ─── Auth token ─────────────────────────────────────────────────────────
  const expectedToken = process.env.APPETITO_BRIDGE_TOKEN
  if (!expectedToken) {
    return NextResponse.json({ error: 'APPETITO_BRIDGE_TOKEN env var manquante côté serveur' }, { status: 500 })
  }
  const providedToken = req.headers.get('x-bridge-token')
  if (providedToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ─── Parse body ─────────────────────────────────────────────────────────
  let parsed
  try {
    const body = await req.json()
    parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 }
      )
    }
  } catch (err: any) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const data = parsed.data

  try {
    // ─── Dédup : si une commande avec ce appetito_order_id existe déjà,
    //     on retourne l'order existante. Évite les doublons si le ticket
    //     est imprimé 2 fois ou capturé 2 fois.
    const { data: existing } = await admin
      .from('orders')
      .select('id, order_number')
      .eq('establishment_id', data.establishmentId)
      .filter('metadata->>appetito_order_id', 'eq', data.appetitoOrderId)
      .limit(1)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({
        success: true,
        deduped: true,
        orderId: existing.id,
        orderNumber: existing.order_number,
      })
    }

    // ─── Fuzzy match des items avec les produits FritOS de l'établissement ─
    const { data: products } = await admin
      .from('products')
      .select('id, name, price, vat_eat_in, vat_takeaway')
      .eq('establishment_id', data.establishmentId)
      .eq('is_active', true)

    const productByName = new Map<string, any>()
    for (const p of products ?? []) {
      productByName.set(normalize(p.name), p)
    }

    // Fallback : product_id en DB est NOT NULL, donc si aucun match,
    // on prend un produit "ghost" arbitraire (le premier dispo). Le KDS
    // affichera quand même le bon product_name d'Appetito.
    const fallbackProduct = (products && products.length > 0) ? products[0] : null
    if (!fallbackProduct) {
      return NextResponse.json(
        { error: 'Aucun produit configuré pour cet établissement — impossible de créer la commande Appetito' },
        { status: 503 }
      )
    }

    // ─── Build order_items ──────────────────────────────────────────────────
    let computedSubtotal = 0
    const orderItems: any[] = []
    for (const item of data.items) {
      const matched = productByName.get(normalize(item.productName))
      const unitPrice = item.unitPrice || (matched ? Number(matched.price) : 0)
      const lineTotal = unitPrice * item.quantity
      computedSubtotal += lineTotal

      const optionsData = item.options.map(o => ({ item_name: o, price: 0 }))

      orderItems.push({
        product_id: matched?.id || fallbackProduct.id,  // FK NOT NULL → fallback
        product_name: item.productName,  // affiché au KDS, source de vérité
        quantity: item.quantity,
        unit_price: unitPrice,
        options_selected: optionsData.length > 0 ? JSON.stringify(optionsData) : null,
        options_total: 0,
        line_total: lineTotal,
        vat_rate: matched?.vat_takeaway ?? 6,
        notes: item.category || null,
      })
    }

    // Si le ticket nous a donné un total explicite, on l'utilise pour respecter
    // exactement ce que voit le client sur le ticket Appetito (même si la
    // somme des items diffère de quelques centimes d'arrondi OCR).
    const subtotal = data.subtotal > 0 ? data.subtotal : computedSubtotal
    const total = data.total > 0 ? data.total : subtotal

    // ─── Generate order_number via RPC ──────────────────────────────────────
    const { data: numData, error: numErr } = await admin.rpc('generate_order_number', {
      p_establishment_id: data.establishmentId,
    })
    if (numErr || !numData) {
      return NextResponse.json({ error: 'Failed to generate order number' }, { status: 500 })
    }
    const orderNumber = numData as string

    // ─── Insert order ───────────────────────────────────────────────────────
    const dbOrderType = data.orderType === 'delivery' ? 'delivery' : 'takeaway'

    const orderRow = {
      establishment_id: data.establishmentId,
      order_number: orderNumber,
      order_type: dbOrderType,
      eat_in: false,
      status: 'pending',
      customer_name: data.customer.name || null,
      customer_phone: data.customer.phone || null,
      delivery_notes: data.orderType === 'delivery' ? data.customer.address || null : null,
      scheduled_time: data.scheduledTime || null,
      subtotal,
      vat_amount: 0,
      total,
      total_amount: total,
      payment_method: data.paymentMethod === 'paid' ? 'online' : 'cash',
      payment_status: data.paymentMethod === 'paid' ? 'paid' : 'pending',
      source: 'appetito',
      notes: data.notes || null,
      metadata: {
        appetito_order_id: data.appetitoOrderId,
        appetito_raw_ticket_path: data.rawTicketPath || null,
      },
    }

    const { data: order, error: orderError } = await admin
      .from('orders')
      .insert(orderRow)
      .select('id, order_number')
      .single()

    if (orderError || !order) {
      console.error('[from-appetito] order insert error:', orderError)
      return NextResponse.json({ error: 'Failed to insert order' }, { status: 500 })
    }

    // ─── Insert order_items ─────────────────────────────────────────────────
    const itemsToInsert = orderItems.map(it => ({ ...it, order_id: order.id }))
    const { error: itemsError } = await admin.from('order_items').insert(itemsToInsert)
    if (itemsError) {
      console.error('[from-appetito] items insert error:', itemsError)
      // Best effort rollback
      await admin.from('orders').delete().eq('id', order.id)
      return NextResponse.json({ error: 'Failed to insert items' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      orderId: order.id,
      orderNumber: order.order_number,
      appetitoOrderId: data.appetitoOrderId,
    })
  } catch (err: any) {
    console.error('[from-appetito] unexpected:', err)
    return NextResponse.json({ error: 'Internal error', details: err?.message }, { status: 500 })
  }
}

// "Mdjambo Burger Maison !" → "mdjambo burger maison" — pour fuzzy match
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
