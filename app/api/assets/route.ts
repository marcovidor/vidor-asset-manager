import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const ORG_ID = '00000000-0000-0000-0000-000000000001'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const org_id = searchParams.get('org_id') || ORG_ID

  let query = supabase.from('assets').select('*').eq('org_id', org_id).order('category').order('asset_id')

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  // Batch import
  if (body.batch) {
    const { data, error } = await supabase.from('assets').insert(body.batch).select()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // Single asset
  const { org_id, ...rest } = body
  const { data, error } = await supabase
    .from('assets')
    .insert({ org_id: org_id || ORG_ID, ...rest })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
