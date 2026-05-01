import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import * as bcrypt from 'npm:bcryptjs'

const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const JWT_SECRET      = Deno.env.get('JWT_SECRET')!
const COOKIE_NAME     = 'bp_auth'
const COOKIE_MAX_AGE  = 60 * 60 * 24 * 30  // 30 days
const RATE_LIMIT_MAX  = 5
const RATE_LIMIT_WINDOW_MINUTES = 10

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bp-token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  })
}

async function signJwt(payload: Record<string, unknown>): Promise<string> {
  const header  = { alg: 'HS256', typ: 'JWT' }
  const now     = Math.floor(Date.now() / 1000)
  const claims  = { ...payload, iat: now, exp: now + COOKIE_MAX_AGE }

  const enc     = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  const b64h    = enc(JSON.stringify(header))
  const b64p    = enc(JSON.stringify(claims))
  const sigInput = `${b64h}.${b64p}`

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(sigInput))
  const b64s = enc(String.fromCharCode(...new Uint8Array(sig)))
  return `${sigInput}.${b64s}`
}

async function verifyJwt(token: string): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const sigInput = `${parts[0]}.${parts[1]}`
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )

    const dec = (s: string) => {
      const padded = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + (4 - s.length % 4) % 4, '=')
      return atob(padded)
    }
    const sigBytes = Uint8Array.from(dec(parts[2]), c => c.charCodeAt(0))
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(sigInput))
    if (!valid) return null

    const payload = JSON.parse(dec(parts[1]))
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {}
  return Object.fromEntries(
    header.split(';').map(c => c.trim().split('=').map(decodeURIComponent))
  )
}

function buildCookie(token: string): string {
  return [
    `${COOKIE_NAME}=${token}`,
    `Max-Age=${COOKIE_MAX_AGE}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Secure',
  ].join('; ')
}

function clearCookie(): string {
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict; Secure`
}

async function isRateLimited(ip: string): Promise<boolean> {
  const db = serviceClient()
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString()
  const { count } = await db
    .from('login_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('ip_address', ip)
    .eq('succeeded', false)
    .gte('attempted_at', windowStart)
  return (count ?? 0) >= RATE_LIMIT_MAX
}

async function recordAttempt(ip: string, succeeded: boolean) {
  const db = serviceClient()
  await db.from('login_attempts').insert({ ip_address: ip, succeeded })
}

// ── Route handlers ────────────────────────────────────────────────────────

async function handleLogin(req: Request): Promise<Response> {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'

  if (await isRateLimited(ip)) {
    return Response.json(
      { error: 'Too many attempts. Try again in 15 minutes.' },
      { status: 429, headers: corsHeaders },
    )
  }

  let password: string
  try {
    const body = await req.json()
    password = body.password
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400, headers: corsHeaders })
  }

  if (!password || typeof password !== 'string') {
    await recordAttempt(ip, false)
    return Response.json({ error: 'Invalid password' }, { status: 401, headers: corsHeaders })
  }

  const db = serviceClient()
  const { data } = await db.from('settings').select('password_hash').eq('id', 1).single()
  const hash: string | null = data?.password_hash ?? null

  if (!hash) {
    return Response.json({ error: 'Auth not configured' }, { status: 500, headers: corsHeaders })
  }

  const match = await bcrypt.compare(password, hash)
  if (!match) {
    await recordAttempt(ip, false)
    return Response.json({ error: 'Invalid password' }, { status: 401, headers: corsHeaders })
  }

  await recordAttempt(ip, true)

  const now = Math.floor(Date.now() / 1000)
  const token = await signJwt({ role: 'household' })

  return new Response(
    JSON.stringify({ token, expiresAt: (now + COOKIE_MAX_AGE) * 1000 }),
    {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Set-Cookie': buildCookie(token),
      },
    },
  )
}

async function handleVerify(req: Request): Promise<Response> {
  const cookies = parseCookies(req.headers.get('cookie'))
  const token   = cookies[COOKIE_NAME]

  if (!token) {
    return Response.json({ error: 'Unauthorised' }, { status: 401, headers: corsHeaders })
  }

  const payload = await verifyJwt(token)
  if (!payload || payload.role !== 'household') {
    return Response.json({ error: 'Unauthorised' }, { status: 401, headers: corsHeaders })
  }

  return Response.json(
    { token, expiresAt: (payload.exp as number) * 1000 },
    { status: 200, headers: corsHeaders },
  )
}

async function handleChangePassword(req: Request): Promise<Response> {
  // Accept token from x-bp-token header (preferred) or cookie (fallback)
  // NOTE: we avoid Authorization: Bearer for our JWT because the Supabase gateway
  // validates any Bearer token against its own secret and rejects custom JWTs.
  const xBpToken     = req.headers.get('x-bp-token')
  const cookies      = parseCookies(req.headers.get('cookie'))
  const sessionToken = xBpToken ?? cookies[COOKIE_NAME] ?? null
  const payload      = sessionToken ? await verifyJwt(sessionToken) : null

  if (!payload || payload.role !== 'household') {
    return Response.json({ error: 'Unauthorised' }, { status: 401, headers: corsHeaders })
  }

  let currentPassword: string, newPassword: string
  try {
    const body = await req.json()
    currentPassword = body.currentPassword
    newPassword     = body.newPassword
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400, headers: corsHeaders })
  }

  if (!newPassword || newPassword.length < 8) {
    return Response.json({ error: 'New password must be at least 8 characters' }, { status: 400, headers: corsHeaders })
  }

  const db = serviceClient()
  const { data } = await db.from('settings').select('password_hash').eq('id', 1).single()
  const hash: string | null = data?.password_hash ?? null

  if (!hash || !(await bcrypt.compare(currentPassword, hash))) {
    return Response.json({ error: 'Current password incorrect' }, { status: 401, headers: corsHeaders })
  }

  const newHash = await bcrypt.hash(newPassword, 12)
  await db.from('settings').update({ password_hash: newHash }).eq('id', 1)

  return Response.json({ ok: true }, { status: 200, headers: corsHeaders })
}

async function handleLogout(): Promise<Response> {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Set-Cookie': clearCookie(),
    },
  })
}

// ── Router ────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const url = new URL(req.url)
  const path = url.pathname

  if (path.endsWith('/login')           && req.method === 'POST') return handleLogin(req)
  if (path.endsWith('/verify')          && req.method === 'GET')  return handleVerify(req)
  if (path.endsWith('/change-password') && req.method === 'POST') return handleChangePassword(req)
  if (path.endsWith('/logout')          && req.method === 'POST') return handleLogout()

  return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders })
})
