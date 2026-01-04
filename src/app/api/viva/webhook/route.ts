import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST: Webhook Viva Wallet
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    console.log('Viva Webhook received:', JSON.stringify(body, null, 2))

    // Viva envoie différents types d'événements
    const eventType = body.EventTypeId

    // EventTypeId 1796 = Transaction Payment Created (paiement réussi)
    // EventTypeId 1797 = Transaction Failed
    // EventTypeId 1798 = Transaction Reversed (remboursement)

    if (eventType === 1796) {
      // Paiement réussi
      const transactionId = body.EventData?.TransactionId
      const orderCode = body.EventData?.OrderCode
      const merchantTrns = body.EventData?.MerchantTrns // Notre orderId

      if (merchantTrns) {
        // Mettre à jour la commande : passer de 'awaiting_payment' à 'pending'
        const { error } = await supabase
          .from('orders')
          .update({
            payment_status: 'paid',
            viva_transaction_id: transactionId,
            status: 'pending', // ← Maintenant visible sur le KDS
          })
          .eq('id', merchantTrns)

        if (error) {
          console.error('Erreur mise à jour commande:', error)
        } else {
          console.log(`Commande ${merchantTrns} : paiement validé, envoyée en cuisine`)
        }
      }
    } else if (eventType === 1797) {
      // Paiement échoué
      const merchantTrns = body.EventData?.MerchantTrns

      if (merchantTrns) {
        await supabase
          .from('orders')
          .update({
            payment_status: 'failed',
          })
          .eq('id', merchantTrns)
        
        console.log(`Commande ${merchantTrns} : paiement échoué`)
      }
    } else if (eventType === 1798) {
      // Remboursement
      const merchantTrns = body.EventData?.MerchantTrns

      if (merchantTrns) {
        await supabase
          .from('orders')
          .update({
            payment_status: 'refunded',
            refund_status: 'completed',
          })
          .eq('id', merchantTrns)
        
        console.log(`Commande ${merchantTrns} : remboursement effectué`)
      }
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
