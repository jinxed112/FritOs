import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Calcul de distance Haversine (en km)
function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371 // Rayon de la Terre en km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// Estimation du temps de trajet (vitesse moyenne 30 km/h en ville)
function estimateDuration(distanceKm: number): number {
  return Math.ceil(distanceKm / 30 * 60) // minutes
}

export async function POST(request: NextRequest) {
  try {
    const { establishmentId, latitude, longitude } = await request.json()

    if (!establishmentId || latitude === undefined || longitude === undefined) {
      return NextResponse.json(
        { error: 'establishmentId, latitude et longitude requis' },
        { status: 400 }
      )
    }

    // Récupérer l'établissement avec ses coordonnées
    const { data: establishment, error: estError } = await supabase
      .from('establishments')
      .select('id, name, latitude, longitude, delivery_enabled')
      .eq('id', establishmentId)
      .single()

    if (estError || !establishment) {
      return NextResponse.json(
        { error: 'Établissement non trouvé' },
        { status: 404 }
      )
    }

    if (!establishment.delivery_enabled) {
      return NextResponse.json({
        isDeliverable: false,
        reason: 'La livraison n\'est pas disponible pour cet établissement',
      })
    }

    // Récupérer les zones de livraison actives
    const { data: zones, error: zonesError } = await supabase
      .from('delivery_zones')
      .select('*')
      .eq('establishment_id', establishmentId)
      .eq('is_active', true)
      .order('max_distance_km', { ascending: true })

    if (zonesError) {
      console.error('Erreur zones:', zonesError)
      return NextResponse.json(
        { error: 'Erreur lors de la récupération des zones' },
        { status: 500 }
      )
    }

    // Si pas de zones configurées, utiliser une zone par défaut
    if (!zones || zones.length === 0) {
      // Zone par défaut : 10 km, 3€ de frais
      const estLat = establishment.latitude || 50.4667 // Jurbise par défaut
      const estLng = establishment.longitude || 3.9167
      
      const distance = haversineDistance(estLat, estLng, latitude, longitude)
      const duration = estimateDuration(distance)
      
      if (distance <= 10) {
        return NextResponse.json({
          isDeliverable: true,
          distance: Math.round(distance * 10) / 10,
          duration,
          fee: 3.00,
          zoneName: 'Zone standard',
        })
      } else {
        return NextResponse.json({
          isDeliverable: false,
          distance: Math.round(distance * 10) / 10,
          duration,
          reason: 'Adresse trop éloignée (max 10 km)',
        })
      }
    }

    // Calculer la distance depuis l'établissement
    const estLat = establishment.latitude
    const estLng = establishment.longitude

    if (!estLat || !estLng) {
      return NextResponse.json(
        { error: 'Coordonnées de l\'établissement non configurées' },
        { status: 500 }
      )
    }

    const distance = haversineDistance(estLat, estLng, latitude, longitude)
    const duration = estimateDuration(distance)

    // Trouver la zone applicable (la première où la distance est inférieure au max)
    const applicableZone = zones.find(zone => distance <= zone.max_distance_km)

    if (applicableZone) {
      return NextResponse.json({
        isDeliverable: true,
        distance: Math.round(distance * 10) / 10,
        duration,
        fee: applicableZone.delivery_fee,
        zoneName: applicableZone.name,
        minOrder: applicableZone.min_order_amount || 0,
      })
    }

    // Aucune zone applicable = trop loin
    const maxZone = zones[zones.length - 1]
    return NextResponse.json({
      isDeliverable: false,
      distance: Math.round(distance * 10) / 10,
      duration,
      reason: `Adresse trop éloignée (max ${maxZone.max_distance_km} km)`,
    })

  } catch (error: any) {
    console.error('Delivery check error:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}
