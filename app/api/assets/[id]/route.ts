import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireEditor, sanitizeRecord } from '@/lib/api-auth'

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEditor()
  if (!auth.ok) return auth.response

  const { id } = await params
  const body = await req.json()
  const safe = sanitizeRecord(body)
  const orgId = auth.role === 'super_admin' ? DEFAULT_ORG : (auth.orgId || DEFAULT_ORG)

  const { data, error } = await auth.supabase
    .from('assets').update(safe).eq('id', id).eq('org_id', orgId).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  if (auth.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { error } = await auth.supabase
    .from('assets').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
