import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

const DEVICE_COOKIE_NAME = 'selected_device'

// POST: Sélectionner un device (après login Supabase)
export async function POST(request: NextRequest) {
  try {
    const { deviceId } = await request.json()
    
    if (!deviceId) {
      return NextResponse.json({ error: 'deviceId requis' }, { status: 400 })
    }
    
    const supabase = createAdminClient()
    
    // Vérifier que le device existe et est actif
    const { data: device, error } = await supabase
      .from('devices')
      .select('id, device_code, name, device_type, viva_terminal_id, establishment_id')
      .eq('id', deviceId)
      .eq('is_active', true)
      .single()
    
    if (error || !device) {
      return NextResponse.json({ error: 'Device non trouvé' }, { status: 404 })
    }
    
    // Mettre à jour last_seen
    await supabase
      .from('devices')
      .update({ last_seen: new Date().toISOString() })
      .eq('id', device.id)
    
    // Stocker le device sélectionné dans un cookie (1 an)
    const cookieStore = await cookies()
    cookieStore.set(DEVICE_COOKIE_NAME, JSON.stringify({
      id: device.id,
      code: device.device_code,
      name: device.name,
      type: device.device_type,
      vivaTerminalId: device.viva_terminal_id,
      establishmentId: device.establishment_id,
    }), {
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
    console.error('Device select error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// GET: Récupérer le device sélectionné
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const deviceCookie = cookieStore.get(DEVICE_COOKIE_NAME)?.value
    
    if (!deviceCookie) {
      return NextResponse.json({ device: null })
    }
    
    try {
      const device = JSON.parse(deviceCookie)
      
      // Vérifier que le device existe toujours et est actif
      const supabase = createAdminClient()
      const { data, error } = await supabase
        .from('devices')
        .select('id, is_active')
        .eq('id', device.id)
        .single()
      
      if (error || !data || !data.is_active) {
        // Device supprimé ou désactivé, supprimer le cookie
        cookieStore.delete(DEVICE_COOKIE_NAME)
        return NextResponse.json({ device: null })
      }
      
      // Mettre à jour last_seen
      await supabase
        .from('devices')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', device.id)
      
      return NextResponse.json({ device })
    } catch {
      return NextResponse.json({ device: null })
    }
    
  } catch (error) {
    console.error('Get device error:', error)
    return NextResponse.json({ device: null })
  }
}

// DELETE: Désélectionner le device (changer de device)
export async function DELETE(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    cookieStore.delete(DEVICE_COOKIE_NAME)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
