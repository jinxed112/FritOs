import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Fallback: Haversine (en km)
function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
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

    const estLat = establishment.latitude
    const estLng = establishment.longitude

    if (!estLat || !estLng) {
      return NextResponse.json(
        { error: 'Coordonnées de l\'établissement non configurées' },
        { status: 500 }
      )
    }

    // Récupérer les zones de livraison actives
    const { data: zones, error: zonesError } = await supabase
      .from('delivery_zones')
      .select('*')
      .eq('establishment_id', establishmentId)
      .eq('is_active', true)
      .order('max_minutes', { ascending: true })

    if (zonesError) {
      console.error('Erreur zones:', zonesError)
      return NextResponse.json(
        { error: 'Erreur lors de la récupération des zones' },
        { status: 500 }
      )
    }

    // Calculer le temps de trajet avec Google Directions API
    let duration = 0
    let distance = 0
    const apiKey = process.env.GOOGLE_MAPS_API_KEY

    if (apiKey) {
      try {
        const origin = `${estLat},${estLng}`
        const destination = `${latitude},${longitude}`
        const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&mode=driving&language=fr&key=${apiKey}`

        const res = await fetch(directionsUrl)
        const data = await res.json()

        if (data.status === 'OK' && data.routes?.length) {
          const leg = data.routes[0].legs[0]
          duration = Math.ceil(leg.duration.value / 60)
          distance = Math.round(leg.distance.value / 100) / 10
        } else {
          // Fallback Haversine
          distance = Math.round(haversineDistance(estLat, estLng, latitude, longitude) * 10) / 10
          duration = Math.ceil(distance / 30 * 60)
        }
      } catch (e) {
        console.error('Erreur Google Directions:', e)
        distance = Math.round(haversineDistance(estLat, estLng, latitude, longitude) * 10) / 10
        duration = Math.ceil(distance / 30 * 60)
      }
    } else {
      // Pas de clé Google — fallback Haversine
      distance = Math.round(haversineDistance(estLat, estLng, latitude, longitude) * 10) / 10
      duration = Math.ceil(distance / 30 * 60)
    }

    // Si pas de zones configurées, utiliser une zone par défaut (20 min, 3€)
    if (!zones || zones.length === 0) {
      if (duration <= 20) {
        return NextResponse.json({
          isDeliverable: true,
          distance,
          duration,
          fee: 3.00,
          zoneName: 'Zone standard',
        })
      } else {
        return NextResponse.json({
          isDeliverable: false,
          distance,
          duration,
          reason: 'Adresse trop éloignée (max 20 min)',
        })
      }
    }

    // Trouver la zone applicable
    const applicableZone = zones.find(zone => duration <= zone.max_minutes)

    if (applicableZone) {
      return NextResponse.json({
        isDeliverable: true,
        distance,
        duration,
        fee: parseFloat(applicableZone.delivery_fee) || 0,
        zoneName: applicableZone.name,
      })
    }

    // Aucune zone applicable = trop loin
    const maxZone = zones[zones.length - 1]
    return NextResponse.json({
      isDeliverable: false,
      distance,
      duration,
      reason: `Adresse trop éloignée (max ${maxZone.max_minutes} min de trajet)`,
    })

  } catch (error: any) {
    console.error('Delivery check error:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}