import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifiedTransaction } from '@/lib/viva/verify'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST: Webhook Viva Wallet
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log('Viva Webhook received:', JSON.stringify(body, null, 2))

    const eventType = body.EventTypeId
    const supabase = getServiceClient()

    if (eventType === 1796) {
      // Paiement réussi
      const transactionId = body.EventData?.TransactionId
      const merchantTrns = body.EventData?.MerchantTrns

      if (!merchantTrns || !transactionId) {
        console.error('Missing merchantTrns or transactionId')
        return NextResponse.json({ success: true })
      }

      // SÉCURITÉ : refetch la transaction chez Viva et vérifie que son MerchantTrns
      // correspond à la commande visée — un TransactionId réel mais étranger est rejeté
      const viva = await verifiedTransaction(transactionId, merchantTrns)
      if (!viva) {
        console.error(`Transaction ${transactionId} NOT verified - ignoring`)
        return NextResponse.json({ success: true })
      }

      // Vérifier que la commande n'est pas déjà traitée
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

      // 'pending' (pas 'confirmed' : statut inconnu du KDS, la commande serait invisible)
      // + garde atomique sur le statut pour l'idempotence si deux webhooks arrivent ensemble
      const { error } = await supabase
        .from('orders')
        .update({
          payment_status: 'paid',
          viva_transaction_id: transactionId,
          status: 'pending',
        })
        .eq('id', merchantTrns)
        .eq('status', 'awaiting_payment')

      if (error) {
        console.error('Erreur mise à jour commande:', error)
      } else {
        console.log(`Commande ${merchantTrns} marquée comme payée`)
        await sendConfirmationEmail(merchantTrns, supabase)
      }

    } else if (eventType === 1797) {
      const merchantTrns = body.EventData?.MerchantTrns
      const transactionId = body.EventData?.TransactionId
      // Vérifié aussi, et sans écraser un état terminal (paid/refunded)
      const viva = await verifiedTransaction(transactionId, merchantTrns)
      if (viva && merchantTrns) {
        const { data: order } = await supabase
          .from('orders')
          .select('payment_status')
          .eq('id', merchantTrns)
          .single()
        if (order && order.payment_status !== 'paid' && order.payment_status !== 'refunded') {
          await supabase
            .from('orders')
            .update({ payment_status: 'failed' })
            .eq('id', merchantTrns)
        }
      }
    } else if (eventType === 1798) {
      const merchantTrns = body.EventData?.MerchantTrns
      const transactionId = body.EventData?.TransactionId
      const viva = await verifiedTransaction(transactionId, merchantTrns)
      if (viva && merchantTrns) {
        await supabase
          .from('orders')
          .update({ payment_status: 'refunded', status: 'cancelled' })
          .eq('id', merchantTrns)
      }
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Webhook error:', error)
    return NextResponse.json({ success: true })
  }
}

// GET: Viva vérifie l'URL lors de la configuration du webhook
// SÉCURITÉ : protégé par WEBHOOK_VERIFY_SECRET (variable d'env Vercel)
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('s')
  const expectedSecret = process.env.WEBHOOK_VERIFY_SECRET

  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({ status: 'ok', message: 'Viva Webhook endpoint ready' })
}

async function sendConfirmationEmail(orderId: string, supabase: ReturnType<typeof getServiceClient>) {
  try {
    const { data: order } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (product_name, quantity, unit_price, line_total, options_selected),
        establishment:establishments (name, address, phone)
      `)
      .eq('id', orderId)
      .single()

    if (!order || !order.customer_email) return

    const itemsHtml = order.order_items
      .map(
        (item: any) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.quantity}x ${item.product_name}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${item.line_total.toFixed(2)}€</td>
        </tr>
      `
      )
      .join('')

    const pickupTime = order.scheduled_time
      ? new Date(order.scheduled_time).toLocaleString('fr-BE', {
          weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
        })
      : 'À définir'

    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': process.env.BREVO_API_KEY!,
      },
      body: JSON.stringify({
        sender: {
          name: process.env.BREVO_SENDER_NAME || 'MDjambo',
          email: process.env.BREVO_SENDER_EMAIL || 'commandes@mdjambo.be',
        },
        to: [{ email: order.customer_email }],
        subject: `Confirmation de commande #${order.order_number} - ${order.establishment?.name}`,
        htmlContent: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; }
              .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 16px; padding: 32px; }
              .header { text-align: center; margin-bottom: 24px; }
              .order-number { font-size: 32px; font-weight: bold; color: #FF6B00; margin: 16px 0; }
              .pickup-code { background: #f5f5f5; padding: 16px; border-radius: 12px; text-align: center; margin: 24px 0; }
              .pickup-code-value { font-size: 28px; font-weight: bold; letter-spacing: 4px; }
              .section { margin: 24px 0; }
              .section-title { font-weight: bold; margin-bottom: 12px; color: #666; }
              .items-table { width: 100%; border-collapse: collapse; }
              .total-row { font-weight: bold; font-size: 18px; }
              .footer { text-align: center; color: #999; font-size: 12px; margin-top: 32px; padding-top: 24px; border-top: 1px solid #eee; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div style="font-size: 48px;">🍟</div>
                <div style="font-size: 24px; font-weight: bold; color: #333;">${order.establishment?.name || 'MDjambo'}</div>
              </div>
              <div style="text-align: center;">
                <p style="color: #22c55e; font-size: 24px; margin: 0;">✅ Commande confirmée !</p>
                <div class="order-number">#${order.order_number}</div>
              </div>
              ${order.pickup_code ? `
              <div class="pickup-code">
                <p style="margin: 0 0 8px 0; color: #666;">Code de retrait</p>
                <div class="pickup-code-value">${order.pickup_code}</div>
              </div>` : ''}
              <div class="section">
                <div class="section-title">📅 ${order.order_type === 'delivery' ? 'Livraison' : 'Retrait'}</div>
                <p style="margin: 0;">${pickupTime}</p>
                ${order.order_type === 'pickup' && order.establishment?.address
                  ? `<p style="margin: 4px 0 0 0; color: #666;">📍 ${order.establishment.address}</p>` : ''}
              </div>
              <div class="section">
                <div class="section-title">🛒 Votre commande</div>
                <table class="items-table">
                  ${itemsHtml}
                  <tr class="total-row">
                    <td style="padding: 12px 8px;">Total</td>
                    <td style="padding: 12px 8px; text-align: right; color: #FF6B00;">${order.total.toFixed(2)}€</td>
                  </tr>
                </table>
              </div>
              <div class="footer">
                <p>Merci pour votre commande !</p>
                ${order.establishment?.phone ? `<p>📞 ${order.establishment.phone}</p>` : ''}
                <p>© ${new Date().getFullYear()} MDjambo - Tous droits réservés</p>
              </div>
            </div>
          </body>
          </html>
        `,
      }),
    })

    console.log(`Email de confirmation envoyé pour commande ${orderId}`)
  } catch (error) {
    console.error('Erreur envoi email confirmation:', error)
  }
}