import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface DeliveryOrder {
  id: string
  order_number: string
  scheduled_slot_start: string
  scheduled_slot_end: string
  delivery_lat: number
  delivery_lng: number
  delivery_address: string
  estimated_travel_minutes: number
}

interface DeliveryCluster {
  orders: DeliveryOrder[]
  centroid: { lat: number, lng: number }
  totalTravelTime: number
  suggestedDeparture: string
  suggestedKitchenLaunch: string
}

// Calculer la distance entre 2 points (Haversine)
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Rayon de la Terre en km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

// Estimer le temps de trajet entre 2 points (simplifiée)
function estimateTravelTime(distanceKm: number): number {
  // Estimation: 30 km/h en moyenne en ville
  return Math.ceil(distanceKm / 30 * 60)
}

// Vérifier si 2 créneaux sont compatibles (se chevauchent)
function slotsOverlap(
  start1: string, end1: string,
  start2: string, end2: string
): boolean {
  const s1 = new Date(start1).getTime()
  const e1 = new Date(end1).getTime()
  const s2 = new Date(start2).getTime()
  const e2 = new Date(end2).getTime()
  
  return s1 < e2 && s2 < e1
}

// Trouver le créneau commun entre plusieurs commandes
function findCommonWindow(orders: DeliveryOrder[]): { start: Date, end: Date } | null {
  if (orders.length === 0) return null
  
  let latestStart = new Date(orders[0].scheduled_slot_start)
  let earliestEnd = new Date(orders[0].scheduled_slot_end)
  
  for (const order of orders.slice(1)) {
    const start = new Date(order.scheduled_slot_start)
    const end = new Date(order.scheduled_slot_end)
    
    if (start > latestStart) latestStart = start
    if (end < earliestEnd) earliestEnd = end
  }
  
  if (latestStart >= earliestEnd) return null
  
  return { start: latestStart, end: earliestEnd }
}

// Algorithme de clustering simple (basé sur distance et créneaux)
function clusterOrders(
  orders: DeliveryOrder[],
  maxDistanceKm: number = 1.5, // 1.5 km max entre commandes du même cluster
  maxTravelBetween: number = 3  // 3 min max de trajet entre les stops
): DeliveryCluster[] {
  const clusters: DeliveryCluster[] = []
  const assigned = new Set<string>()
  
  // Trier par heure de début de créneau
  const sortedOrders = [...orders].sort(
    (a, b) => new Date(a.scheduled_slot_start).getTime() - new Date(b.scheduled_slot_start).getTime()
  )
  
  for (const order of sortedOrders) {
    if (assigned.has(order.id)) continue
    
    // Commencer un nouveau cluster
    const cluster: DeliveryOrder[] = [order]
    assigned.add(order.id)
    
    // Chercher des commandes proches avec créneaux compatibles
    for (const candidate of sortedOrders) {
      if (assigned.has(candidate.id)) continue
      
      // Vérifier si les créneaux se chevauchent
      const hasOverlap = cluster.every(o => 
        slotsOverlap(o.scheduled_slot_start, o.scheduled_slot_end, 
                     candidate.scheduled_slot_start, candidate.scheduled_slot_end)
      )
      
      if (!hasOverlap) continue
      
      // Vérifier la distance avec tous les points du cluster
      const isClose = cluster.every(o => {
        const dist = haversineDistance(
          o.delivery_lat, o.delivery_lng,
          candidate.delivery_lat, candidate.delivery_lng
        )
        return dist <= maxDistanceKm
      })
      
      if (!isClose) continue
      
      // Vérifier que le temps de trajet total reste raisonnable
      const travelBetween = estimateTravelTime(
        haversineDistance(
          cluster[cluster.length - 1].delivery_lat,
          cluster[cluster.length - 1].delivery_lng,
          candidate.delivery_lat,
          candidate.delivery_lng
        )
      )
      
      if (travelBetween > maxTravelBetween) continue
      
      // Ajouter au cluster
      cluster.push(candidate)
      assigned.add(candidate.id)
    }
    
    // Calculer les métriques du cluster
    const centroid = {
      lat: cluster.reduce((sum, o) => sum + o.delivery_lat, 0) / cluster.length,
      lng: cluster.reduce((sum, o) => sum + o.delivery_lng, 0) / cluster.length,
    }
    
    // Temps total estimé pour la tournée
    let totalTravel = cluster[0].estimated_travel_minutes // Temps jusqu'au premier stop
    for (let i = 1; i < cluster.length; i++) {
      totalTravel += estimateTravelTime(
        haversineDistance(
          cluster[i-1].delivery_lat, cluster[i-1].delivery_lng,
          cluster[i].delivery_lat, cluster[i].delivery_lng
        )
      )
    }
    totalTravel += 2 * cluster.length // 2 min par stop pour la remise
    
    // Trouver le créneau commun
    const commonWindow = findCommonWindow(cluster)
    
    // Calculer l'heure de départ suggérée
    // = début du créneau commun - temps jusqu'au premier stop
    const suggestedDeparture = commonWindow 
      ? new Date(commonWindow.start.getTime() - cluster[0].estimated_travel_minutes * 60000)
      : new Date(new Date(cluster[0].scheduled_slot_start).getTime() - cluster[0].estimated_travel_minutes * 60000)
    
    clusters.push({
      orders: cluster,
      centroid,
      totalTravelTime: totalTravel,
      suggestedDeparture: suggestedDeparture.toISOString(),
      suggestedKitchenLaunch: '', // Calculé côté appelant avec temps prépa
    })
  }
  
  return clusters
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const establishmentId = searchParams.get('establishmentId')

    if (!establishmentId) {
      return NextResponse.json({ error: 'establishmentId requis' }, { status: 400 })
    }

    // Récupérer les commandes de livraison prêtes ou en attente
    const { data: ordersData, error } = await supabase
      .from('orders')
      .select(`
        id, order_number, scheduled_slot_start, scheduled_slot_end,
        reserved_slots!inner (
          delivery_address, delivery_lat, delivery_lng, estimated_travel_minutes
        )
      `)
      .eq('establishment_id', establishmentId)
      .eq('order_type', 'delivery')
      .in('status', ['ready', 'confirmed'])
      .is('delivery_round_id', null)
      .not('scheduled_slot_start', 'is', null)
      .order('scheduled_slot_start')

    if (error) throw error

    const orders: DeliveryOrder[] = (ordersData || [])
      .filter((o: any) => o.reserved_slots?.[0]?.delivery_lat && o.reserved_slots?.[0]?.delivery_lng)
      .map((o: any) => ({
        id: o.id,
        order_number: o.order_number,
        scheduled_slot_start: o.scheduled_slot_start,
        scheduled_slot_end: o.scheduled_slot_end,
        delivery_lat: o.reserved_slots[0].delivery_lat,
        delivery_lng: o.reserved_slots[0].delivery_lng,
        delivery_address: o.reserved_slots[0].delivery_address,
        estimated_travel_minutes: o.reserved_slots[0].estimated_travel_minutes || 10,
      }))

    // Calculer le temps de préparation actuel
    const currentPrepTime = await getCurrentPrepTime(establishmentId)
    
    // Grouper les commandes
    const clusters = clusterOrders(orders)
    
    // Ajouter l'heure de lancement cuisine pour chaque cluster
    const clustersWithKitchen = clusters.map(cluster => {
      const departure = new Date(cluster.suggestedDeparture)
      const bufferMinutes = 5
      const kitchenLaunch = new Date(departure.getTime() - (currentPrepTime + bufferMinutes) * 60000)
      
      return {
        ...cluster,
        suggestedKitchenLaunch: kitchenLaunch.toISOString(),
        currentPrepTime,
      }
    })

    return NextResponse.json({
      success: true,
      clusters: clustersWithKitchen,
      totalOrders: orders.length,
      totalClusters: clusters.length,
      currentPrepTime,
    })

  } catch (error: any) {
    console.error('Cluster API error:', error)
    return NextResponse.json(
      { error: 'Erreur serveur', message: error.message },
      { status: 500 }
    )
  }
}

// Créer une tournée à partir d'un cluster
export async function POST(request: NextRequest) {
  try {
    const { establishmentId, driverId, orderIds } = await request.json()

    if (!establishmentId || !orderIds?.length) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
    }

    // Récupérer les commandes
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select(`
        id, order_number, scheduled_slot_start, scheduled_slot_end,
        reserved_slots!inner (
          delivery_address, delivery_lat, delivery_lng, estimated_travel_minutes
        )
      `)
      .in('id', orderIds)
      .order('scheduled_slot_start')

    if (ordersError) throw ordersError

    // Créer la tournée
    const { data: round, error: roundError } = await supabase
      .from('delivery_rounds')
      .insert({
        establishment_id: establishmentId,
        driver_id: driverId || null,
        status: driverId ? 'ready' : 'pending',
        total_stops: ordersData.length,
      })
      .select()
      .single()

    if (roundError) throw roundError

    // Créer les stops (dans l'ordre des créneaux)
    const stops = ordersData.map((order: any, index: number) => ({
      round_id: round.id,
      order_id: order.id,
      stop_order: index + 1,
      address: order.reserved_slots[0].delivery_address,
      latitude: order.reserved_slots[0].delivery_lat,
      longitude: order.reserved_slots[0].delivery_lng,
      customer_slot_start: order.scheduled_slot_start,
      customer_slot_end: order.scheduled_slot_end,
      travel_minutes_from_previous: index === 0 
        ? order.reserved_slots[0].estimated_travel_minutes 
        : estimateTravelTime(
            haversineDistance(
              ordersData[index-1].reserved_slots[0].delivery_lat,
              ordersData[index-1].reserved_slots[0].delivery_lng,
              order.reserved_slots[0].delivery_lat,
              order.reserved_slots[0].delivery_lng
            )
          ),
      status: 'pending',
    }))

    const { error: stopsError } = await supabase
      .from('delivery_round_stops')
      .insert(stops)

    if (stopsError) throw stopsError

    // Lier les commandes à la tournée
    await supabase
      .from('orders')
      .update({ delivery_round_id: round.id })
      .in('id', orderIds)

    return NextResponse.json({
      success: true,
      round: {
        id: round.id,
        totalStops: stops.length,
      }
    })

  } catch (error: any) {
    console.error('Create round error:', error)
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
    .in('status', ['pending', 'confirmed', 'preparing'])

  const queueSize = pendingOrders?.length || 0
  return Math.max(10, queueSize * 5)
}
