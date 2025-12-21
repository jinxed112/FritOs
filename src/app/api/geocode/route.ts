import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json()

    if (!address) {
      return NextResponse.json(
        { error: 'Adresse requise' },
        { status: 400 }
      )
    }

    const apiKey = process.env.OPENROUTE_API_KEY || process.env.NEXT_PUBLIC_OPENROUTE_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Clé API OpenRouteService non configurée' },
        { status: 500 }
      )
    }

    // Géocoder l'adresse via OpenRouteService
    const geoResponse = await fetch(
      `https://api.openrouteservice.org/geocode/search?api_key=${apiKey}&text=${encodeURIComponent(address)}&boundary.country=BE&size=1`
    )

    if (!geoResponse.ok) {
      const errorText = await geoResponse.text()
      console.error('Geocode error:', errorText)
      return NextResponse.json(
        { error: 'Erreur géocodage', details: errorText },
        { status: 500 }
      )
    }

    const geoData = await geoResponse.json()

    if (!geoData.features?.length) {
      return NextResponse.json(
        { error: 'Adresse non trouvée' },
        { status: 404 }
      )
    }

    const [longitude, latitude] = geoData.features[0].geometry.coordinates
    const foundAddress = geoData.features[0].properties.label

    return NextResponse.json({
      success: true,
      latitude: latitude,
      longitude: longitude,
      address: foundAddress,
    })

  } catch (error: any) {
    console.error('Geocode API error:', error)
    return NextResponse.json(
      { error: 'Erreur serveur', message: error.message },
      { status: 500 }
    )
  }
}