import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json()
    if (!address) {
      return NextResponse.json({ error: 'Adresse requise' }, { status: 400 })
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY non configuree' }, { status: 500 })
    }

    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=be&language=fr&key=${apiKey}`
    const geoResponse = await fetch(geocodeUrl)

    if (!geoResponse.ok) {
      return NextResponse.json({ error: 'Erreur geocodage' }, { status: 500 })
    }

    const geoData = await geoResponse.json()

    if (geoData.status !== 'OK' || !geoData.results?.length) {
      return NextResponse.json({ error: 'Adresse non trouvee' }, { status: 404 })
    }

    const result = geoData.results[0]

    return NextResponse.json({
      success: true,
      latitude: result.geometry.location.lat,
      longitude: result.geometry.location.lng,
      address: result.formatted_address,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}