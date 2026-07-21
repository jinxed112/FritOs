import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { getCurrentEstablishment } from '@/lib/establishment/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Brussels DST offset for the scheduled_time string. Used for the public
// click & collect flow where the slot_date is just YYYY-MM-DD and we have
// to inject an offset.
function getBrusselsOffset(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00Z')
  const year = date.getUTCFullYear()

  const marchLast = new Date(Date.UTC(year, 2, 31))
  while (marchLast.getUTCDay() !== 0) marchLast.setUTCDate(marchLast.getUTCDate() - 1)

  const octoberLast = new Date(Date.UTC(year, 9, 31))
  while (octoberLast.getUTCDay() !== 0) octoberLast.setUTCDate(octoberLast.getUTCDate() - 1)

  if (date >= marchLast && date < octoberLast) {
    return '+02:00' // CEST
  }
  return '+01:00' // CET
}

// ─── Input validation ───────────────────────────────────────────────────────
//
// Audit V1 P0 #5: prior to this PR the route trusted body.establishmentId,
// body.customerId, body.loyaltyPointsUsed and body.deliveryFee straight from
// the client. A compromised kiosk could create cross-tenant orders with
// arbitrary prices. We now resolve the establishment server-side (slug or
// admin cookie), recompute prices server-side from the products table, and
// cap loyalty points to the customer's actual balance.

const ItemOptionSchema = z.object({
  item_name: z.string().max(120).optional(),
  name: z.string().max(120).optional(),
  option_name: z.string().max(120).optional(),
  price: z.number().nonnegative().max(100).optional(),
  quantity: z.number().int().positive().max(20).optional(),
})

const OrderItemInputSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive().max(99),
  options: z.array(ItemOptionSchema).max(20).optional().default([]),
  notes: z.string().max(280).nullable().optional(),
})

const OrderBodySchema = z.object({
  // Either slug (preferred for public click & collect — the page already has
  // it from the URL) or no establishment hint at all (admin/in-store callers
  // resolve via the signed admin cookie). The legacy `establishmentId` body
  // field is rejected explicitly below.
  slug: z.string().regex(/^[a-z0-9-]+$/).max(60).optional(),
  orderType: z.enum(['pickup', 'delivery']),
  items: z.array(OrderItemInputSchema).min(1).max(50),
  customerId: z.string().uuid().nullable().optional(),
  customerName: z.string().max(200).nullable().optional(),
  customerPhone: z.string().max(40).nullable().optional(),
  customerEmail: z.union([z.string().email(), z.literal('')]).nullable().optional(),
  slotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotTime: z.string().regex(/^\d{2}:\d{2}$/),
  deliveryAddressId: z.string().uuid().nullable().optional(),
  deliveryAddress: z.string().max(500).nullable().optional(),
  deliveryLat: z.number().nullable().optional(),
  deliveryLng: z.number().nullable().optional(),
  // deliveryFee n'est plus cru par le serveur (frais dérivés des zones via
  // travelMinutes) — gardé uniquement comme fallback borné quand aucune zone
  // n'est configurée pour l'établissement.
  deliveryFee: z.number().nonnegative().max(50).optional().default(0),
  travelMinutes: z.number().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  loyaltyPointsUsed: z.number().int().min(0).max(10000).optional().default(0),
})

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json().catch(() => null)
    if (!rawBody || typeof rawBody !== 'object') {
      return NextResponse.json(
        { success: false, error: 'JSON invalide' },
        { status: 400 }
      )
    }

    // Reject the legacy `establishmentId` body field outright. This was the
    // cross-tenant injection vector — letting an old client send it through
    // would silently re-introduce the vulnerability post-merge.
    if ('establishmentId' in rawBody) {
      return NextResponse.json(
        {
          success: false,
          error: 'establishmentId not accepted in body — pass `slug` instead, or rely on the admin session cookie',
        },
        { status: 400 }
      )
    }

    const parsed = OrderBodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation des données échouée',
          issues: parsed.error.issues,
        },
        { status: 400 }
      )
    }
    const body = parsed.data

    // ─── Resolve establishment from slug OR signed admin cookie ─────────────
    let establishmentId: string | null = null
    if (body.slug) {
      const { data: est } = await supabase
        .from('establishments')
        .select('id, is_active')
        .eq('slug', body.slug)
        .single()
      if (!est || !est.is_active) {
        return NextResponse.json(
          { success: false, error: 'Établissement introuvable ou inactif' },
          { status: 404 }
        )
      }
      establishmentId = est.id
    } else {
      const current = await getCurrentEstablishment()
      if (!current) {
        return NextResponse.json(
          { success: false, error: 'Aucun établissement résolu (slug ou cookie admin requis)' },
          { status: 400 }
        )
      }
      establishmentId = current.id
    }

    // ─── Server-side price recompute ────────────────────────────────────────
    // The products query is tenant-scoped. Any productId that isn't part of
    // this establishment is silently dropped from the lookup and triggers the
    // 400 below — that's the cross-tenant cart guard.
    const productIds = body.items.map(i => i.productId)
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, price, vat_eat_in, vat_takeaway')
      .in('id', productIds)
      .eq('establishment_id', establishmentId)
      .eq('is_active', true)

    if (productsError) {
      console.error('Erreur produits:', productsError)
      return NextResponse.json(
        { success: false, error: 'Erreur chargement produits' },
        { status: 500 }
      )
    }

    const productMap = new Map((products ?? []).map(p => [p.id, p]))
    for (const item of body.items) {
      if (!productMap.has(item.productId)) {
        return NextResponse.json(
          { success: false, error: 'Produit non disponible pour cet établissement' },
          { status: 400 }
        )
      }
    }

    let subtotal = 0
    const orderItems: any[] = []
    for (const item of body.items) {
      const product = productMap.get(item.productId)!
      const optionsData: { item_name: string; price: number }[] = []
      let optionsTotal = 0
      for (const opt of item.options ?? []) {
        const optPrice = typeof opt.price === 'number' ? opt.price : 0
        optionsTotal += optPrice
        optionsData.push({
          item_name: opt.item_name || opt.name || opt.option_name || 'Option',
          price: optPrice,
        })
      }
      const lineTotal = (Number(product.price) + optionsTotal) * item.quantity
      subtotal += lineTotal

      orderItems.push({
        product_id: item.productId,
        product_name: product.name,
        quantity: item.quantity,
        unit_price: product.price,
        options_selected: optionsData.length > 0 ? JSON.stringify(optionsData) : null,
        options_total: optionsTotal,
        line_total: lineTotal,
        // Click & collect = always takeaway in Belgian horeca tax terms
        vat_rate: product.vat_takeaway ?? 6,
        notes: item.notes || null,
      })
    }

    // ─── Loyalty points: cap to actual customer balance ─────────────────────
    let loyaltyPointsUsed = body.loyaltyPointsUsed ?? 0
    if (loyaltyPointsUsed > 0) {
      if (!body.customerId) {
        // Anonymous customer can't redeem points
        loyaltyPointsUsed = 0
      } else {
        const { data: customer } = await supabase
          .from('customers')
          .select('id, loyalty_points, establishment_id')
          .eq('id', body.customerId)
          .single()
        if (!customer) {
          return NextResponse.json(
            { success: false, error: 'Client introuvable' },
            { status: 404 }
          )
        }
        if (customer.establishment_id !== establishmentId) {
          return NextResponse.json(
            { success: false, error: 'Client non rattaché à cet établissement' },
            { status: 403 }
          )
        }
        const balance = Number(customer.loyalty_points ?? 0)
        if (loyaltyPointsUsed > balance) loyaltyPointsUsed = balance
      }
    }

    // ─── Totals + VAT ───────────────────────────────────────────────────────
    // Frais de livraison dérivés du SERVEUR (zone ↔ travelMinutes), même
    // sémantique que /api/delivery/check (mins <= max_minutes, zones triées) —
    // on ne croit plus body.deliveryFee (cf. gate SaaS f649279).
    let totalDeliveryFee = 0
    if (body.orderType === 'delivery') {
      const { data: estDel } = await supabase
        .from('establishments')
        .select('delivery_enabled')
        .eq('id', establishmentId)
        .single()
      if (!estDel?.delivery_enabled) {
        return NextResponse.json(
          { success: false, error: 'La livraison n’est pas disponible pour cet établissement.' },
          { status: 403 }
        )
      }
      const { data: zones } = await supabase
        .from('delivery_zones')
        .select('max_minutes, delivery_fee')
        .eq('establishment_id', establishmentId)
        .eq('is_active', true)
        .order('max_minutes', { ascending: true })
      if (zones && zones.length > 0) {
        const mins = Number(body.travelMinutes)
        const zone = Number.isFinite(mins)
          ? zones.find(z => mins <= Number(z.max_minutes))
          : null
        if (!zone) {
          return NextResponse.json(
            { success: false, error: 'Adresse hors de la zone de livraison.' },
            { status: 403 }
          )
        }
        totalDeliveryFee = Math.round((parseFloat(String(zone.delivery_fee)) || 0) * 100) / 100
      } else {
        // Pas de zones configurées → frais client borné (fallback).
        totalDeliveryFee = Math.min(Math.max(0, Number(body.deliveryFee) || 0), 50)
      }
    }
    const total = subtotal + totalDeliveryFee
    let taxAmount = 0
    for (const item of orderItems) {
      taxAmount += item.line_total * item.vat_rate / (100 + item.vat_rate)
    }
    taxAmount = Math.round(taxAmount * 100) / 100

    const brusselsOffset = getBrusselsOffset(body.slotDate)
    const scheduledTime = `${body.slotDate}T${body.slotTime}:00${brusselsOffset}`

    const orderNumber = await generateOrderNumber(establishmentId)
    const dbOrderType = body.orderType === 'delivery' ? 'delivery' : 'takeaway'

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        establishment_id: establishmentId,
        order_number: orderNumber,
        order_type: dbOrderType,
        eat_in: false,
        status: 'pending',
        customer_id: body.customerId || null,
        customer_name: body.customerName || null,
        customer_phone: body.customerPhone || null,
        customer_email: body.customerEmail || null,
        delivery_address_id: body.deliveryAddressId || null,
        delivery_notes: body.orderType === 'delivery' ? body.deliveryAddress : null,
        delivery_fee: totalDeliveryFee,
        scheduled_time: scheduledTime,
        subtotal,
        vat_amount: taxAmount,
        // total ET total_amount : le rapport Z et le ticket ESC/POS lisent
        // total_amount, les factures B2B lisent total — les deux doivent être remplis
        // (même dualité que tax_amount/vat_amount, cf. review 2026-07-02)
        tax_amount: taxAmount,
        total,
        total_amount: total,
        payment_method: 'online',
        payment_status: 'pending',
        loyalty_points_used: loyaltyPointsUsed,
        notes: body.notes || null,
        metadata: {
          source: 'click_and_collect',
          slot_date: body.slotDate,
          slot_time: body.slotTime,
          delivery_lat: body.deliveryLat,
          delivery_lng: body.deliveryLng,
          delivery_duration: body.travelMinutes ?? null,
        },
      })
      .select()
      .single()

    if (orderError) {
      console.error('Erreur création commande:', orderError)
      return NextResponse.json(
        { success: false, error: 'Erreur création commande' },
        { status: 500 }
      )
    }

    const itemsToInsert = orderItems.map(item => ({ ...item, order_id: order.id }))
    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(itemsToInsert)
    if (itemsError) {
      console.error('Erreur items commande:', itemsError)
    }

    // Slot reservation — best effort, optional table.
    try {
      await supabase
        .from('slot_reservations')
        .insert({
          establishment_id: establishmentId,
          slot_date: body.slotDate,
          slot_time: body.slotTime,
          order_id: order.id,
          order_type: body.orderType,
          estimated_prep_time: orderItems.length * 5,
        })
    } catch {
      // table may not exist on every env
    }

    return NextResponse.json({
      success: true,
      orderId: order.id,
      orderNumber: order.order_number,
      total,
      paymentUrl: null,
    })
  } catch (error: any) {
    console.error('API orders error:', error)
    return NextResponse.json(
      { success: false, error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

async function generateOrderNumber(establishmentId: string): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('generate_order_number', {
      p_establishment_id: establishmentId,
    })
    if (!error && data) return data
  } catch {
    // RPC missing on this env, fall through to client-side fallback
  }

  // Fallback used only if the RPC is unavailable. Not race-safe — but the
  // RPC has been atomic since the 2026-05-09_atomic_order_number migration.
  const now = new Date()
  const prefix = 'W'
  const timestamp = now.getTime().toString(36).toUpperCase().slice(-4)
  const random = Math.random().toString(36).substring(2, 4).toUpperCase()
  return `${prefix}${timestamp}${random}`
}

// GET — retrieve an order by ID (used by /order/confirmation).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get('id') || searchParams.get('orderId')

    if (!orderId) {
      return NextResponse.json({ error: 'ID commande requis' }, { status: 400 })
    }
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
      return NextResponse.json({ error: 'ID commande invalide' }, { status: 400 })
    }

    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*),
        establishment:establishments (name, address, phone, vat_number)
      `)
      .eq('id', orderId)
      .single()

    if (error || !order) {
      return NextResponse.json({ error: 'Commande non trouvée' }, { status: 404 })
    }

    return NextResponse.json(order)
  } catch (error: any) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
