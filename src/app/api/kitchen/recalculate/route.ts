import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Cette API recalcule les heures de lancement cuisine pour toutes les commandes programmées
// Elle doit être appelée régulièrement (toutes les minutes via cron ou realtime)

export async function POST(request: NextRequest) {
  try {
    const { establishmentId } = await request.json()

    if (!establishmentId) {
      return NextResponse.json({ error: 'establishmentId requis' }, { status: 400 })
    }

    // 1. Calculer le temps de préparation actuel
    const currentPrepTime = await getCurrentPrepTime(establishmentId)
    
    // 2. Récupérer les commandes programmées non encore lancées
    const now = new Date()
    const { data: scheduledOrders, error } = await supabase
      .from('orders')
      .select(`
        id,
        scheduled_slot_start,
        scheduled_slot_end,
        order_type,
        status,
        kitchen_launch_at,
        reserved_slots!inner (
          estimated_travel_minutes,
          slot_type
        )
      `)
      .eq('establishment_id', establishmentId)
      .not('scheduled_slot_start', 'is', null)
      .in('status', ['pending'])
      .order('scheduled_slot_start')

    if (error) throw error

    const updates: any[] = []
    const toLaunch: string[] = []
    const bufferMinutes = 5

    for (const order of scheduledOrders || []) {
      const slotStart = new Date(order.scheduled_slot_start)
      const reservedSlot = order.reserved_slots?.[0]
      const travelMinutes = reservedSlot?.estimated_travel_minutes || 0
      const isDelivery = reservedSlot?.slot_type === 'delivery' || order.order_type === 'delivery'

      // Calculer la nouvelle heure de lancement
      // Pour pickup: slot_start - prep_time - buffer
      // Pour delivery: slot_start - travel_time - prep_time - buffer
      const launchOffset = currentPrepTime + bufferMinutes + (isDelivery ? travelMinutes : 0)
      const newKitchenLaunch = new Date(slotStart.getTime() - launchOffset * 60000)

      // Mettre à jour si différent
      const currentLaunch = order.kitchen_launch_at ? new Date(order.kitchen_launch_at) : null
      if (!currentLaunch || Math.abs(currentLaunch.getTime() - newKitchenLaunch.getTime()) > 60000) {
        updates.push({
          id: order.id,
          kitchen_launch_at: newKitchenLaunch.toISOString(),
          estimated_prep_minutes: currentPrepTime,
        })
      }

      // Vérifier si c'est le moment de lancer
      if (newKitchenLaunch <= now) {
        toLaunch.push(order.id)
      }
    }

    // 3. Appliquer les mises à jour
    for (const update of updates) {
      await supabase
        .from('orders')
        .update({
          kitchen_launch_at: update.kitchen_launch_at,
          estimated_prep_minutes: update.estimated_prep_minutes,
        })
        .eq('id', update.id)
    }

    // 4. Lancer les commandes qui doivent partir en cuisine
    // (changer leur priorité pour qu'elles remontent)
    if (toLaunch.length > 0) {
      await supabase
        .from('orders')
        .update({
          priority_score: 1000, // Haute priorité
          status: 'confirmed', // Passer en confirmé pour apparaître sur KDS
        })
        .in('id', toLaunch)
    }

    return NextResponse.json({
      success: true,
      currentPrepTime,
      ordersUpdated: updates.length,
      ordersLaunched: toLaunch.length,
      launchedIds: toLaunch,
    })

  } catch (error: any) {
    console.error('Recalculate error:', error)
    return NextResponse.json(
      { error: 'Erreur serveur', message: error.message },
      { status: 500 }
    )
  }
}

// GET pour obtenir l'état actuel sans modifier
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const establishmentId = searchParams.get('establishmentId')

    if (!establishmentId) {
      return NextResponse.json({ error: 'establishmentId requis' }, { status: 400 })
    }

    const currentPrepTime = await getCurrentPrepTime(establishmentId)
    
    // Commandes en attente de lancement
    const { data: pendingScheduled } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        scheduled_slot_start,
        kitchen_launch_at,
        order_type,
        status
      `)
      .eq('establishment_id', establishmentId)
      .not('scheduled_slot_start', 'is', null)
      .eq('status', 'pending')
      .order('kitchen_launch_at')

    // Commandes en cours
    const { data: inProgress } = await supabase
      .from('orders')
      .select('id, order_number, created_at, status')
      .eq('establishment_id', establishmentId)
      .in('status', ['confirmed', 'preparing'])
      .order('created_at')

    const now = new Date()

    return NextResponse.json({
      currentPrepTime,
      queueSize: inProgress?.length || 0,
      scheduledOrders: pendingScheduled?.map(order => ({
        ...order,
        minutesUntilLaunch: order.kitchen_launch_at 
          ? Math.round((new Date(order.kitchen_launch_at).getTime() - now.getTime()) / 60000)
          : null,
        shouldLaunchNow: order.kitchen_launch_at && new Date(order.kitchen_launch_at) <= now,
      })),
      ordersInProgress: inProgress,
    })

  } catch (error: any) {
    console.error('Kitchen status error:', error)
    return NextResponse.json(
      { error: 'Erreur serveur', message: error.message },
      { status: 500 }
    )
  }
}

async function getCurrentPrepTime(establishmentId: string): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString()
  
  // Temps moyen des commandes terminées récemment
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

  // Estimation basée sur la file
  const { data: pendingOrders } = await supabase
    .from('orders')
    .select('id')
    .eq('establishment_id', establishmentId)
    .in('status', ['pending', 'confirmed', 'preparing'])

  const queueSize = pendingOrders?.length || 0
  return Math.max(10, queueSize * 5)
}
