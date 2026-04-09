import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const ORG_ID = '00000000-0000-0000-0000-000000000001'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const status = searchParams.get('status')
  const q = searchParams.get('q')

  let query = supabase
    .from('assets')
    .select('*')
    .eq('org_id', ORG_ID)
    .order('category')
    .order('asset_id')

  if (category && category !== 'ALL') query = query.eq('category', category)
  if (status === 'serial-tbd') query = query.eq('serial', 'TBD')
  else if (status) query = query.eq('status', status)
  if (q) query = query.or(`make.ilike.%${q}%,model.ilike.%${q}%,description.ilike.%${q}%,serial.ilike.%${q}%,asset_id.ilike.%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { data, error } = await supabase
    .from('assets')
    .insert({ ...body, org_id: ORG_ID })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
