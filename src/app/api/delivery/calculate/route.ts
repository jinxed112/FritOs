import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { establishmentId, address, latitude, longitude } = await request.json()

    if (!establishmentId) {
      return NextResponse.json({ error: 'establishmentId requis' }, { status: 400 })
    }

    const { data: establishment } = await supabase
      .from('establishments')
      .select('latitude, longitude, delivery_enabled')
      .eq('id', establishmentId)
      .single()

    if (!establishment) {
      return NextResponse.json({ error: 'Etablissement non trouve' }, { status: 404 })
    }

    if (!establishment.latitude || !establishment.longitude) {
      return NextResponse.json({ error: 'Coordonnees etablissement non configurees' }, { status: 400 })
    }

    const { data: deliveryConfig } = await supabase
      .from('delivery_config')
      .select('*')
      .eq('establishment_id', establishmentId)
      .single()

    const { data: zones } = await supabase
      .from('delivery_zones')
      .select('*')
      .eq('establishment_id', establishmentId)
      .eq('is_active', true)
      .order('min_minutes')

    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY non configuree' }, { status: 500 })
    }

    let destLat = latitude
    let destLng = longitude

    // Si pas de coordonnées, géocoder avec Google
    if (!destLat || !destLng) {
      if (!address) {
        return NextResponse.json({ error: 'Adresse ou coordonnees requises' }, { status: 400 })
      }

      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=be&language=fr&key=${apiKey}`
      const geoResponse = await fetch(geocodeUrl)
      const geoData = await geoResponse.json()

      if (geoData.status !== 'OK' || !geoData.results?.length) {
        return NextResponse.json({ deliverable: false, reason: 'Adresse non trouvee' })
      }

      destLat = geoData.results[0].geometry.location.lat
      destLng = geoData.results[0].geometry.location.lng

      console.log('=== DEBUG GEOCODE ===')
      console.log('Adresse recherchee:', address)
      console.log('Coordonnees trouvees:', destLat, destLng)
      console.log('Adresse trouvee:', geoData.results[0].formatted_address)
    }

    // Calcul du trajet avec Google Directions API
    console.log('=== DEBUG ROUTE ===')
    console.log('Etablissement:', establishment.latitude, establishment.longitude)
    console.log('Destination:', destLat, destLng)

    let durationMinutes = 0
    let distanceKm = 0

    try {
      const origin = `${establishment.latitude},${establishment.longitude}`
      const destination = `${destLat},${destLng}`
      const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&mode=driving&language=fr&key=${apiKey}`

      const routeResponse = await fetch(directionsUrl)
      const routeData = await routeResponse.json()

      if (routeData.status === 'OK' && routeData.routes?.length) {
        const leg = routeData.routes[0].legs[0]
        durationMinutes = Math.ceil(leg.duration.value / 60)
        distanceKm = Math.round(leg.distance.value / 100) / 10 // arrondi à 0.1 km
      } else {
        console.error('Google Directions: pas de route trouvee', routeData.status)
        // Fallback Haversine
        distanceKm = haversineDistance(establishment.latitude, establishment.longitude, destLat, destLng)
        durationMinutes = Math.ceil(distanceKm / 30 * 60)
      }
    } catch (e) {
      console.error('Erreur Google Directions:', e)
      distanceKm = haversineDistance(establishment.latitude, establishment.longitude, destLat, destLng)
      durationMinutes = Math.ceil(distanceKm / 30 * 60)
    }

    console.log('Distance:', distanceKm, 'km')
    console.log('Duree:', durationMinutes, 'min')

    const maxMinutes = deliveryConfig?.max_delivery_minutes || 30
    if (durationMinutes > maxMinutes) {
      return NextResponse.json({
        deliverable: false,
        reason: `Adresse trop eloignee (${durationMinutes} min, max ${maxMinutes} min)`,
        duration: durationMinutes,
        distance: distanceKm,
      })
    }

    const zone = (zones || []).find(
      z => durationMinutes >= z.min_minutes && durationMinutes < z.max_minutes
    )

    return NextResponse.json({
      deliverable: true,
      duration: durationMinutes,
      distance: distanceKm,
      deliveryFee: zone?.delivery_fee || 0,
      freeDeliveryThreshold: deliveryConfig?.free_delivery_threshold,
      minOrderAmount: deliveryConfig?.min_order_amount,
      coordinates: { latitude: destLat, longitude: destLng },
      debug: {
        establishmentCoords: { lat: establishment.latitude, lng: establishment.longitude },
        destinationCoords: { lat: destLat, lng: destLng },
      }
    })

  } catch (error: any) {
    console.error('Erreur calcul livraison:', error)
    return NextResponse.json({ error: 'Erreur serveur', details: error.message }, { status: 500 })
  }
}

// Fallback Haversine
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c * 10) / 10
}