import { NextRequest, NextResponse } from 'next/server'

// API d'autocomplétion d'adresse utilisant Nominatim (OpenStreetMap)
// Gratuit et sans clé API

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    
    if (!query || query.length < 3) {
      return NextResponse.json({ suggestions: [] })
    }

    // Recherche Nominatim limitée à la Belgique
    const nominatimUrl = new URL('https://nominatim.openstreetmap.org/search')
    nominatimUrl.searchParams.set('q', query)
    nominatimUrl.searchParams.set('format', 'json')
    nominatimUrl.searchParams.set('addressdetails', '1')
    nominatimUrl.searchParams.set('limit', '5')
    nominatimUrl.searchParams.set('countrycodes', 'be') // Belgique uniquement
    
    const response = await fetch(nominatimUrl.toString(), {
      headers: {
        'User-Agent': 'FritOS/1.0 (contact@mdjambo.be)', // Requis par Nominatim
      },
    })

    if (!response.ok) {
      throw new Error('Nominatim error')
    }

    const data = await response.json()

    // Formater les résultats
    const suggestions = data.map((item: any) => ({
      display_name: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      address: {
        street: item.address?.road || '',
        house_number: item.address?.house_number || '',
        postcode: item.address?.postcode || '',
        city: item.address?.city || item.address?.town || item.address?.village || '',
        country: item.address?.country || 'Belgique',
      },
      // Adresse formatée courte
      formatted: formatAddress(item.address),
    }))

    return NextResponse.json({ suggestions })

  } catch (error: any) {
    console.error('Address autocomplete error:', error)
    return NextResponse.json(
      { error: 'Erreur de recherche', suggestions: [] },
      { status: 500 }
    )
  }
}

function formatAddress(address: any): string {
  if (!address) return ''
  
  const parts = []
  
  // Numéro + rue
  if (address.road) {
    if (address.house_number) {
      parts.push(`${address.road} ${address.house_number}`)
    } else {
      parts.push(address.road)
    }
  }
  
  // Code postal + ville
  const city = address.city || address.town || address.village || address.municipality
  if (address.postcode && city) {
    parts.push(`${address.postcode} ${city}`)
  } else if (city) {
    parts.push(city)
  }
  
  return parts.join(', ')
}
