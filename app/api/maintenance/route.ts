import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireEditor, sanitize } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const asset_id = sanitize(searchParams.get('asset_id') || '')

  let query = auth.supabase.from('maintenance_logs').select('*').order('performed_at', { ascending: false })
  if (asset_id) query = query.eq('asset_id', asset_id)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const auth = await requireEditor()
  if (!auth.ok) return auth.response

  const body = await req.json()
  const { data, error } = await auth.supabase
    .from('maintenance_logs')
    .insert({
      asset_id: sanitize(body.asset_id),
      type: sanitize(body.type, 50),
      description: sanitize(body.description, 1000),
      performed_by: sanitize(body.performed_by, 200),
      performed_at: body.performed_at || new Date().toISOString(),
      cost: typeof body.cost === 'number' ? body.cost : null,
      next_due_at: body.next_due_at || null,
      notes: sanitize(body.notes, 500),
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
