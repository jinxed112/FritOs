import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Client admin avec service_role key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(request: NextRequest) {
  try {
    // 1. Vérifier le cookie de session device
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get('device_session')?.value

    if (!sessionToken) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // 2. Vérifier que la session est valide et récupérer le device
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('device_sessions')
      .select(`
        id,
        device:devices (
          id, device_code, establishment_id, is_active
        )
      `)
      .eq('session_token', sessionToken)
      .eq('is_valid', true)
      .single()

    if (sessionError || !session || !session.device) {
      return NextResponse.json({ error: 'Session invalide' }, { status: 401 })
    }

    const device = session.device as any

    if (!device.is_active) {
      return NextResponse.json({ error: 'Device désactivé' }, { status: 401 })
    }

    // 3. Récupérer les données de la requête
    const { orderId, newStatus, isOffered } = await request.json()

    if (!orderId || !newStatus) {
      return NextResponse.json({ error: 'orderId et newStatus requis' }, { status: 400 })
    }

    // Valider le statut
    const validStatuses = ['pending', 'preparing', 'ready', 'completed', 'cancelled']
    if (!validStatuses.includes(newStatus)) {
      return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
    }

    // 4. Mettre à jour la commande
    if (isOffered) {
      // Commande offerte (temp_orders)
      if (newStatus === 'completed') {
        // Vérifier que la commande appartient à cet établissement
        const { data: tempOrder } = await supabaseAdmin
          .from('temp_orders')
          .select('id, establishment_id')
          .eq('id', orderId)
          .eq('establishment_id', device.establishment_id)
          .single()

        if (!tempOrder) {
          return NextResponse.json({ error: 'Commande non trouvée' }, { status: 404 })
        }

        const { error } = await supabaseAdmin
          .from('temp_orders')
          .delete()
          .eq('id', orderId)

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 })
        }
      } else {
        // Vérifier que la commande appartient à cet établissement
        const { data: tempOrder } = await supabaseAdmin
          .from('temp_orders')
          .select('id, establishment_id')
          .eq('id', orderId)
          .eq('establishment_id', device.establishment_id)
          .single()

        if (!tempOrder) {
          return NextResponse.json({ error: 'Commande non trouvée' }, { status: 404 })
        }

        const { error } = await supabaseAdmin
          .from('temp_orders')
          .update({ status: newStatus })
          .eq('id', orderId)

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 })
        }
      }
    } else {
      // Commande normale - vérifier qu'elle appartient à cet établissement
      const { data: order } = await supabaseAdmin
        .from('orders')
        .select('id, establishment_id')
        .eq('id', orderId)
        .eq('establishment_id', device.establishment_id)
        .single()

      if (!order) {
        return NextResponse.json({ error: 'Commande non trouvée' }, { status: 404 })
      }

      const updateData: any = {
        status: newStatus,
        updated_at: new Date().toISOString()
      }

      if (newStatus === 'preparing') {
        updateData.preparation_started_at = new Date().toISOString()
      }

      const { error } = await supabaseAdmin
        .from('orders')
        .update(updateData)
        .eq('id', orderId)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    // 5. Mettre à jour last_used_at de la session
    await supabaseAdmin
      .from('device_sessions')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', session.id)

    return NextResponse.json({ success: true, newStatus })

  } catch (error: any) {
    console.error('Update status error:', error)
    return NextResponse.json({ error: error.message || 'Erreur serveur' }, { status: 500 })
  }
}