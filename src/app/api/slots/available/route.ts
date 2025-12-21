import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type SlotType = 'pickup' | 'delivery'

interface AvailableSlot {
  start: string       // ISO string
  end: string         // ISO string
  label: string       // "19h00 - 19h30"
  spotsLeft: number   // Places restantes
  isFirstAvailable: boolean
}

interface SlotConfig {
  slot_duration_min: number
  slot_duration_max: number
  auto_adapt: boolean
  threshold_low: number
  threshold_high: number
  max_orders_per_slot: number
  min_advance_minutes: number
  max_advance_hours: number
  buffer_minutes: number
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const establishmentId = searchParams.get('establishmentId')
    const type = (searchParams.get('type') || 'pickup') as SlotType
    const date = searchParams.get('date') // YYYY-MM-DD, défaut aujourd'hui
    
    // Pour livraison: temps de trajet en minutes
    const travelMinutes = parseInt(searchParams.get('travelMinutes') || '0')

    if (!establishmentId) {
      return NextResponse.json({ error: 'establishmentId requis' }, { status: 400 })
    }

    // 1. Récupérer la config des créneaux
    const { data: configData } = await supabase
      .from('slot_config')
      .select('*')
      .eq('establishment_id', establishmentId)
      .single()

    const config: SlotConfig = configData || {
      slot_duration_min: 15,
      slot_duration_max: 30,
      auto_adapt: true,
      threshold_low: 5,
      threshold_high: 10,
      max_orders_per_slot: 8,
      min_advance_minutes: 15,
      max_advance_hours: 4,
      buffer_minutes: 5,
    }

    // 2. Calculer le temps de préparation actuel
    const currentPrepTime = await getCurrentPrepTime(establishmentId)
    
    // 3. Calculer la durée de créneau adaptée
    const slotDuration = await getSlotDuration(establishmentId, config)
    
    // 4. Compter les commandes par créneau déjà réservé
    const targetDate = date || new Date().toISOString().split('T')[0]
    const { data: reservedSlots } = await supabase
      .from('reserved_slots')
      .select('slot_start, slot_end')
      .eq('establishment_id', establishmentId)
      .eq('slot_date', targetDate)
      .eq('slot_type', type)
      .neq('status', 'cancelled')

    // Compter les réservations par créneau
    const slotCounts: Record<string, number> = {}
    reservedSlots?.forEach(slot => {
      const key = `${slot.slot_start}-${slot.slot_end}`
      slotCounts[key] = (slotCounts[key] || 0) + 1
    })

    // 5. Récupérer les horaires d'ouverture
    const { data: establishment } = await supabase
      .from('establishments')
      .select('opening_hours')
      .eq('id', establishmentId)
      .single()

    // 6. Générer les créneaux disponibles
    const now = new Date()
    const slots: AvailableSlot[] = []
    
    // Temps minimum avant premier créneau
    // = temps prépa actuel + buffer + temps trajet (si livraison)
    const minWaitMinutes = currentPrepTime + config.buffer_minutes + travelMinutes
    const earliestSlotStart = new Date(now.getTime() + Math.max(minWaitMinutes, config.min_advance_minutes) * 60000)
    
    // Arrondir au prochain créneau (ex: 18h37 → 18h45 si créneaux de 15min)
    const roundedMinutes = Math.ceil(earliestSlotStart.getMinutes() / slotDuration) * slotDuration
    earliestSlotStart.setMinutes(roundedMinutes, 0, 0)
    
    // Générer les créneaux jusqu'à max_advance_hours
    const maxTime = new Date(now.getTime() + config.max_advance_hours * 3600000)
    
    let currentSlotStart = new Date(earliestSlotStart)
    let isFirst = true
    
    // Horaires d'ouverture par défaut
    const openingTime = '11:00'
    const closingTime = '22:00'
    
    while (currentSlotStart < maxTime) {
      const currentSlotEnd = new Date(currentSlotStart.getTime() + slotDuration * 60000)
      
      // Vérifier si dans les horaires d'ouverture
      const slotTimeStr = currentSlotStart.toTimeString().slice(0, 5)
      if (slotTimeStr >= openingTime && slotTimeStr < closingTime) {
        
        const slotKey = `${slotTimeStr}-${currentSlotEnd.toTimeString().slice(0, 5)}`
        const currentCount = slotCounts[slotKey] || 0
        const spotsLeft = config.max_orders_per_slot - currentCount
        
        if (spotsLeft > 0) {
          slots.push({
            start: currentSlotStart.toISOString(),
            end: currentSlotEnd.toISOString(),
            label: `${formatTime(currentSlotStart)} - ${formatTime(currentSlotEnd)}`,
            spotsLeft,
            isFirstAvailable: isFirst,
          })
          isFirst = false
        }
      }
      
      currentSlotStart = new Date(currentSlotStart.getTime() + slotDuration * 60000)
    }

    return NextResponse.json({
      success: true,
      slots,
      meta: {
        currentPrepTime,
        slotDuration,
        travelMinutes,
        totalWaitMinutes: minWaitMinutes,
      }
    })

  } catch (error: any) {
    console.error('Slots API error:', error)
    return NextResponse.json(
      { error: 'Erreur serveur', message: error.message },
      { status: 500 }
    )
  }
}

// Calculer le temps de préparation moyen actuel
async function getCurrentPrepTime(establishmentId: string): Promise<number> {
  // Méthode 1: Temps moyen des commandes terminées dans la dernière heure
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

  // Méthode 2: Estimation basée sur la file d'attente actuelle
  const { data: pendingOrders } = await supabase
    .from('orders')
    .select('id')
    .eq('establishment_id', establishmentId)
    .in('status', ['pending', 'preparing'])

  const queueSize = pendingOrders?.length || 0
  
  // Estimation: 5 min par commande, minimum 10 min
  return Math.max(10, queueSize * 5)
}

// Calculer la durée de créneau adaptée à l'affluence
async function getSlotDuration(establishmentId: string, config: SlotConfig): Promise<number> {
  if (!config.auto_adapt) {
    return config.slot_duration_min
  }

  const oneHourAgo = new Date(Date.now() - 3600000).toISOString()
  
  const { data: recentOrders, count } = await supabase
    .from('orders')
    .select('id', { count: 'exact' })
    .eq('establishment_id', establishmentId)
    .gte('created_at', oneHourAgo)

  const ordersLastHour = count || 0

  if (ordersLastHour < config.threshold_low) {
    return config.slot_duration_min
  } else if (ordersLastHour > config.threshold_high) {
    return config.slot_duration_max
  } else {
    // Interpolation linéaire
    const ratio = (ordersLastHour - config.threshold_low) / 
                  (config.threshold_high - config.threshold_low)
    return Math.round(
      config.slot_duration_min + ratio * (config.slot_duration_max - config.slot_duration_min)
    )
  }
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('fr-BE', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  }).replace(':', 'h')
}
