import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, sanitize } from '@/lib/api-auth'

function toSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function GET() {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { data } = await auth.supabase.from('organizations').select('id,name,slug,theme,logo_url').order('name')
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const body = await req.json()
  const name = sanitize(body.name, 200)
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const { data, error } = await auth.supabase
    .from('organizations')
    .insert({ name, slug: toSlug(name), theme: body.theme || {} })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const body = await req.json()
  const id = sanitize(body.id)
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const update: Record<string, unknown> = { theme: body.theme || {} }
  if (body.name) { update.name = sanitize(body.name, 200); update.slug = toSlug(body.name) }
  if (body.logo_url !== undefined) update.logo_url = sanitize(body.logo_url, 500)

  const { data, error } = await auth.supabase
    .from('organizations').update(update).eq('id', id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
