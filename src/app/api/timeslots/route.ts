import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type TimeSlot = {
  time: string
  label: string
  available: boolean
  remainingSlots: number
}

type DaySlots = {
  date: string
  dayLabel: string
  slots: TimeSlot[]
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const establishmentId = searchParams.get('establishmentId')
    const orderType = searchParams.get('orderType') || 'pickup' // pickup ou delivery
    const days = parseInt(searchParams.get('days') || '7')

    if (!establishmentId) {
      return NextResponse.json(
        { error: 'establishmentId requis' },
        { status: 400 }
      )
    }

    // Charger la config des créneaux
    const { data: config, error: configError } = await supabase
      .from('time_slots_config')
      .select('*')
      .eq('establishment_id', establishmentId)
      .single()

    if (configError || !config) {
      return NextResponse.json(
        { error: 'Configuration des créneaux non trouvée' },
        { status: 404 }
      )
    }

    // Charger la config de livraison si nécessaire
    let additionalMinutes = 0
    if (orderType === 'delivery') {
      const { data: deliveryConfig } = await supabase
        .from('delivery_config')
        .select('additional_delivery_minutes')
        .eq('establishment_id', establishmentId)
        .single()
      
      additionalMinutes = deliveryConfig?.additional_delivery_minutes || 0
    }

    // Charger les exceptions
    const startDate = new Date()
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + days)

    const { data: overrides } = await supabase
      .from('time_slot_overrides')
      .select('*')
      .eq('establishment_id', establishmentId)
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0])

    const overridesMap = new Map(
      (overrides || []).map(o => [o.date, o])
    )

    // Charger les compteurs de commandes existantes
    const { data: slotCounts } = await supabase
      .from('order_slot_counts')
      .select('*')
      .eq('establishment_id', establishmentId)
      .gte('slot_date', startDate.toISOString().split('T')[0])
      .lte('slot_date', endDate.toISOString().split('T')[0])

    const countsMap = new Map(
      (slotCounts || []).map(sc => [`${sc.slot_date}-${sc.slot_time}`, sc.order_count])
    )

    const weeklySchedule = config.weekly_schedule || {}
    const slotDuration = config.slot_duration_minutes || 15
    const minPrepTime = config.min_preparation_minutes || 30
    const maxOrdersPerSlot = config.max_orders_per_slot || 5

    const result: DaySlots[] = []
    const now = new Date()
    const minReadyTime = new Date(now.getTime() + (minPrepTime + additionalMinutes) * 60 * 1000)

    for (let d = 0; d < days; d++) {
      const date = new Date(startDate)
      date.setDate(date.getDate() + d)
      const dateStr = date.toISOString().split('T')[0]
      const dayOfWeek = date.getDay()

      // Vérifier les exceptions
      const override = overridesMap.get(dateStr)
      if (override?.override_type === 'closed') {
        result.push({
          date: dateStr,
          dayLabel: formatDayLabel(date),
          slots: [],
        })
        continue
      }

      // Récupérer le planning du jour
      const daySchedule = weeklySchedule[dayOfWeek.toString()]
      if (!daySchedule?.enabled && !override) {
        result.push({
          date: dateStr,
          dayLabel: formatDayLabel(date),
          slots: [],
        })
        continue
      }

      // Utiliser les horaires de l'exception si disponibles
      const slotsConfig = override?.custom_slots || daySchedule?.slots || []
      const maxOrders = override?.max_orders || maxOrdersPerSlot

      const daySlots: TimeSlot[] = []

      for (const period of slotsConfig) {
        const [openHour, openMin] = period.open.split(':').map(Number)
        const [closeHour, closeMin] = period.close.split(':').map(Number)

        let currentTime = new Date(date)
        currentTime.setHours(openHour, openMin, 0, 0)

        const closeTime = new Date(date)
        closeTime.setHours(closeHour, closeMin, 0, 0)

        while (currentTime < closeTime) {
          const timeStr = `${currentTime.getHours().toString().padStart(2, '0')}:${currentTime.getMinutes().toString().padStart(2, '0')}`
          const countKey = `${dateStr}-${timeStr}`
          const currentCount = countsMap.get(countKey) || 0
          
          // Vérifier si le créneau est dans le futur avec assez de temps de préparation
          const slotDateTime = new Date(date)
          slotDateTime.setHours(currentTime.getHours(), currentTime.getMinutes(), 0, 0)
          
          const isAvailable = slotDateTime > minReadyTime && currentCount < maxOrders

          daySlots.push({
            time: timeStr,
            label: timeStr,
            available: isAvailable,
            remainingSlots: Math.max(0, maxOrders - currentCount),
          })

          currentTime.setMinutes(currentTime.getMinutes() + slotDuration)
        }
      }

      result.push({
        date: dateStr,
        dayLabel: formatDayLabel(date),
        slots: daySlots,
      })
    }

    return NextResponse.json({
      slots: result,
      config: {
        slotDuration,
        minPreparationMinutes: minPrepTime + additionalMinutes,
        maxOrdersPerSlot,
      },
    })

  } catch (error: any) {
    console.error('Erreur timeslots:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

function formatDayLabel(date: Date): string {
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (date.toDateString() === today.toDateString()) {
    return "Aujourd'hui"
  }
  if (date.toDateString() === tomorrow.toDateString()) {
    return 'Demain'
  }

  return date.toLocaleDateString('fr-BE', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  })
}

// POST: Réserver un créneau (incrémenter le compteur)
export async function POST(request: NextRequest) {
  try {
    const { establishmentId, slotDate, slotTime } = await request.json()

    if (!establishmentId || !slotDate || !slotTime) {
      return NextResponse.json(
        { error: 'Paramètres manquants' },
        { status: 400 }
      )
    }

    // Vérifier la disponibilité
    const { data: config } = await supabase
      .from('time_slots_config')
      .select('max_orders_per_slot')
      .eq('establishment_id', establishmentId)
      .single()

    const maxOrders = config?.max_orders_per_slot || 5

    // Upsert le compteur avec gestion de concurrence
    const { data: existing } = await supabase
      .from('order_slot_counts')
      .select('id, order_count')
      .eq('establishment_id', establishmentId)
      .eq('slot_date', slotDate)
      .eq('slot_time', slotTime)
      .maybeSingle()

    if (existing) {
      const currentCount = existing.order_count || 0
      if (currentCount >= maxOrders) {
        return NextResponse.json(
          { error: 'Créneau complet' },
          { status: 400 }
        )
      }

      const { error: updateError } = await supabase
        .from('order_slot_counts')
        .update({ order_count: currentCount + 1 })
        .eq('id', existing.id)
      
      if (updateError) {
        console.error('Erreur update slot count:', updateError)
      }
    } else {
      const { error: insertError } = await supabase
        .from('order_slot_counts')
        .insert({
          establishment_id: establishmentId,
          slot_date: slotDate,
          slot_time: slotTime,
          order_count: 1,
        })
      
      if (insertError) {
        console.error('Erreur insert slot count:', insertError)
      }
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Erreur réservation créneau:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
