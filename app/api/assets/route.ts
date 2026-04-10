import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireEditor, sanitize, sanitizeRecord } from '@/lib/api-auth'

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  // super_admin can query any org, others are locked to their own
  const orgId = auth.role === 'super_admin'
    ? (searchParams.get('org_id') || DEFAULT_ORG)
    : (auth.orgId || DEFAULT_ORG)

  const { data, error } = await auth.supabase
    .from('assets').select('*').eq('org_id', orgId).order('category').order('asset_id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const auth = await requireEditor()
  if (!auth.ok) return auth.response

  const body = await req.json()

  // Batch import
  if (Array.isArray(body.batch)) {
    const batch = body.batch.map((item: Record<string, unknown>) => ({
      ...sanitizeRecord(item),
      org_id: auth.role === 'super_admin' ? (item.org_id || DEFAULT_ORG) : auth.orgId,
    }))
    const { data, error } = await auth.supabase.from('assets').insert(batch).select()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // Single asset
  const safe = sanitizeRecord(body)
  const { data, error } = await auth.supabase
    .from('assets')
    .insert({ ...safe, org_id: auth.role === 'super_admin' ? (body.org_id || DEFAULT_ORG) : auth.orgId })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
