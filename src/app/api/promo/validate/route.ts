import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/auth/require-staff'
import { montantRemise, normaliserCode, refusPromoBorne } from '@/lib/promo'

export const dynamic = 'force-dynamic'

// POST : la borne vérifie un code promo saisi par le client.
// Appelée deux fois : à la saisie (pour afficher la remise) puis juste avant de
// créer la commande, avec le sous-total du moment.
export async function POST(request: NextRequest) {
  const auth = await requireStaff()
  if (auth.response) return auth.response

  try {
    const { code, establishmentId, subtotal } = await request.json()
    const saisie = normaliserCode(code)
    const sousTotal = Number(subtotal)

    if (!saisie || !establishmentId || !Number.isFinite(sousTotal) || sousTotal <= 0) {
      return NextResponse.json({ valid: false, error: 'Code manquant' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: promo } = await supabase
      .from('promo_codes')
      .select('id, code, discount_type, discount_value, minimum_purchase, valid_channels, start_date, end_date, usage_limit, usage_count')
      .eq('establishment_id', establishmentId)
      .eq('code', saisie)
      .eq('is_active', true)
      .maybeSingle()

    if (!promo) {
      return NextResponse.json({ valid: false, error: 'Code inconnu' })
    }

    const refus = refusPromoBorne(promo, sousTotal)
    if (refus) {
      return NextResponse.json({ valid: false, error: refus })
    }

    return NextResponse.json({
      valid: true,
      promo: {
        id: promo.id,
        code: promo.code,
        discount_type: promo.discount_type,
        discount_value: Number(promo.discount_value),
        minimum_purchase: Number(promo.minimum_purchase) || 0,
      },
      discount: montantRemise(promo, sousTotal),
    })
  } catch (e) {
    console.error('Erreur validation code promo:', e)
    return NextResponse.json({ valid: false, error: 'Erreur serveur' }, { status: 500 })
  }
}
