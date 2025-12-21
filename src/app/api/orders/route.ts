import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST: Créer une commande
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
      deliveryFee,
      notes,
      loyaltyPointsUsed,
      promoCode,
    } = body

    // Validations
    if (!establishmentId || !items || items.length === 0) {
      return NextResponse.json(
        { error: 'Données de commande incomplètes' },
        { status: 400 }
      )
    }

    if (!slotDate || !slotTime) {
      return NextResponse.json(
        { error: 'Créneau horaire requis' },
        { status: 400 }
      )
    }

    // Calculer les totaux
    let subtotal = 0
    const orderItems = []

    for (const item of items) {
      const { data: product } = await supabase
        .from('products')
        .select('id, name, price, vat_eat_in, vat_takeaway')
        .eq('id', item.productId)
        .single()

      if (!product) {
        return NextResponse.json(
          { error: `Produit ${item.productId} non trouvé` },
          { status: 400 }
        )
      }

      const linePrice = product.price * item.quantity
      const optionsTotal = (item.options || []).reduce(
        (sum: number, opt: any) => sum + (opt.price || 0),
        0
      ) * item.quantity

      subtotal += linePrice + optionsTotal

      orderItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity: item.quantity,
        unit_price: product.price,
        vat_rate: orderType === 'delivery' ? product.vat_takeaway : product.vat_takeaway, // Click&collect = emporter
        options_selected: item.options?.length > 0 ? JSON.stringify(item.options) : null,
        options_total: optionsTotal / item.quantity,
        line_total: linePrice + optionsTotal,
        notes: item.notes || null,
      })
    }

    // Calculer la TVA (emporter = 6%)
    const vatRate = 6
    const vatAmount = subtotal * vatRate / 100

    // Frais de livraison
    const deliveryFeeAmount = orderType === 'delivery' ? (deliveryFee || 0) : 0

    // Réduction fidélité
    let loyaltyDiscount = 0
    if (customerId && loyaltyPointsUsed > 0) {
      const { data: loyaltyConfig } = await supabase
        .from('loyalty_config')
        .select('points_value_euros, min_points_redeem')
        .eq('establishment_id', establishmentId)
        .single()

      if (loyaltyConfig && loyaltyPointsUsed >= loyaltyConfig.min_points_redeem) {
        // Vérifier que le client a assez de points
        const { data: customer } = await supabase
          .from('customers')
          .select('loyalty_points')
          .eq('id', customerId)
          .single()

        if (customer && customer.loyalty_points >= loyaltyPointsUsed) {
          loyaltyDiscount = loyaltyPointsUsed * loyaltyConfig.points_value_euros
        }
      }
    }

    // Promo code (à implémenter plus tard)
    let promoDiscount = 0

    // Total final
    const total = subtotal + vatAmount + deliveryFeeAmount - loyaltyDiscount - promoDiscount

    // Générer le numéro de commande et code de retrait
    const { data: orderNumberData } = await supabase.rpc('generate_order_number', {
      p_establishment_id: establishmentId,
    })

    // Calculer l'heure estimée de préparation
    const estimatedReadyAt = new Date(`${slotDate}T${slotTime}:00`)

    // Créer la commande
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        establishment_id: establishmentId,
        order_number: orderNumberData || `WEB${Date.now()}`,
        order_type: orderType,
        eat_in: false,
        status: 'pending',
        customer_id: customerId || null,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        customer_email: customerEmail || null,
        delivery_address_id: orderType === 'delivery' ? deliveryAddressId : null,
        delivery_fee: deliveryFeeAmount,
        scheduled_time: estimatedReadyAt.toISOString(),
        estimated_ready_at: estimatedReadyAt.toISOString(),
        subtotal: subtotal,
        vat_amount: vatAmount,
        discount_amount: promoDiscount,
        loyalty_points_used: loyaltyPointsUsed || 0,
        loyalty_discount: loyaltyDiscount,
        total: total,
        payment_method: 'online',
        payment_status: 'pending',
        source_device_id: null,
        notes: notes || null,
        metadata: {
          source: 'click_collect',
          slot_date: slotDate,
          slot_time: slotTime,
        },
      })
      .select()
      .single()

    if (orderError) {
      console.error('Erreur création commande:', orderError)
      return NextResponse.json(
        { error: 'Erreur création commande' },
        { status: 500 }
      )
    }

    // Créer les items
    const itemsWithOrderId = orderItems.map((item) => ({
      ...item,
      order_id: order.id,
    }))

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(itemsWithOrderId)

    if (itemsError) {
      console.error('Erreur création items:', itemsError)
      // Supprimer la commande si erreur items
      await supabase.from('orders').delete().eq('id', order.id)
      return NextResponse.json(
        { error: 'Erreur création items' },
        { status: 500 }
      )
    }

    // Réserver le créneau
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/timeslots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        establishmentId,
        slotDate,
        slotTime,
      }),
    })

    // Si points de fidélité utilisés, les débiter
    if (customerId && loyaltyPointsUsed > 0 && loyaltyDiscount > 0) {
      await supabase.rpc('debit_loyalty_points', {
        p_customer_id: customerId,
        p_points: loyaltyPointsUsed,
        p_order_id: order.id,
      })
    }

    return NextResponse.json({
      success: true,
      orderId: order.id,
      orderNumber: order.order_number,
      pickupCode: order.pickup_code,
      total: total,
      estimatedReadyAt: estimatedReadyAt.toISOString(),
    })

  } catch (error: any) {
    console.error('Erreur commande:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

// GET: Récupérer une commande par ID ou numéro
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get('orderId')
    const orderNumber = searchParams.get('orderNumber')
    const pickupCode = searchParams.get('pickupCode')

    let query = supabase
      .from('orders')
      .select(`
        *,
        order_items (
          id, product_name, quantity, unit_price, line_total, options_selected
        ),
        establishment:establishments (
          name, address, phone
        )
      `)

    if (orderId) {
      query = query.eq('id', orderId)
    } else if (orderNumber) {
      query = query.eq('order_number', orderNumber)
    } else if (pickupCode) {
      query = query.eq('pickup_code', pickupCode)
    } else {
      return NextResponse.json(
        { error: 'Identifiant requis' },
        { status: 400 }
      )
    }

    const { data: order, error } = await query.single()

    if (error || !order) {
      return NextResponse.json(
        { error: 'Commande non trouvée' },
        { status: 404 }
      )
    }

    return NextResponse.json({ order })

  } catch (error: any) {
    console.error('Erreur récupération commande:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
