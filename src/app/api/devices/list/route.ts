// app/api/devices-list/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Utilise le service role key pour contourner RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Code d'accès pour voir la liste des bornes (à définir dans .env)
// Exemple: KIOSK_SETUP_ACCESS_CODE=MDJ2024
const SETUP_ACCESS_CODE = process.env.KIOSK_SETUP_ACCESS_CODE || 'SETUP123'

// Cookie name pour la session setup
const SETUP_COOKIE_NAME = 'kiosk_setup_auth'

export async function GET(request: Request) {
  const cookieStore = await cookies()
  const authCookie = cookieStore.get(SETUP_COOKIE_NAME)
  
  // Vérifier si déjà authentifié via cookie
  if (!authCookie || authCookie.value !== 'authenticated') {
    return NextResponse.json({ 
      authenticated: false, 
      devices: [],
      error: 'Non autorisé' 
    }, { status: 401 })
  }
  
  const { searchParams } = new URL(request.url)
  const establishmentId = searchParams.get('establishmentId') || 'a0000000-0000-0000-0000-000000000001'
  const deviceType = searchParams.get('deviceType') || 'kiosk'
  
  try {
    const { data, error } = await supabase
      .from('devices')
      .select('id, device_code, name, viva_terminal_id')
      .eq('establishment_id', establishmentId)
      .eq('device_type', deviceType)
      .eq('is_active', true)
      .order('device_code')
    
    if (error) {
      console.error('Error fetching devices:', error)
      return NextResponse.json({ 
        authenticated: true,
        devices: [], 
        error: error.message 
      }, { status: 500 })
    }
    
    return NextResponse.json({ 
      authenticated: true,
      devices: data || [] 
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ 
      authenticated: true,
      devices: [], 
      error: 'Server error' 
    }, { status: 500 })
  }
}

// POST pour vérifier le code d'accès
export async function POST(request: Request) {
  try {
    const { accessCode } = await request.json()
    
    if (accessCode === SETUP_ACCESS_CODE) {
      const response = NextResponse.json({ success: true })
      
      // Cookie permanent (10 ans), httpOnly pour la sécurité
      response.cookies.set(SETUP_COOKIE_NAME, 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24 * 365 * 10, // 10 ans
        path: '/'
      })
      
      return response
    }
    
    return NextResponse.json({ 
      success: false, 
      error: 'Code incorrect' 
    }, { status: 401 })
  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      error: 'Erreur serveur' 
    }, { status: 500 })
  }
}