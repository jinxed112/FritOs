import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

const DEVICE_COOKIE_NAME = 'selected_device'

export async function POST(request: NextRequest) {
  try {
    // 1. Récupérer le device depuis le cookie
    const cookieStore = await cookies()
    const deviceCookie = cookieStore.get(DEVICE_COOKIE_NAME)?.value

    if (!deviceCookie) {
      return NextResponse.json({ error: 'Aucun device sélectionné' }, { status: 401 })
    }

    let device
    try {
      device = JSON.parse(deviceCookie)
    } catch {
      return NextResponse.json({ error: 'Cookie device invalide' }, { status: 401 })
    }

    if (!device?.id || !device?.establishmentId) {
      return NextResponse.json({ error: 'Device invalide' }, { status: 401 })
    }

    // 2. Récupérer les données de la requête
    const { orderId, newStatus, isOffered } = await request.json()

    if (!orderId || !newStatus) {
      return NextResponse.json({ error: 'orderId et newStatus requis' }, { status: 400 })
    }

    // Valider le statut
    const validStatuses = ['pending', 'preparing', 'ready', 'completed', 'cancelled']
    if (!validStatuses.includes(newStatus)) {
      return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // 3. Mettre à jour la commande
    if (isOffered) {
      // Commande offerte (temp_orders)
      if (newStatus === 'completed') {
        // Vérifier que la commande appartient à cet établissement
        const { data: tempOrder } = await supabase
          .from('temp_orders')
          .select('id, establishment_id')
          .eq('id', orderId)
          .eq('establishment_id', device.establishmentId)
          .single()

        if (!tempOrder) {
          return NextResponse.json({ error: 'Commande non trouvée' }, { status: 404 })
        }

        const { error } = await supabase
          .from('temp_orders')
          .delete()
          .eq('id', orderId)

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 })
        }
      } else {
        // Vérifier que la commande appartient à cet établissement
        const { data: tempOrder } = await supabase
          .from('temp_orders')
          .select('id, establishment_id')
          .eq('id', orderId)
          .eq('establishment_id', device.establishmentId)
          .single()

        if (!tempOrder) {
          return NextResponse.json({ error: 'Commande non trouvée' }, { status: 404 })
        }

        const { error } = await supabase
          .from('temp_orders')
          .update({ status: newStatus })
          .eq('id', orderId)

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 })
        }
      }
    } else {
      // Commande normale - vérifier qu'elle appartient à cet établissement
      const { data: order } = await supabase
        .from('orders')
        .select('id, establishment_id')
        .eq('id', orderId)
        .eq('establishment_id', device.establishmentId)
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

      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', orderId)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true, newStatus })

  } catch (error: any) {
    console.error('Update status error:', error)
    return NextResponse.json({ error: error.message || 'Erreur serveur' }, { status: 500 })
  }
}
