import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Générer un code OTP à 6 chiffres
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// POST: Envoyer un OTP par email
export async function POST(request: NextRequest) {
  try {
    const { email, establishmentId } = await request.json()

    if (!email || !establishmentId) {
      return NextResponse.json(
        { error: 'Email et establishmentId requis' },
        { status: 400 }
      )
    }

    // Valider le format email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Format email invalide' },
        { status: 400 }
      )
    }

    // Vérifier le rate limit (max 3 OTP par email par 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('customer_otp')
      .select('*', { count: 'exact', head: true })
      .eq('email', email.toLowerCase())
      .gte('created_at', tenMinutesAgo)

    if (count && count >= 3) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Réessayez dans 10 minutes.' },
        { status: 429 }
      )
    }

    // Générer l'OTP
    const otpCode = generateOTP()
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

    // Invalider les anciens OTP pour cet email
    await supabase
      .from('customer_otp')
      .update({ is_used: true })
      .eq('email', email.toLowerCase())
      .eq('is_used', false)

    // Sauvegarder le nouvel OTP
    const { error: insertError } = await supabase
      .from('customer_otp')
      .insert({
        email: email.toLowerCase(),
        otp_code: otpCode,
        expires_at: expiresAt.toISOString(),
        establishment_id: establishmentId,
      })

    if (insertError) {
      console.error('Erreur insertion OTP:', insertError)
      return NextResponse.json(
        { error: 'Erreur serveur' },
        { status: 500 }
      )
    }

    // Charger les infos de l'établissement
    const { data: establishment } = await supabase
      .from('establishments')
      .select('name')
      .eq('id', establishmentId)
      .single()

    // Envoyer l'email via Brevo
    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': process.env.BREVO_API_KEY!,
      },
      body: JSON.stringify({
        sender: {
          name: process.env.BREVO_SENDER_NAME || 'MDjambo',
          email: process.env.BREVO_SENDER_EMAIL || 'commandes@mdjambo.be',
        },
        to: [{ email: email.toLowerCase() }],
        subject: `Votre code de connexion - ${establishment?.name || 'MDjambo'}`,
        htmlContent: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; }
              .container { max-width: 400px; margin: 0 auto; background: white; border-radius: 16px; padding: 32px; }
              .logo { text-align: center; font-size: 48px; margin-bottom: 16px; }
              .title { text-align: center; font-size: 24px; font-weight: bold; color: #333; margin-bottom: 8px; }
              .subtitle { text-align: center; color: #666; margin-bottom: 24px; }
              .code { text-align: center; font-size: 36px; font-weight: bold; letter-spacing: 8px; background: #FFF3E6; color: #FF6B00; padding: 16px; border-radius: 12px; margin: 24px 0; }
              .footer { text-align: center; color: #999; font-size: 12px; margin-top: 24px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="logo">🍟</div>
              <div class="title">${establishment?.name || 'MDjambo'}</div>
              <div class="subtitle">Voici votre code de connexion</div>
              <div class="code">${otpCode}</div>
              <p style="text-align: center; color: #666;">
                Ce code expire dans 15 minutes.<br>
                Si vous n'avez pas demandé ce code, ignorez cet email.
              </p>
              <div class="footer">
                © ${new Date().getFullYear()} MDjambo - Tous droits réservés
              </div>
            </div>
          </body>
          </html>
        `,
      }),
    })

    if (!brevoResponse.ok) {
      const errorData = await brevoResponse.text()
      console.error('Erreur Brevo:', errorData)
      // On continue quand même (l'OTP est sauvegardé, on peut le voir en DB pour debug)
    }

    return NextResponse.json({
      success: true,
      message: 'Code envoyé par email',
    })

  } catch (error: any) {
    console.error('Erreur OTP:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

// PUT: Vérifier un OTP
export async function PUT(request: NextRequest) {
  try {
    const { email, otpCode, establishmentId } = await request.json()

    if (!email || !otpCode) {
      return NextResponse.json(
        { error: 'Email et code requis' },
        { status: 400 }
      )
    }

    // Chercher l'OTP valide
    const { data: otp, error } = await supabase
      .from('customer_otp')
      .select('*')
      .eq('email', email.toLowerCase())
      .eq('otp_code', otpCode)
      .eq('is_used', false)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !otp) {
      // Incrémenter le compteur de tentatives
      await supabase
        .from('customer_otp')
        .update({ attempts: supabase.rpc('increment_attempts') })
        .eq('email', email.toLowerCase())
        .eq('is_used', false)

      return NextResponse.json(
        { error: 'Code invalide ou expiré' },
        { status: 400 }
      )
    }

    // Marquer l'OTP comme utilisé
    await supabase
      .from('customer_otp')
      .update({ is_used: true })
      .eq('id', otp.id)

    // Trouver ou créer le client
    let { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('email', email.toLowerCase())
      .single()

    if (!customer) {
      // Créer le client
      const { data: newCustomer, error: createError } = await supabase
        .from('customers')
        .insert({
          establishment_id: establishmentId,
          email: email.toLowerCase(),
          email_verified: true,
        })
        .select()
        .single()

      if (createError) {
        console.error('Erreur création client:', createError)
        return NextResponse.json(
          { error: 'Erreur création compte' },
          { status: 500 }
        )
      }

      customer = newCustomer
    } else {
      // Mettre à jour email_verified si nécessaire
      if (!customer.email_verified) {
        await supabase
          .from('customers')
          .update({ email_verified: true })
          .eq('id', customer.id)
      }
    }

    // Créer une session
    const sessionToken = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 jours

    const { error: sessionError } = await supabase
      .from('customer_sessions')
      .insert({
        customer_id: customer.id,
        session_token: sessionToken,
        expires_at: expiresAt.toISOString(),
      })

    if (sessionError) {
      console.error('Erreur création session:', sessionError)
      return NextResponse.json(
        { error: 'Erreur création session' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      sessionToken,
      customer: {
        id: customer.id,
        email: customer.email,
        first_name: customer.first_name,
        last_name: customer.last_name,
        phone: customer.phone,
        loyalty_points: customer.loyalty_points || 0,
      },
    })

  } catch (error: any) {
    console.error('Erreur vérification OTP:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

// GET: Vérifier une session existante
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionToken = searchParams.get('token')

    if (!sessionToken) {
      return NextResponse.json({ authenticated: false })
    }

    const { data: session } = await supabase
      .from('customer_sessions')
      .select(`
        *,
        customer:customers (
          id, email, first_name, last_name, phone, loyalty_points
        )
      `)
      .eq('session_token', sessionToken)
      .gte('expires_at', new Date().toISOString())
      .single()

    if (!session || !session.customer) {
      return NextResponse.json({ authenticated: false })
    }

    return NextResponse.json({
      authenticated: true,
      customer: session.customer,
    })

  } catch (error: any) {
    console.error('Erreur vérification session:', error)
    return NextResponse.json({ authenticated: false })
  }
}
