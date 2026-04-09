import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SEED_ASSETS } from '@/lib/seed-data'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const ORG_ID = '00000000-0000-0000-0000-000000000001'

export async function POST() {
  const assets = SEED_ASSETS.map(a => ({
    ...a,
    org_id: ORG_ID,
    notes: '',
    location: '',
    assigned_to: '',
    purchase_date: null,
    purchase_price: null,
    current_value: null,
    photo_url: null,
  }))

  const { error } = await supabase
    .from('assets')
    .upsert(assets, { onConflict: 'org_id,asset_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ seeded: assets.length })
}
