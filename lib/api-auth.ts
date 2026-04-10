import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Server-side client using the request's Authorization header
function getSupabaseFromToken(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

export type AuthResult =
  | { ok: true; userId: string; role: string; orgId: string | null; supabase: any }
  | { ok: false; response: NextResponse }

function getToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) return auth.slice(7)
  return null
}

export async function requireAuth(req: NextRequest): Promise<AuthResult> {
  const token = getToken(req)
  if (!token) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const supabase = getSupabaseFromToken(token)
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('user_profiles').select('role, org_id').eq('id', user.id).single()

  if (!profile) return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { ok: true, userId: user.id, role: profile.role, orgId: profile.org_id, supabase: supabase as any }
}

export async function requireEditor(req: NextRequest): Promise<AuthResult> {
  const result = await requireAuth(req)
  if (!result.ok) return result
  if (result.role !== 'super_admin' && result.role !== 'admin') {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return result
}

export async function requireSuperAdmin(req: NextRequest): Promise<AuthResult> {
  const result = await requireAuth(req)
  if (!result.ok) return result
  if (result.role !== 'super_admin') {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return result
}

export function sanitize(val: unknown, maxLen = 1000): string {
  if (val === null || val === undefined) return ''
  return String(val).replace(/\0/g, '').slice(0, maxLen)
}

export function sanitizeRecord(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') out[k] = sanitize(v)
    else if (typeof v === 'number' || typeof v === 'boolean' || v === null) out[k] = v
  }
  return out
}
