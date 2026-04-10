import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function getAuthenticatedClient() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  )
  return supabase
}

export type AuthResult =
  | { ok: true; userId: string; role: string; orgId: string | null; supabase: ReturnType<typeof createServerClient> }
  | { ok: false; response: NextResponse }

export async function requireAuth(): Promise<AuthResult> {
  const supabase = await getAuthenticatedClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, org_id')
    .eq('id', session.user.id)
    .single()

  if (!profile) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { ok: true, userId: session.user.id, role: profile.role, orgId: profile.org_id, supabase }
}

export async function requireSuperAdmin(): Promise<AuthResult> {
  const result = await requireAuth()
  if (!result.ok) return result
  if (result.role !== 'super_admin') {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return result
}

export async function requireEditor(): Promise<AuthResult> {
  const result = await requireAuth()
  if (!result.ok) return result
  if (result.role !== 'super_admin' && result.role !== 'admin') {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return result
}

// Sanitize string input -- strip null bytes, limit length
export function sanitize(val: unknown, maxLen = 1000): string {
  if (val === null || val === undefined) return ''
  return String(val).replace(/\0/g, '').slice(0, maxLen)
}

// Sanitize a record of string values
export function sanitizeRecord(obj: Record<string, unknown>, maxLen = 1000): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') out[k] = sanitize(v, maxLen)
    else if (typeof v === 'number' || typeof v === 'boolean' || v === null) out[k] = v
    // drop anything else (objects, arrays) unless explicitly allowed
  }
  return out
}
