import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(c) { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )
}

async function requireSuperAdmin(supabase: ReturnType<typeof createServerClient>) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const { data } = await supabase.from('user_profiles').select('role').eq('id', session.user.id).single()
  if (data?.role !== 'super_admin') return null
  return session
}

export async function GET() {
  const supabase = await getSupabase()
  const session = await requireSuperAdmin(supabase)
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data } = await supabase
    .from('user_profiles')
    .select('*, organizations(name)')
    .order('created_at', { ascending: false })

  return NextResponse.json(data)
}

export async function PATCH(req: Request) {
  const supabase = await getSupabase()
  const session = await requireSuperAdmin(supabase)
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { id, role, org_id } = body

  const { data, error } = await supabase
    .from('user_profiles')
    .update({ role, org_id })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
