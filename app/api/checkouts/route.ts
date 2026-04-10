import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireEditor, sanitize } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const asset_id = sanitize(searchParams.get('asset_id') || '')

  let query = auth.supabase.from('checkouts').select('*').order('created_at', { ascending: false })
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
    .from('checkouts')
    .insert({
      asset_id: sanitize(body.asset_id),
      checked_out_by: sanitize(body.checked_out_by, 200),
      due_back_at: body.due_back_at || null,
      notes: sanitize(body.notes, 500),
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const auth = await requireEditor()
  if (!auth.ok) return auth.response

  const body = await req.json()
  const { data, error } = await auth.supabase
    .from('checkouts')
    .update({ checked_in_at: body.checked_in_at })
    .eq('id', sanitize(body.id))
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
