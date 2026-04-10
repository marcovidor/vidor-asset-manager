import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, sanitize } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return auth.response

  const { data } = await auth.supabase
    .from('user_profiles').select('*, organizations(name)').order('created_at', { ascending: false })

  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdmin(req)
  if (!auth.ok) return auth.response

  const body = await req.json()
  const { data, error } = await auth.supabase
    .from('user_profiles')
    .update({ role: sanitize(body.role, 20), org_id: body.org_id || null })
    .eq('id', sanitize(body.id))
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
