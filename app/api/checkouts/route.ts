import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const ORG_ID = '00000000-0000-0000-0000-000000000001'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const asset_id = searchParams.get('asset_id')
  let query = supabase.from('checkouts').select('*').eq('org_id', ORG_ID).order('created_at', { ascending: false })
  if (asset_id) query = query.eq('asset_id', asset_id)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { data, error } = await supabase
    .from('checkouts')
    .insert({ ...body, org_id: ORG_ID })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, ...rest } = body
  const { data, error } = await supabase
    .from('checkouts')
    .update(rest)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
