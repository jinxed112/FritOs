import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

// Générer un token de session sécurisé
function generateSessionToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('')
}

// POST: Valider PIN et créer session
export async function POST(request: NextRequest) {
  try {
    const { deviceCode, pin } = await request.json()
    
    if (!deviceCode || !pin) {
      return NextResponse.json({ error: 'Code et PIN requis' }, { status: 400 })
    }
    
    const supabase = createServerSupabaseClient()
    
    // Vérifier le device et le PIN
    const { data: device, error } = await supabase
      .from('devices')
      .select('id, device_code, name, device_type, access_pin, viva_terminal_id, establishment_id')
      .eq('device_code', deviceCode.toUpperCase())
      .eq('is_active', true)
      .single()
    
    if (error || !device) {
      return NextResponse.json({ error: 'Device non trouvé' }, { status: 404 })
    }
    
    if (device.access_pin !== pin) {
      return NextResponse.json({ error: 'PIN incorrect' }, { status: 401 })
    }
    
    // Créer une session
    const sessionToken = generateSessionToken()
    const userAgent = request.headers.get('user-agent') || null
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || null
    
    const { error: sessionError } = await supabase
      .from('device_sessions')
      .insert({
        device_id: device.id,
        session_token: sessionToken,
        user_agent: userAgent,
        ip_address: ip,
      })
    
    if (sessionError) {
      console.error('Session error:', sessionError)
      return NextResponse.json({ error: 'Erreur création session' }, { status: 500 })
    }
    
    // Mettre à jour last_seen
    await supabase
      .from('devices')
      .update({ last_seen: new Date().toISOString() })
      .eq('id', device.id)
    
    // Définir le cookie (expire dans 1 an)
    const cookieStore = await cookies()
    cookieStore.set('device_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365, // 1 an
      path: '/',
    })
    
    return NextResponse.json({
      success: true,
      device: {
        id: device.id,
        code: device.device_code,
        name: device.name,
        type: device.device_type,
        vivaTerminalId: device.viva_terminal_id,
        establishmentId: device.establishment_id,
      }
    })
    
  } catch (error) {
    console.error('Auth error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// GET: Vérifier session existante (avec deviceCode optionnel pour vérifier la correspondance)
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get('device_session')?.value
    const { searchParams } = new URL(request.url)
    const deviceCode = searchParams.get('deviceCode')
    
    if (!sessionToken) {
      return NextResponse.json({ authenticated: false })
    }
    
    const supabase = createServerSupabaseClient()
    
    // Vérifier la session
    const { data: session, error } = await supabase
      .from('device_sessions')
      .select(`
        id,
        device:devices (
          id, device_code, name, device_type, viva_terminal_id, is_active, establishment_id
        )
      `)
      .eq('session_token', sessionToken)
      .eq('is_valid', true)
      .single()
    
    if (error || !session || !session.device) {
      return NextResponse.json({ authenticated: false })
    }
    
    const device = session.device as any
    
    if (!device.is_active) {
      return NextResponse.json({ authenticated: false, reason: 'device_inactive' })
    }
    
    // Si un deviceCode est fourni, vérifier qu'il correspond
    if (deviceCode && device.device_code !== deviceCode.toUpperCase()) {
      return NextResponse.json({ authenticated: false, reason: 'device_mismatch' })
    }
    
    // Mettre à jour last_used_at
    await supabase
      .from('device_sessions')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', session.id)
    
    // Mettre à jour last_seen du device
    await supabase
      .from('devices')
      .update({ last_seen: new Date().toISOString() })
      .eq('id', device.id)
    
    return NextResponse.json({
      authenticated: true,
      device: {
        id: device.id,
        code: device.device_code,
        name: device.name,
        type: device.device_type,
        vivaTerminalId: device.viva_terminal_id,
        establishmentId: device.establishment_id,
      }
    })
    
  } catch (error) {
    console.error('Session check error:', error)
    return NextResponse.json({ authenticated: false })
  }
}

// DELETE: Déconnexion
export async function DELETE(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get('device_session')?.value
    
    if (sessionToken) {
      const supabase = createServerSupabaseClient()
      await supabase
        .from('device_sessions')
        .update({ is_valid: false })
        .eq('session_token', sessionToken)
    }
    
    cookieStore.delete('device_session')
    
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
