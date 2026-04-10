import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

async function getSb() {
  const c = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => c.getAll(), setAll: (cs) => cs.forEach(({name,value,options}) => c.set(name,value,options)) } }
  )
}

export async function GET() {
  const sb = await getSb()
  const { data } = await sb.from('organizations').select('id,name,theme,logo_url').order('name')
  return NextResponse.json(data || [])
}

export async function POST(req: Request) {
  const sb = await getSb()
  const body = await req.json()
  const { data, error } = await sb.from('organizations').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: Request) {
  const sb = await getSb()
  const { id, ...update } = await req.json()
  const { data, error } = await sb.from('organizations').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
