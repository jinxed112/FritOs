import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST: Créer un ordre de paiement Viva
export async function POST(request: NextRequest) {
  try {
    const { orderId } = await request.json()

    if (!orderId) {
      return NextResponse.json(
        { error: 'orderId requis' },
        { status: 400 }
      )
    }

    // Charger la commande
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, establishment:establishments(name)')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Commande non trouvée' },
        { status: 404 }
      )
    }

    if (order.payment_status === 'paid') {
      return NextResponse.json(
        { error: 'Commande déjà payée' },
        { status: 400 }
      )
    }

    const clientId = process.env.VIVA_CLIENT_ID
    const clientSecret = process.env.VIVA_CLIENT_SECRET
    const merchantId = process.env.VIVA_MERCHANT_ID

    if (!clientId || !clientSecret || !merchantId) {
      return NextResponse.json(
        { error: 'Configuration Viva manquante' },
        { status: 500 }
      )
    }

    // Obtenir le token OAuth
    const tokenResponse = await fetch('https://accounts.vivapayments.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })

    if (!tokenResponse.ok) {
      const tokenError = await tokenResponse.text()
      console.error('Viva token error:', tokenError)
      return NextResponse.json(
        { error: 'Erreur authentification Viva' },
        { status: 500 }
      )
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    // Créer l'ordre de paiement
    const amountInCents = Math.round(order.total * 100)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://fritos.vercel.app'

    const paymentOrder = {
      amount: amountInCents,
      customerTrns: `Commande ${order.order_number}`,
      customer: {
        email: order.customer_email || undefined,
        fullName: order.customer_name || undefined,
        phone: order.customer_phone || undefined,
      },
      paymentTimeout: 1800, // 30 minutes
      preauth: false,
      allowRecurring: false,
      maxInstallments: 0,
      paymentNotification: true,
      tipAmount: 0,
      disableExactAmount: false,
      disableCash: true,
      disableWallet: false,
      sourceCode: process.env.VIVA_SOURCE_CODE || 'Default',
      merchantTrns: order.id,
      tags: ['click-collect', order.establishment_id],
    }

    const orderResponse = await fetch('https://api.vivapayments.com/checkout/v2/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(paymentOrder),
    })

    if (!orderResponse.ok) {
      const orderError = await orderResponse.text()
      console.error('Viva order error:', orderError)
      return NextResponse.json(
        { error: 'Erreur création paiement Viva' },
        { status: 500 }
      )
    }

    const orderData = await orderResponse.json()

    // Sauvegarder le code de commande Viva
    await supabase
      .from('orders')
      .update({
        viva_order_code: orderData.orderCode,
        metadata: {
          ...(order.metadata || {}),
          viva_order_code: orderData.orderCode,
        },
      })
      .eq('id', orderId)

    // Construire l'URL de paiement
    const checkoutUrl = `https://www.vivapayments.com/web/checkout?ref=${orderData.orderCode}&color=FF6B00`

    return NextResponse.json({
      success: true,
      orderCode: orderData.orderCode,
      checkoutUrl,
    })

  } catch (error: any) {
    console.error('Erreur paiement:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

// GET: Vérifier le statut d'un paiement
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orderCode = searchParams.get('orderCode')
    const orderId = searchParams.get('orderId')

    if (!orderCode && !orderId) {
      return NextResponse.json(
        { error: 'orderCode ou orderId requis' },
        { status: 400 }
      )
    }

    // Si on a un orderId, récupérer le orderCode
    let vivaOrderCode = orderCode
    if (!vivaOrderCode && orderId) {
      const { data: order } = await supabase
        .from('orders')
        .select('viva_order_code, payment_status')
        .eq('id', orderId)
        .single()

      if (order?.payment_status === 'paid') {
        return NextResponse.json({
          status: 'paid',
          orderId,
        })
      }

      vivaOrderCode = order?.viva_order_code
    }

    if (!vivaOrderCode) {
      return NextResponse.json(
        { error: 'Pas de paiement en cours' },
        { status: 404 }
      )
    }

    const clientId = process.env.VIVA_CLIENT_ID
    const clientSecret = process.env.VIVA_CLIENT_SECRET

    // Obtenir le token
    const tokenResponse = await fetch('https://accounts.vivapayments.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId!,
        client_secret: clientSecret!,
      }),
    })

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    // Vérifier le statut
    const statusResponse = await fetch(
      `https://api.vivapayments.com/checkout/v2/orders/${vivaOrderCode}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    )

    if (!statusResponse.ok) {
      return NextResponse.json({
        status: 'pending',
        orderCode: vivaOrderCode,
      })
    }

    const statusData = await statusResponse.json()

    // StateId: 0 = Pending, 1 = Expired, 2 = Canceled, 3 = Paid
    const statusMap: Record<number, string> = {
      0: 'pending',
      1: 'expired',
      2: 'cancelled',
      3: 'paid',
    }

    const paymentStatus = statusMap[statusData.stateId] || 'pending'

    // Si payé, mettre à jour la commande
    if (paymentStatus === 'paid' && orderId) {
      await supabase
        .from('orders')
        .update({
          payment_status: 'paid',
          viva_transaction_id: statusData.transactionId,
          status: 'confirmed', // Confirmer la commande
        })
        .eq('id', orderId)
    }

    return NextResponse.json({
      status: paymentStatus,
      orderCode: vivaOrderCode,
      transactionId: statusData.transactionId,
    })

  } catch (error: any) {
    console.error('Erreur vérification paiement:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
