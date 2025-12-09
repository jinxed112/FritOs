import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { amount, orderId, terminalId } = await request.json()

    const clientId = process.env.VIVA_CLIENT_ID
    const clientSecret = process.env.VIVA_CLIENT_SECRET

    console.log('=== VIVA PAYMENT REQUEST ===')
    console.log('Amount:', amount)
    console.log('Order ID:', orderId)
    console.log('Terminal ID:', terminalId)
    console.log('Client ID exists:', !!clientId)
    console.log('Client Secret exists:', !!clientSecret)

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Viva credentials not configured' },
        { status: 500 }
      )
    }

    // Step 1: Get OAuth access token
    console.log('Getting access token...')
    
    const tokenResponse = await fetch('https://accounts.vivapayments.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })

    const tokenText = await tokenResponse.text()
    console.log('Token response status:', tokenResponse.status)
    console.log('Token response body:', tokenText)

    if (!tokenResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to get access token', details: tokenText },
        { status: 500 }
      )
    }

    let tokenData
    try {
      tokenData = JSON.parse(tokenText)
    } catch (e) {
      return NextResponse.json(
        { error: 'Invalid token response JSON', raw: tokenText },
        { status: 500 }
      )
    }

    const accessToken = tokenData.access_token
    if (!accessToken) {
      return NextResponse.json(
        { error: 'No access_token in response', data: tokenData },
        { status: 500 }
      )
    }

    console.log('Access token obtained successfully')

    // Step 2: Create sale session
    const amountInCents = Math.round(amount * 100)
    const sessionId = `fritos-${Date.now()}`
    const terminalToUse = terminalId || process.env.VIVA_TERMINAL_ID

    const saleBody = {
      sessionId: sessionId,
      terminalId: terminalToUse,
      cashRegisterId: 'FRITOS-01',
      amount: amountInCents,
      currencyCode: 978,
      merchantReference: orderId || sessionId,
      customerTrns: 'Commande FritOS',
      preauth: false,
      maxInstalments: 0,
      tipAmount: 0,
    }

    console.log('Sale request:', JSON.stringify(saleBody))

    const saleResponse = await fetch(
      'https://api.vivapayments.com/ecr/v1/transactions:sale',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(saleBody),
      }
    )

    const saleText = await saleResponse.text()
    console.log('Sale response status:', saleResponse.status)
    console.log('Sale response body:', saleText || '(empty)')

    // Viva peut retourner 200 avec corps vide = succès
    if (saleResponse.ok) {
      let saleData = null
      if (saleText) {
        try {
          saleData = JSON.parse(saleText)
        } catch (e) {
          // Pas grave si pas de JSON, c'est OK
        }
      }

      return NextResponse.json({
        success: true,
        sessionId: sessionId,
        message: 'Paiement envoyé au terminal',
        data: saleData,
      })
    }

    // Erreur
    return NextResponse.json(
      { 
        error: 'Sale request failed', 
        status: saleResponse.status,
        details: saleText || 'No response body'
      },
      { status: 500 }
    )

  } catch (error: any) {
    console.error('Viva API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
    }

    const clientId = process.env.VIVA_CLIENT_ID
    const clientSecret = process.env.VIVA_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: 'Credentials missing' }, { status: 500 })
    }

    // Get token
    const tokenResponse = await fetch('https://accounts.vivapayments.com/connect/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })

    const tokenText = await tokenResponse.text()
    if (!tokenResponse.ok) {
      return NextResponse.json({ status: 'pending' })
    }

    const tokenData = JSON.parse(tokenText)
    const accessToken = tokenData.access_token

    // Check session status via ECR API
    const statusResponse = await fetch(
      `https://api.vivapayments.com/ecr/v1/sessions/${sessionId}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    )

    const statusText = await statusResponse.text()
    console.log('Session check:', statusResponse.status, statusText || '(empty)')

    // Parse response if possible
    let statusData: any = {}
    if (statusText) {
      try {
        statusData = JSON.parse(statusText)
      } catch (e) {
        // Ignore parse errors
      }
    }

    // Check various success indicators
    if (statusResponse.ok) {
      // Check if we have a completed transaction
      if (
        statusData.status === 'Completed' ||
        statusData.status === 'Success' ||
        statusData.transactionId ||
        statusData.message?.toLowerCase().includes('approved') ||
        statusData.message?.toLowerCase().includes('success')
      ) {
        return NextResponse.json({ status: 'success', data: statusData })
      }

      // Check if failed
      if (
        statusData.status === 'Failed' ||
        statusData.status === 'Cancelled' ||
        statusData.status === 'Rejected'
      ) {
        return NextResponse.json({ status: 'failed', data: statusData })
      }
    }

    // 404 = session not found yet, keep polling
    if (statusResponse.status === 404) {
      return NextResponse.json({ status: 'pending' })
    }

    // Default to pending
    return NextResponse.json({ status: 'pending', data: statusData })

  } catch (error: any) {
    console.error('Status check error:', error)
    return NextResponse.json({ status: 'pending' })
  }
}