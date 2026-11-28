import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth/require-staff'

export const dynamic = 'force-dynamic'

// POST : compte l'utilisation d'un code promo, une fois la commande payée.
// Le compteur ne bouge pas à la création de la commande : un paiement abandonné
// ou refusé ne doit pas consommer le code (même règle que le site de commande).
// Le témoin `metadata.promo_compte` rend l'appel rejouable sans compter deux fois.
export async function POST(request: NextRequest) {
  const auth = await requireStaff()
  if (auth.response) return auth.response

  try {
    const { orderId } = await request.json()
    if (!orderId) {
      return NextResponse.json({ error: 'orderId requis' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: order } = await supabase
      .from('orders')
      .select('id, payment_status, promo_code_id, metadata')
      .eq('id', orderId)
      .maybeSingle()

    if (!order) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
    }
    if (!order.promo_code_id || order.payment_status !== 'paid') {
      return NextResponse.json({ success: true, counted: false })
    }

    const metadata = (order.metadata && typeof order.metadata === 'object') ? order.metadata : {}
    if (metadata.promo_compte === true) {
      return NextResponse.json({ success: true, counted: false })
    }

    const { error: temoinErreur } = await supabase
      .from('orders')
      .update({ metadata: { ...metadata, promo_compte: true } })
      .eq('id', order.id)
    if (temoinErreur) throw temoinErreur

    const { data: promo } = await supabase
      .from('promo_codes')
      .select('usage_count')
      .eq('id', order.promo_code_id)
      .maybeSingle()
    if (promo) {
      const { error: compteurErreur } = await supabase
        .from('promo_codes')
        .update({ usage_count: (promo.usage_count || 0) + 1 })
        .eq('id', order.promo_code_id)
      if (compteurErreur) throw compteurErreur
    }

    return NextResponse.json({ success: true, counted: !!promo })
  } catch (e) {
    console.error('Erreur décompte code promo:', e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
