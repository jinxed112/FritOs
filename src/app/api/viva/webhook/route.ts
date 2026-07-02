import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifiedTransaction } from '@/lib/viva/verify'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST: Webhook Viva Wallet
// SÉCURITÉ : chaque événement est revérifié auprès de l'API Viva (verifiedTransaction)
// avant toute écriture — un POST forgé avec un MerchantTrns arbitraire est ignoré.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    console.log('Viva Webhook received:', JSON.stringify(body, null, 2))

    // Viva envoie différents types d'événements
    const eventType = body.EventTypeId

    // Viva fait des POST de vérification sans EventTypeId lors de la configuration
    if (!eventType) {
      return NextResponse.json({ success: true })
    }

    const transactionId: string | undefined = body.EventData?.TransactionId
    const merchantTrns: string | undefined = body.EventData?.MerchantTrns // Notre orderId

    // EventTypeId 1796 = Transaction Payment Created (paiement réussi)
    // EventTypeId 1797 = Transaction Failed
    // EventTypeId 1798 = Transaction Reversed (remboursement)

    if (eventType === 1796) {
      const viva = await verifiedTransaction(transactionId, merchantTrns)
      if (!viva) {
        console.error(`1796 ignoré — transaction ${transactionId} non vérifiable pour ${merchantTrns}`)
        return NextResponse.json({ success: true })
      }

      // Idempotence : ne traiter que les commandes encore en attente de paiement
      const { data: order } = await supabase
        .from('orders')
        .select('id, status')
        .eq('id', merchantTrns)
        .single()

      if (!order) {
        console.error(`Order ${merchantTrns} not found`)
        return NextResponse.json({ success: true })
      }
      if (order.status !== 'awaiting_payment') {
        console.log(`Order ${merchantTrns} already processed (status: ${order.status})`)
        return NextResponse.json({ success: true })
      }

      // Mettre à jour la commande : passer de 'awaiting_payment' à 'pending'.
      // Le .eq('status', ...) rend l'update atomique si deux webhooks arrivent en même temps.
      const { error } = await supabase
        .from('orders')
        .update({
          payment_status: 'paid',
          viva_transaction_id: transactionId,
          status: 'pending', // ← Maintenant visible sur le KDS
        })
        .eq('id', merchantTrns)
        .eq('status', 'awaiting_payment')

      if (error) {
        console.error('Erreur mise à jour commande:', error)
      } else {
        console.log(`Commande ${merchantTrns} : paiement validé, envoyée en cuisine`)
      }
    } else if (eventType === 1797) {
      // Paiement échoué — vérifié aussi, et sans écraser un état terminal
      const viva = await verifiedTransaction(transactionId, merchantTrns)
      if (!viva) {
        return NextResponse.json({ success: true })
      }

      const { data: order } = await supabase
        .from('orders')
        .select('payment_status')
        .eq('id', merchantTrns)
        .single()

      if (order && order.payment_status !== 'paid' && order.payment_status !== 'refunded') {
        await supabase
          .from('orders')
          .update({
            payment_status: 'failed',
          })
          .eq('id', merchantTrns)

        console.log(`Commande ${merchantTrns} : paiement échoué`)
      }
    } else if (eventType === 1798) {
      // Remboursement — vérifié aussi
      const viva = await verifiedTransaction(transactionId, merchantTrns)
      if (!viva) {
        return NextResponse.json({ success: true })
      }

      await supabase
        .from('orders')
        .update({
          payment_status: 'refunded',
          refund_status: 'completed',
        })
        .eq('id', merchantTrns)

      console.log(`Commande ${merchantTrns} : remboursement effectué`)
    }

    // Viva attend un 200 OK
    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Webhook error:', error)
    // Retourner 200 quand même pour éviter les retries
    return NextResponse.json({ success: false, error: error.message })
  }
}

// GET: Viva peut faire un GET pour vérifier que le webhook est accessible
export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'ok',
    message: 'Viva Webhook endpoint ready',
    timestamp: new Date().toISOString(),
  })
}
