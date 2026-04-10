import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

async function sb() {
  const c = await cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll() { return c.getAll() }, setAll(cs) { cs.forEach(({name,value,options}) => c.set(name,value,options)) } }
  })
}

export async function GET() {
  const s = await sb()
  const { data } = await s.from('organizations').select('id,name,theme').order('name')
  return NextResponse.json(data || [])
}

export async function POST(req: Request) {
  const s = await sb(); const body = await req.json()
  const { data, error } = await s.from('organizations').insert({ name: body.name, theme: body.theme || {} }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: Request) {
  const s = await sb(); const { id, name, theme } = await req.json()
  const { data, error } = await s.from('organizations').update({ name, theme }).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
