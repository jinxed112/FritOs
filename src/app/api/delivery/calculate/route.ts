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
      return NextResponse.json(
        { error: 'establishmentId requis' },
        { status: 400 }
      )
    }

    // Charger les coordonnées de l'établissement
    const { data: establishment } = await supabase
      .from('establishments')
      .select('latitude, longitude, delivery_enabled')
      .eq('id', establishmentId)
      .single()

    if (!establishment) {
      return NextResponse.json(
        { error: 'Établissement non trouvé' },
        { status: 404 }
      )
    }

    if (!establishment.delivery_enabled) {
      return NextResponse.json(
        { error: 'La livraison n\'est pas activée pour cet établissement' },
        { status: 400 }
      )
    }

    if (!establishment.latitude || !establishment.longitude) {
      return NextResponse.json(
        { error: 'Coordonnées de l\'établissement non configurées' },
        { status: 400 }
      )
    }

    // Charger la config de livraison
    const { data: deliveryConfig } = await supabase
      .from('delivery_config')
      .select('*')
      .eq('establishment_id', establishmentId)
      .single()

    if (!deliveryConfig) {
      return NextResponse.json(
        { error: 'Configuration de livraison non trouvée' },
        { status: 404 }
      )
    }

    // Charger les zones
    const { data: zones } = await supabase
      .from('delivery_zones')
      .select('*')
      .eq('establishment_id', establishmentId)
      .eq('is_active', true)
      .order('min_minutes')

    // Géocoder l'adresse si nécessaire
    let destLat = latitude
    let destLng = longitude

    if (!destLat || !destLng) {
      if (!address) {
        return NextResponse.json(
          { error: 'Adresse ou coordonnées requises' },
          { status: 400 }
        )
      }

      // Géocoder via OpenRouteService
      const apiKey = process.env.OPENROUTE_API_KEY || process.env.NEXT_PUBLIC_OPENROUTE_API_KEY
      const geoResponse = await fetch(
        `https://api.openrouteservice.org/geocode/search?api_key=${apiKey}&text=${encodeURIComponent(address)}&boundary.country=BE&size=1`
      )
      const geoData = await geoResponse.json()

      if (!geoData.features?.length) {
        return NextResponse.json({
          deliverable: false,
          reason: 'Adresse non trouvée',
        })
      }

      [destLng, destLat] = geoData.features[0].geometry.coordinates
    }

    // Calculer l'itinéraire
    const apiKey = process.env.OPENROUTE_API_KEY || process.env.NEXT_PUBLIC_OPENROUTE_API_KEY
    const routeResponse = await fetch(
      `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${apiKey}&start=${establishment.longitude},${establishment.latitude}&end=${destLng},${destLat}`
    )
    const routeData = await routeResponse.json()

    if (!routeData.features?.length) {
      return NextResponse.json({
        deliverable: false,
        reason: 'Impossible de calculer l\'itinéraire',
      })
    }

    const segment = routeData.features[0].properties.segments[0]
    const durationMinutes = Math.round(segment.duration / 60)
    const distanceKm = Math.round(segment.distance / 1000 * 10) / 10

    // Vérifier si dans la zone maximale
    if (durationMinutes > deliveryConfig.max_delivery_minutes) {
      return NextResponse.json({
        deliverable: false,
        reason: `Adresse trop éloignée (${durationMinutes} min, max ${deliveryConfig.max_delivery_minutes} min)`,
        duration: durationMinutes,
        distance: distanceKm,
      })
    }

    // Trouver la zone correspondante
    const zone = (zones || []).find(
      z => durationMinutes >= z.min_minutes && durationMinutes < z.max_minutes
    )

    const deliveryFee = zone?.delivery_fee || 0

    return NextResponse.json({
      deliverable: true,
      duration: durationMinutes,
      distance: distanceKm,
      deliveryFee,
      freeDeliveryThreshold: deliveryConfig.free_delivery_threshold,
      minOrderAmount: deliveryConfig.min_order_amount,
      coordinates: {
        latitude: destLat,
        longitude: destLng,
      },
    })

  } catch (error: any) {
    console.error('Erreur calcul livraison:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
