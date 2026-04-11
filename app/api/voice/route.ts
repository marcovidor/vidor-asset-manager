import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, sanitize } from '@/lib/api-auth'

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001'

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.response

  const { text } = await req.json()
  if (!text) return NextResponse.json({ error: 'No text provided' }, { status: 400 })

  const safeText = sanitize(text, 500)
  const orgId = auth.role === 'super_admin' ? DEFAULT_ORG : (auth.orgId || DEFAULT_ORG)

  const { data: assets } = await auth.supabase
    .from('assets')
    .select('id, asset_id, make, model, category_label, status, serial, assigned_to')
    .eq('org_id', orgId)
    .order('category')

  const assetList = (assets || []).map((a: Record<string,string>) =>
    `${a.asset_id}: ${a.make} ${a.model} (${a.category_label}) - status: ${a.status}${a.serial && a.serial !== 'TBD' ? ` - S/N: ${a.serial}` : ''}${a.assigned_to ? ` - assigned to: ${a.assigned_to}` : ''}`
  ).join('\n')

  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: `You are a voice assistant for an asset management system. Interpret voice commands and return a JSON action.

Assets:
${assetList}

Return ONLY valid JSON, no markdown:
- Checkout: {"action":"checkout","asset_id":"<id>","person":"<name>","due":"<YYYY-MM-DD or null>","confidence":"high|medium|low","summary":"<confirmation>"}
- Check-in: {"action":"checkin","asset_id":"<id>","confidence":"high|medium|low","summary":"<confirmation>"}
- Status update: {"action":"update_status","asset_id":"<id>","status":"<status>","confidence":"high|medium|low","summary":"<confirmation>"}
- Maintenance: {"action":"maintenance","asset_id":"<id>","description":"<desc>","cost":<number|null>,"type":"<service|repair|calibration|cleaning|firmware|other>","confidence":"high|medium|low","summary":"<confirmation>"}
- Query: {"action":"query","result":"<answer>","confidence":"high","summary":"<answer>"}
- Unknown: {"action":"unknown","summary":"I didn't understand. Try: check out [asset] to [person], mark [asset] as [status], or log maintenance for [asset]."}

Match assets fuzzily by make, model, or ID. Always include a human-friendly summary.`,
      messages: [{ role: 'user', content: safeText }]
    })
  })

  if (!claudeRes.ok) return NextResponse.json({ error: 'AI interpretation failed' }, { status: 500 })

  const claudeData = await claudeRes.json()
  const rawText = claudeData.content?.[0]?.text || '{}'

  let action: Record<string, unknown>
  try {
    action = JSON.parse(rawText.replace(/```json|```/g, '').trim())
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
  }

  if (action.action === 'unknown' || action.action === 'query' || action.confidence === 'low') {
    return NextResponse.json({ action, executed: false })
  }

  const assetId = action.asset_id as string
  if (!assetId) return NextResponse.json({ action, executed: false })

  const { data: asset } = await auth.supabase
    .from('assets').select('id').eq('asset_id', assetId).eq('org_id', orgId).single()

  if (!asset) return NextResponse.json({ action, executed: false, error: 'Asset not found' })

  try {
    if (action.action === 'checkout') {
      await auth.supabase.from('checkouts').insert({
        asset_id: asset.id,
        checked_out_by: sanitize(action.person as string || 'Unknown', 200),
        due_back_at: action.due || null,
        notes: `Voice: "${safeText}"`,
      })
      await auth.supabase.from('assets').update({ status: 'checked_out' }).eq('id', asset.id)

    } else if (action.action === 'checkin') {
      const { data: co } = await auth.supabase.from('checkouts').select('id').eq('asset_id', asset.id).is('checked_in_at', null).single()
      if (co) await auth.supabase.from('checkouts').update({ checked_in_at: new Date().toISOString() }).eq('id', co.id)
      await auth.supabase.from('assets').update({ status: 'active' }).eq('id', asset.id)

    } else if (action.action === 'update_status') {
      await auth.supabase.from('assets').update({ status: sanitize(action.status as string, 50) }).eq('id', asset.id)

    } else if (action.action === 'maintenance') {
      await auth.supabase.from('maintenance_logs').insert({
        asset_id: asset.id,
        type: sanitize(action.type as string || 'service', 50),
        description: sanitize(action.description as string || '', 1000),
        performed_at: new Date().toISOString(),
        cost: typeof action.cost === 'number' ? action.cost : null,
        notes: `Voice: "${safeText}"`,
      })
    }

    return NextResponse.json({ action, executed: true })
  } catch (err) {
    return NextResponse.json({ action, executed: false, error: String(err) }, { status: 500 })
  }
}
