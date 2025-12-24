import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const {
      establishmentId,
      orderType, // 'pickup' ou 'delivery'
      items,
      customerId,
      customerName,
      customerPhone,
      customerEmail,
      slotDate,
      slotTime,
      deliveryAddressId,
      deliveryAddress, // Adresse texte pour livraison
      deliveryLat,
      deliveryLng,
      deliveryFee,
      notes,
      loyaltyPointsUsed,
    } = body

    // Validation basique
    if (!establishmentId || !items || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Données manquantes' },
        { status: 400 }
      )
    }

    if (!slotDate || !slotTime) {
      return NextResponse.json(
        { success: false, error: 'Créneau non sélectionné' },
        { status: 400 }
      )
    }

    // Récupérer les produits pour calculer les prix
    const productIds = items.map((item: any) => item.productId)
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, price, vat_eat_in, vat_takeaway')
      .in('id', productIds)

    if (productsError || !products) {
      console.error('Erreur produits:', productsError)
      return NextResponse.json(
        { success: false, error: 'Erreur chargement produits' },
        { status: 500 }
      )
    }

    const productMap = new Map(products.map(p => [p.id, p]))

    // Calculer le sous-total
    let subtotal = 0
    const orderItems: any[] = []

    for (const item of items) {
      const product = productMap.get(item.productId)
      if (!product) continue

      let itemPrice = product.price
      let optionsTotal = 0
      const optionsData: any[] = []

      // Calculer le prix des options
      if (item.options && item.options.length > 0) {
        for (const opt of item.options) {
          optionsTotal += opt.price || 0
          optionsData.push({
            item_name: opt.item_name || opt.name || 'Option',  // Fix: frontend envoie item_name
            price: opt.price || 0,
          })
        }
      }

      const lineTotal = (itemPrice + optionsTotal) * item.quantity
      subtotal += lineTotal

      orderItems.push({
        product_id: item.productId,
        product_name: product.name,
        quantity: item.quantity,
        unit_price: itemPrice,
        options_selected: optionsData.length > 0 ? JSON.stringify(optionsData) : null,
        options_total: optionsTotal,
        line_total: lineTotal,
        vat_rate: 6, // Click & Collect = toujours à emporter
        notes: item.notes || null,
      })
    }

    // Ajouter les frais de livraison
    const totalDeliveryFee = orderType === 'delivery' ? (deliveryFee || 0) : 0
    const total = subtotal + totalDeliveryFee

    // TVA (6% pour emporter)
    const vatRate = 6
    const taxAmount = total * vatRate / (100 + vatRate)

    // Créer le créneau prévu
    const scheduledTime = `${slotDate}T${slotTime}:00`

    // Générer un numéro de commande unique
    const orderNumber = await generateOrderNumber(establishmentId)

    // Mapper le type de commande vers les valeurs acceptées par la DB
    // La contrainte accepte: 'eat_in', 'takeaway', 'delivery', 'table'
    // Click & Collect retrait = 'takeaway', livraison = 'delivery'
    const dbOrderType = orderType === 'delivery' ? 'delivery' : 'takeaway'

    // Créer la commande
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        establishment_id: establishmentId,
        order_number: orderNumber,
        order_type: dbOrderType,
        eat_in: false,
        status: 'pending',
        customer_id: customerId || null,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        customer_email: customerEmail || null,
        delivery_address_id: deliveryAddressId || null,
        delivery_notes: orderType === 'delivery' ? deliveryAddress : null,
        delivery_fee: totalDeliveryFee,
        scheduled_time: scheduledTime,
        subtotal: subtotal,
        vat_amount: taxAmount,
        total: total,
        payment_method: 'online',
        payment_status: 'pending',
        loyalty_points_used: loyaltyPointsUsed || 0,
        notes: notes || null,
        metadata: {
          source: 'click_and_collect',
          slot_date: slotDate,
          slot_time: slotTime,
          delivery_lat: deliveryLat,
          delivery_lng: deliveryLng,
        },
      })
      .select()
      .single()

    if (orderError) {
      console.error('Erreur création commande:', orderError)
      return NextResponse.json(
        { success: false, error: 'Erreur création commande: ' + orderError.message },
        { status: 500 }
      )
    }

    // Créer les items de commande
    const itemsToInsert = orderItems.map(item => ({
      ...item,
      order_id: order.id,
    }))

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(itemsToInsert)

    if (itemsError) {
      console.error('Erreur items commande:', itemsError)
      // La commande est créée mais pas les items - on continue quand même
    }

    // Réserver le créneau (si table slot_reservations existe)
    try {
      await supabase
        .from('slot_reservations')
        .insert({
          establishment_id: establishmentId,
          slot_date: slotDate,
          slot_time: slotTime,
          order_id: order.id,
          order_type: orderType,
          estimated_prep_time: orderItems.length * 5, // ~5 min par item
        })
    } catch (e) {
      // Pas grave si la table n'existe pas
      console.log('Slot reservation skipped:', e)
    }

    // Retourner le succès avec les infos pour le paiement
    return NextResponse.json({
      success: true,
      orderId: order.id,
      orderNumber: order.order_number,
      total: total,
      // URL de paiement (à implémenter avec Viva)
      paymentUrl: null,
    })

  } catch (error: any) {
    console.error('API orders error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}

async function generateOrderNumber(establishmentId: string): Promise<string> {
  // Essayer d'utiliser la fonction DB si elle existe
  try {
    const { data, error } = await supabase.rpc('generate_order_number', {
      p_establishment_id: establishmentId
    })
    if (!error && data) return data
  } catch (e) {
    // Fonction n'existe pas, fallback
  }

  // Fallback: générer un numéro basé sur timestamp
  const now = new Date()
  const prefix = 'W' // W pour Web/Click & Collect
  const timestamp = now.getTime().toString(36).toUpperCase().slice(-4)
  const random = Math.random().toString(36).substring(2, 4).toUpperCase()
  return `${prefix}${timestamp}${random}`
}

// GET pour récupérer une commande par ID
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get('id')

    if (!orderId) {
      return NextResponse.json(
        { error: 'ID commande requis' },
        { status: 400 }
      )
    }

    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*)
      `)
      .eq('id', orderId)
      .single()

    if (error || !order) {
      return NextResponse.json(
        { error: 'Commande non trouvée' },
        { status: 404 }
      )
    }

    return NextResponse.json(order)

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
