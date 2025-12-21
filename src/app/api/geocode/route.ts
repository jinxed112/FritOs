import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json()
    if (!address) {
      return NextResponse.json({ error: 'Adresse requise' }, { status: 400 })
    }
    const apiKey = process.env.OPENROUTE_API_KEY || process.env.NEXT_PUBLIC_OPENROUTE_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Cle API non configuree' }, { status: 500 })
    }
    const geoResponse = await fetch(
      `https://api.openrouteservice.org/geocode/search?api_key=${apiKey}&text=${encodeURIComponent(address)}&boundary.country=BE&size=1`
    )
    if (!geoResponse.ok) {
      return NextResponse.json({ error: 'Erreur geocodage' }, { status: 500 })
    }
    const geoData = await geoResponse.json()
    if (!geoData.features?.length) {
      return NextResponse.json({ error: 'Adresse non trouvee' }, { status: 404 })
    }
    const [longitude, latitude] = geoData.features[0].geometry.coordinates
    return NextResponse.json({
      success: true,
      latitude: latitude,
      longitude: longitude,
      address: geoData.features[0].properties.label,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
