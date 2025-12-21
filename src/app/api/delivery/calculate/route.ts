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

    let destLat = latitude
    let destLng = longitude

    if (!destLat || !destLng) {
      if (!address) {
        return NextResponse.json({ error: 'Adresse ou coordonnees requises' }, { status: 400 })
      }

      const apiKey = process.env.OPENROUTE_API_KEY || process.env.NEXT_PUBLIC_OPENROUTE_API_KEY
      const geoResponse = await fetch(
        `https://api.openrouteservice.org/geocode/search?api_key=${apiKey}&text=${encodeURIComponent(address)}&boundary.country=BE&size=1`
      )
      const geoData = await geoResponse.json()

      if (!geoData.features?.length) {
        return NextResponse.json({ deliverable: false, reason: 'Adresse non trouvee' })
      }

      [destLng, destLat] = geoData.features[0].geometry.coordinates
      
      // DEBUG: Log les coordonnees trouvees
      console.log('=== DEBUG GEOCODE ===')
      console.log('Adresse recherchee:', address)
      console.log('Coordonnees trouvees:', destLat, destLng)
      console.log('Adresse trouvee:', geoData.features[0].properties.label)
    }

    // DEBUG: Log les coordonnees de depart
    console.log('=== DEBUG ROUTE ===')
    console.log('Etablissement:', establishment.latitude, establishment.longitude)
    console.log('Destination:', destLat, destLng)

    const apiKey = process.env.OPENROUTE_API_KEY || process.env.NEXT_PUBLIC_OPENROUTE_API_KEY
    const routeResponse = await fetch(
      `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${apiKey}&start=${establishment.longitude},${establishment.latitude}&end=${destLng},${destLat}`
    )
    const routeData = await routeResponse.json()

    if (!routeData.features?.length) {
      return NextResponse.json({ deliverable: false, reason: 'Impossible de calculer itineraire' })
    }

    const segment = routeData.features[0].properties.segments[0]
    const durationMinutes = Math.round(segment.duration / 60)
    const distanceKm = Math.round(segment.distance / 1000 * 10) / 10

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
