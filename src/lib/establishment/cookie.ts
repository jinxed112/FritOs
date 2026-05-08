import crypto from 'crypto'

export const ESTABLISHMENT_COOKIE_NAME = 'fritos_admin_establishment'
export const ESTABLISHMENT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

export type EstablishmentPayload = {
  est_id: string
  user_id: string
  iat: number
  exp: number
}

function getSecret(): string {
  const s = process.env.ESTABLISHMENT_COOKIE_SECRET
  if (!s || s.length < 16) {
    throw new Error(
      'ESTABLISHMENT_COOKIE_SECRET is missing or too short. ' +
      'Generate one with `openssl rand -base64 32` and set it in .env.local + Vercel env.'
    )
  }
  return s
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function b64urlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') +
    '==='.slice((input.length + 3) % 4)
  return Buffer.from(padded, 'base64')
}

export function signEstablishmentPayload(payload: EstablishmentPayload): string {
  const json = JSON.stringify(payload)
  const head = b64url(json)
  const sig = crypto.createHmac('sha256', getSecret()).update(head).digest()
  return `${head}.${b64url(sig)}`
}

export function verifyEstablishmentCookie(value: string): EstablishmentPayload | null {
  if (typeof value !== 'string') return null
  const parts = value.split('.')
  if (parts.length !== 2) return null
  const [head, sigB64] = parts
  if (!head || !sigB64) return null

  let received: Buffer
  try {
    received = b64urlDecode(sigB64)
  } catch {
    return null
  }
  const expected = crypto.createHmac('sha256', getSecret()).update(head).digest()
  if (received.length !== expected.length) return null
  if (!crypto.timingSafeEqual(received, expected)) return null

  let parsed: any
  try {
    parsed = JSON.parse(b64urlDecode(head).toString('utf8'))
  } catch {
    return null
  }
  if (
    !parsed ||
    typeof parsed.est_id !== 'string' ||
    typeof parsed.user_id !== 'string' ||
    typeof parsed.iat !== 'number' ||
    typeof parsed.exp !== 'number'
  ) {
    return null
  }
  if (parsed.exp * 1000 < Date.now()) return null
  return parsed as EstablishmentPayload
}
