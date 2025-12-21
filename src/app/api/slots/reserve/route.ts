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
      orderId,
      slotStart,
      slotEnd,
      slotType,  // 'pickup' | 'delivery'
      // Pour livraison
      deliveryAddress,
      deliveryLat,
      deliveryLng,
      estimatedTravelMinutes,
    } = body

    if (!establishmentId || !slotStart || !slotEnd || !slotType) {
      return NextResponse.json(
        { error: 'Paramètres manquants' },
        { status: 400 }
      )
    }

    const slotDate = new Date(slotStart).toISOString().split('T')[0]
    const slotStartTime = new Date(slotStart).toTimeString().slice(0, 8)
    const slotEndTime = new Date(slotEnd).toTimeString().slice(0, 8)

    // Vérifier qu'il reste de la place
    const { data: config } = await supabase
      .from('slot_config')
      .select('max_orders_per_slot')
      .eq('establishment_id', establishmentId)
      .single()

    const maxOrders = config?.max_orders_per_slot || 8

    const { count } = await supabase
      .from('reserved_slots')
      .select('id', { count: 'exact' })
      .eq('establishment_id', establishmentId)
      .eq('slot_date', slotDate)
      .eq('slot_start', slotStartTime)
      .eq('slot_end', slotEndTime)
      .eq('slot_type', slotType)
      .neq('status', 'cancelled')

    if ((count || 0) >= maxOrders) {
      return NextResponse.json(
        { error: 'Créneau complet', message: 'Ce créneau n\'est plus disponible' },
        { status: 409 }
      )
    }

    // Réserver le créneau
    const { data: reservation, error } = await supabase
      .from('reserved_slots')
      .insert({
        establishment_id: establishmentId,
        order_id: orderId || null,
        slot_date: slotDate,
        slot_start: slotStartTime,
        slot_end: slotEndTime,
        slot_type: slotType,
        delivery_address: deliveryAddress || null,
        delivery_lat: deliveryLat || null,
        delivery_lng: deliveryLng || null,
        estimated_travel_minutes: estimatedTravelMinutes || null,
        status: 'reserved',
      })
      .select()
      .single()

    if (error) throw error

    // Si on a un orderId, mettre à jour la commande avec les infos de créneau
    if (orderId) {
      // Calculer l'heure de lancement en cuisine
      const currentPrepTime = await getCurrentPrepTime(establishmentId)
      const travelTime = estimatedTravelMinutes || 0
      const bufferMinutes = 5
      
      // Pour pickup: lancement = début créneau - temps prépa - buffer
      // Pour delivery: lancement = début créneau - temps trajet - temps prépa - buffer
      const slotStartDate = new Date(slotStart)
      const launchOffset = currentPrepTime + bufferMinutes + (slotType === 'delivery' ? travelTime : 0)
      const kitchenLaunchAt = new Date(slotStartDate.getTime() - launchOffset * 60000)

      await supabase
        .from('orders')
        .update({
          scheduled_slot_start: slotStart,
          scheduled_slot_end: slotEnd,
          kitchen_launch_at: kitchenLaunchAt.toISOString(),
          estimated_prep_minutes: currentPrepTime,
        })
        .eq('id', orderId)
    }

    return NextResponse.json({
      success: true,
      reservation,
    })

  } catch (error: any) {
    console.error('Reserve slot error:', error)
    return NextResponse.json(
      { error: 'Erreur serveur', message: error.message },
      { status: 500 }
    )
  }
}

// Annuler une réservation
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const reservationId = searchParams.get('id')
    const orderId = searchParams.get('orderId')

    if (!reservationId && !orderId) {
      return NextResponse.json(
        { error: 'id ou orderId requis' },
        { status: 400 }
      )
    }

    let query = supabase
      .from('reserved_slots')
      .update({ status: 'cancelled' })

    if (reservationId) {
      query = query.eq('id', reservationId)
    } else {
      query = query.eq('order_id', orderId)
    }

    const { error } = await query

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Cancel slot error:', error)
    return NextResponse.json(
      { error: 'Erreur serveur', message: error.message },
      { status: 500 }
    )
  }
}

async function getCurrentPrepTime(establishmentId: string): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString()
  
  const { data: recentOrders } = await supabase
    .from('orders')
    .select('created_at, completed_at')
    .eq('establishment_id', establishmentId)
    .eq('status', 'completed')
    .gte('completed_at', oneHourAgo)

  if (recentOrders && recentOrders.length >= 3) {
    const avgTime = recentOrders.reduce((sum, order) => {
      const created = new Date(order.created_at)
      const completed = new Date(order.completed_at)
      return sum + (completed.getTime() - created.getTime()) / 60000
    }, 0) / recentOrders.length
    
    return Math.round(avgTime)
  }

  const { data: pendingOrders } = await supabase
    .from('orders')
    .select('id')
    .eq('establishment_id', establishmentId)
    .in('status', ['pending', 'preparing'])

  const queueSize = pendingOrders?.length || 0
  return Math.max(10, queueSize * 5)
}
