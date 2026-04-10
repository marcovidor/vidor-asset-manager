'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/auth'
import type { UserProfile, UserRole } from '@/lib/auth'

type Asset = {
  id: string
  asset_id: string
  category: string
  category_label: string
  make: string
  model: string
  description: string
  serial: string
  status: string
  condition: string
  notes: string
  location: string
  assigned_to: string
  purchase_date: string | null
  purchase_price: number | null
  current_value: number | null
  photo_url: string | null
  updated_at: string
}

type Checkout = {
  id: string
  asset_id: string
  checked_out_by: string
  checked_out_at: string
  due_back_at: string | null
  checked_in_at: string | null
  notes: string
}

type MaintenanceLog = {
  id: string
  asset_id: string
  type: string
  description: string
  performed_by: string
  performed_at: string
  cost: number | null
  next_due_at: string | null
  notes: string
}

const CAT_GROUPS: Record<string, string[]> = {
  'Audio': ['GUITARS','AMPLIFIERS','KEYBOARDS_AND_PIANOS','SYNTHESIZERS','EURORACK_MODULES','CONTROLLERS_AND_SEQUENCERS','SAMPLERS_AND_GROOVEBOXES','MIXERS_AND_INTERFACES','STUDIO_MONITORS','MICROPHONES','WIRELESS_SYSTEMS','HEADPHONES','RECORDERS','EFFECTS','TUNERS'],
  'Photo & Video': ['CAMERAS','LENSES','FLASH_AND_TRIGGERS','LIGHTING','BATTERIES_AND_POWER','GIMBALS_AND_STABILIZERS','CAMERA_SUPPORT','EDELKRONE_MOTION_CONTROL','VIDEO_MONITORING','COLOR_AND_CALIBRATION'],
  'Systems': ['STORAGE','CASES_AND_BAGS','DIY_AND_LAB','COMPUTERS_AND_DISPLAYS','SOFTWARE','DOMAINS']
}

const CAT_LABELS: Record<string, string> = {
  GUITARS:'Guitars',AMPLIFIERS:'Amplifiers',KEYBOARDS_AND_PIANOS:'Keyboards & Pianos',
  SYNTHESIZERS:'Synthesizers',EURORACK_MODULES:'Eurorack Modules',
  CONTROLLERS_AND_SEQUENCERS:'Controllers & Sequencers',SAMPLERS_AND_GROOVEBOXES:'Samplers & Grooveboxes',
  MIXERS_AND_INTERFACES:'Mixers & Interfaces',STUDIO_MONITORS:'Studio Monitors',
  MICROPHONES:'Microphones',WIRELESS_SYSTEMS:'Wireless Systems',HEADPHONES:'Headphones',
  RECORDERS:'Recorders',EFFECTS:'Effects',TUNERS:'Tuners',CAMERAS:'Cameras',
  LENSES:'Lenses',FLASH_AND_TRIGGERS:'Flash & Triggers',LIGHTING:'Lighting',
  BATTERIES_AND_POWER:'Batteries & Power',GIMBALS_AND_STABILIZERS:'Gimbals & Stabilizers',
  CAMERA_SUPPORT:'Camera Support',EDELKRONE_MOTION_CONTROL:'edelkrone Motion Control',
  VIDEO_MONITORING:'Video Monitoring',COLOR_AND_CALIBRATION:'Color & Calibration',
  STORAGE:'Storage',CASES_AND_BAGS:'Cases & Bags',DIY_AND_LAB:'DIY & Lab',
  COMPUTERS_AND_DISPLAYS:'Computers & Displays',SOFTWARE:'Software',DOMAINS:'Domains'
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  active:        { label:'Active',      color:'#00c853', bg:'rgba(0,200,83,.1)',   border:'rgba(0,200,83,.25)' },
  legacy:        { label:'Legacy',      color:'#888',    bg:'rgba(136,136,136,.1)',border:'rgba(136,136,136,.2)' },
  licensed:      { label:'Licensed',    color:'#2979ff', bg:'rgba(41,121,255,.1)', border:'rgba(41,121,255,.2)' },
  parked:        { label:'Parked',      color:'#555',    bg:'rgba(85,85,85,.1)',   border:'rgba(85,85,85,.2)' },
  concept:       { label:'Concept',     color:'#aa00ff', bg:'rgba(170,0,255,.1)',  border:'rgba(170,0,255,.2)' },
  in_development:{ label:'In dev',      color:'#00bcd4', bg:'rgba(0,188,212,.1)',  border:'rgba(0,188,212,.2)' },
  active_dns_only:{ label:'DNS only',   color:'#5577bb', bg:'rgba(41,121,255,.08)',border:'rgba(41,121,255,.15)' },
  checked_out:   { label:'Checked out', color:'#ffab00', bg:'rgba(255,171,0,.1)',  border:'rgba(255,171,0,.2)' },
}

const CONDITION_OPTS = ['excellent','good','fair','poor','damaged']

function Badge({ status }: { status: string | undefined }) {
  const s = status || 'active'
  const cfg = STATUS_CONFIG[s] || { label: s, color: '#888', bg: 'rgba(136,136,136,.1)', border: 'rgba(136,136,136,.2)' }
  return (
    <span style={{ fontFamily:'IBM Plex Mono,monospace', fontSize:10, letterSpacing:'.06em', padding:'2px 7px', borderRadius:2, fontWeight:500, textTransform:'uppercase' as const, display:'inline-block', whiteSpace:'nowrap' as const, color:cfg.color, background:cfg.bg, border:`1px solid ${cfg.border}` }}>{cfg.label}</span>
  )
}

function RoleBadge({ role }: { role: UserRole | undefined }) {
  if (!role) return null
  const cfg: Record<UserRole, { label: string; color: string }> = {
    super_admin: { label:'Super Admin', color:'#ffab00' },
    admin:       { label:'Admin',       color:'#2979ff' },
    viewer:      { label:'Viewer',      color:'#555' },
  }
  const c = cfg[role]
  return <span style={{ fontFamily:'IBM Plex Mono,monospace', fontSize:9, letterSpacing:'.06em', padding:'2px 6px', borderRadius:2, color:c.color, border:`1px solid ${c.color}33`, background:`${c.color}11` }}>{c.label}</span>
}

function canEdit(role: UserRole) { return role === 'super_admin' || role === 'admin' }
function canDelete(role: UserRole) { return role === 'super_admin' }
function canManageUsers(role: UserRole) { return role === 'super_admin' }

export default function App() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [assets, setAssets] = useState<Asset[]>([])
  const [filtered, setFiltered] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCat, setActiveCat] = useState('ALL')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortCol, setSortCol] = useState<keyof Asset | null>(null)
  const [sortDir, setSortDir] = useState(1)
  const [page, setPage] = useState(1)
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
  const [drawerTab, setDrawerTab] = useState<'details'|'checkout'|'maintenance'|'history'>('details')
  const [showAdd, setShowAdd] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [catSearch, setCatSearch] = useState('')
  const [checkouts, setCheckouts] = useState<Checkout[]>([])
  const [maintenance, setMaintenance] = useState<MaintenanceLog[]>([])
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const PER_PAGE = 75
  const fileInputRef = useRef<HTMLInputElement>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  // Auth
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }
      // Fetch profile directly from Supabase (no server API needed)
      const { data: p } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()
      if (!p) {
        // No profile = not invited -- sign out and redirect to login
        await supabase.auth.signOut()
        window.location.href = '/login?error=not_invited'
        return
      } else {
        setProfile(p)
      }
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') window.location.href = '/login'
    })
    return () => subscription.unsubscribe()
  }, [])

  const fetchAssets = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/assets')
    const data = await res.json()
    setAssets(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { if (!authLoading) fetchAssets() }, [authLoading, fetchAssets])

  useEffect(() => {
    let result = [...assets]
    if (activeCat !== 'ALL') result = result.filter(a => a.category === activeCat)
    if (statusFilter === 'serial-tbd') result = result.filter(a => a.serial === 'TBD' || a.serial === '')
    else if (statusFilter) result = result.filter(a => a.status === statusFilter)
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(a => [a.make,a.model,a.description,a.serial,a.asset_id,a.category_label,a.location,a.assigned_to].some(v => v?.toLowerCase().includes(q)))
    }
    if (sortCol) {
      result.sort((a, b) => {
        const av = String(a[sortCol] ?? '').toLowerCase()
        const bv = String(b[sortCol] ?? '').toLowerCase()
        return av < bv ? -sortDir : av > bv ? sortDir : 0
      })
    }
    setFiltered(result); setPage(1)
  }, [assets, activeCat, search, statusFilter, sortCol, sortDir])

  const openDrawer = async (asset: Asset) => {
    setSelectedAsset(asset); setDrawerTab('details')
    const [co, ml] = await Promise.all([
      fetch(`/api/checkouts?asset_id=${asset.id}`).then(r => r.json()),
      fetch(`/api/maintenance?asset_id=${asset.id}`).then(r => r.json()),
    ])
    setCheckouts(Array.isArray(co) ? co : [])
    setMaintenance(Array.isArray(ml) ? ml : [])
  }

  const saveAsset = async (patch: Partial<Asset>) => {
    if (!selectedAsset || !profile || !canEdit(profile.role)) return
    setSaving(true)
    const res = await fetch(`/api/assets/${selectedAsset.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(patch) })
    const updated = await res.json()
    setAssets(prev => prev.map(a => a.id === updated.id ? updated : a))
    setSelectedAsset(updated); setSaving(false); showToast('Saved')
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedAsset || !profile || !canEdit(profile.role)) return
    const ext = file.name.split('.').pop()
    const path = `${selectedAsset.id}.${ext}`
    const { error } = await supabase.storage.from('asset-photos').upload(path, file, { upsert: true })
    if (error) { showToast('Photo upload failed'); return }
    const { data } = supabase.storage.from('asset-photos').getPublicUrl(path)
    await saveAsset({ photo_url: data.publicUrl + '?t=' + Date.now() })
    showToast('Photo uploaded')
  }

  const checkoutAsset = async (by: string, due: string, notes: string) => {
    if (!selectedAsset || !profile || !canEdit(profile.role)) return
    await fetch('/api/checkouts', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ asset_id:selectedAsset.id, checked_out_by:by, due_back_at:due||null, notes }) })
    await saveAsset({ status: 'checked_out' })
    const co = await fetch(`/api/checkouts?asset_id=${selectedAsset.id}`).then(r => r.json())
    setCheckouts(Array.isArray(co) ? co : []); showToast('Checked out')
  }

  const checkinAsset = async (checkoutId: string) => {
    if (!profile || !canEdit(profile.role)) return
    await fetch('/api/checkouts', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id:checkoutId, checked_in_at:new Date().toISOString() }) })
    await saveAsset({ status: 'active' })
    const co = await fetch(`/api/checkouts?asset_id=${selectedAsset?.id}`).then(r => r.json())
    setCheckouts(Array.isArray(co) ? co : []); showToast('Checked in')
  }

  const addMaintenance = async (type: string, desc: string, by: string, date: string, cost: string, next: string, notes: string) => {
    if (!selectedAsset || !profile || !canEdit(profile.role)) return
    await fetch('/api/maintenance', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ asset_id:selectedAsset.id, type, description:desc, performed_by:by, performed_at:date, cost:cost?parseFloat(cost):null, next_due_at:next||null, notes }) })
    const ml = await fetch(`/api/maintenance?asset_id=${selectedAsset.id}`).then(r => r.json())
    setMaintenance(Array.isArray(ml) ? ml : []); showToast('Maintenance logged')
  }

  const deleteAsset = async () => {
    if (!selectedAsset || !profile || !canDelete(profile.role)) return
    if (!confirm(`Delete ${selectedAsset.make} ${selectedAsset.model}? This cannot be undone.`)) return
    await fetch(`/api/assets/${selectedAsset.id}`, { method:'DELETE' })
    setAssets(prev => prev.filter(a => a.id !== selectedAsset.id))
    setSelectedAsset(null); showToast('Asset deleted')
  }

  const exportCSV = () => {
    const headers = ['ID','Category','Make','Model','Description','Serial','Status','Condition','Location','Assigned To','Notes']
    const rows = filtered.map(a => [a.asset_id,a.category_label,a.make,a.model,a.description,a.serial,a.status,a.condition,a.location,a.assigned_to,a.notes].map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(','))
    const blob = new Blob([[headers.join(','),...rows].join('\n')], { type:'text/csv' })
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'VidorMedia_Assets.csv'; link.click()
  }

  const catCounts = assets.reduce<Record<string, number>>((acc, a) => { acc[a.category] = (acc[a.category]||0)+1; return acc }, {})
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const pageItems = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE)
  const tbdCount = assets.filter(a => a.serial === 'TBD' || !a.serial).length

  if (authLoading) {
    return (
      <div style={{ minHeight:'100vh', background:'#0a0a0a', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ fontFamily:'IBM Plex Mono,monospace', fontSize:11, color:'#444', letterSpacing:'.08em' }}>Loading...</div>
      </div>
    )
  }

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'#0a0a0a', fontFamily:"'IBM Plex Sans',system-ui" }}>

      {/* SIDEBAR */}
      <nav style={{ width:220, minWidth:220, background:'#111', borderRight:'1px solid #222', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'16px 16px 12px', borderBottom:'1px solid #222' }}>
          <div style={{ fontFamily:'IBM Plex Mono,monospace', fontSize:11, fontWeight:600, letterSpacing:'.1em', color:'#ededed' }}>VIDOR MEDIA</div>
          <div style={{ fontFamily:'IBM Plex Mono,monospace', fontSize:9, color:'#444', letterSpacing:'.08em', marginTop:2 }}>ASSET REGISTRY</div>
        </div>

        {/* User info */}
        {profile && (
          <div style={{ padding:'10px 14px', borderBottom:'1px solid #1a1a1a', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontSize:11, color:'#888', marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:130 }}>{profile.full_name || profile.email}</div>
              <RoleBadge role={profile.role} />
            </div>
            <button onClick={() => supabase.auth.signOut()} title="Sign out" style={{ background:'none', border:'none', cursor:'pointer', color:'#444', fontSize:14, padding:2 }}>⎋</button>
          </div>
        )}

        <div style={{ padding:'8px 10px', borderBottom:'1px solid #1a1a1a' }}>
          <input value={catSearch} onChange={e=>setCatSearch(e.target.value)} placeholder="Filter categories..."
            style={{ width:'100%', background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:3, padding:'4px 8px', fontSize:11, color:'#ededed', outline:'none' }} />
        </div>

        <div style={{ overflowY:'auto', flex:1 }}>
          <div style={{ padding:'6px 0' }}>
            <div onClick={()=>setActiveCat('ALL')} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'5px 14px', cursor:'pointer', background:activeCat==='ALL'?'#1e1e1e':'transparent' }}>
              <span style={{ fontSize:12, color:activeCat==='ALL'?'#ededed':'#777' }}>All Assets</span>
              <span style={{ fontFamily:'IBM Plex Mono,monospace', fontSize:10, color:'#444' }}>{assets.length}</span>
            </div>
          </div>
          {Object.entries(CAT_GROUPS).map(([group, cats]) => {
            const visible = cats.filter(c => !catSearch || (CAT_LABELS[c]||c).toLowerCase().includes(catSearch.toLowerCase()))
            if (!visible.length) return null
            return (
              <div key={group} style={{ padding:'4px 0 8px' }}>
                <div style={{ fontFamily:'IBM Plex Mono,monospace', fontSize:9, letterSpacing:'.12em', color:'#3a3a3a', padding:'4px 14px 2px', textTransform:'uppercase' as const }}>{group}</div>
                {visible.map(cat => (
                  <div key={cat} onClick={()=>setActiveCat(cat)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 14px', cursor:'pointer', background:activeCat===cat?'#1e1e1e':'transparent' }}>
                    <span style={{ fontSize:12, color:activeCat===cat?'#ededed':'#666' }}>{CAT_LABELS[cat]||cat}</span>
                    <span style={{ fontFamily:'IBM Plex Mono,monospace', fontSize:10, color:'#3a3a3a' }}>{catCounts[cat]||0}</span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>

        {/* Admin link */}
        {profile && canManageUsers(profile.role) && (
          <div style={{ padding:'10px 14px', borderTop:'1px solid #1a1a1a' }}>
            <button onClick={()=>setShowAdmin(true)} style={{ width:'100%', padding:'6px 0', background:'transparent', border:'1px solid #2a2a2a', borderRadius:3, fontSize:11, color:'#555', cursor:'pointer', fontFamily:'IBM Plex Mono,monospace', letterSpacing:'.06em' }}>
              User Management
            </button>
          </div>
        )}
      </nav>

      {/* MAIN */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
        {/* TOPBAR */}
        <div style={{ height:52, borderBottom:'1px solid #222', display:'flex', alignItems:'center', gap:10, padding:'0 20px', background:'#0a0a0a', flexShrink:0 }}>
          <span style={{ fontFamily:'IBM Plex Mono,monospace', fontSize:12, color:'#555', flexShrink:0 }}>
            {activeCat==='ALL' ? 'All Assets' : (CAT_LABELS[activeCat]||activeCat)}
          </span>
          <div style={{ width:1, height:20, background:'#222', flexShrink:0 }} />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search make, model, serial, description, ID..."
            style={{ flex:1, maxWidth:400, background:'#111', border:'1px solid #222', borderRadius:3, padding:'5px 10px', fontSize:12, color:'#ededed', outline:'none' }} />
          <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
            style={{ background:'#111', border:'1px solid #222', borderRadius:3, padding:'5px 8px', fontSize:12, color:'#ededed', outline:'none' }}>
            <option value=''>All statuses</option>
            <option value='active'>Active</option>
            <option value='serial-tbd'>Serial TBD</option>
            <option value='checked_out'>Checked out</option>
            <option value='legacy'>Legacy</option>
            <option value='licensed'>Licensed</option>
            <option value='parked'>Parked</option>
            <option value='concept'>Concept</option>
          </select>
          <div style={{ flex:1 }} />
          {profile && canEdit(profile.role) && (
            <button onClick={exportCSV} style={{ fontSize:12, padding:'5px 12px', borderRadius:3, border:'1px solid #2a2a2a', color:'#777', background:'#111', cursor:'pointer' }}>Export CSV</button>
          )}
          <button onClick={()=>window.print()} style={{ fontSize:12, padding:'5px 12px', borderRadius:3, border:'1px solid #2a2a2a', color:'#777', background:'#111', cursor:'pointer' }}>Print</button>
          {profile && canEdit(profile.role) && (
            <button onClick={()=>setShowAdd(true)} style={{ fontSize:12, padding:'5px 14px', borderRadius:3, border:'none', background:'#ededed', color:'#000', fontWeight:500, cursor:'pointer' }}>+ Add Asset</button>
          )}
        </div>

        {/* TABLE */}
        <div style={{ flex:1, overflowY:'auto', overflowX:'auto' }}>
          {loading ? (
            <div style={{ padding:60, textAlign:'center', fontFamily:'IBM Plex Mono,monospace', fontSize:11, color:'#444' }}>Loading assets...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding:60, textAlign:'center', fontFamily:'IBM Plex Mono,monospace', fontSize:11, color:'#444' }}>No assets match.</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:800 }}>
              <thead style={{ position:'sticky', top:0, zIndex:5, background:'#0a0a0a' }}>
                <tr>
                  {[['asset_id','ID'],['category_label','Category'],['make','Make'],['model','Model'],['description','Description',false],['serial','Serial'],['location','Location'],['status','Status']].map(([col, label, sortable=true]) => (
                    <th key={col as string} onClick={sortable ? ()=>{ if(sortCol===col) setSortDir(d=>d*-1); else { setSortCol(col as keyof Asset); setSortDir(1) } } : undefined}
                      style={{ padding:'9px 14px', textAlign:'left', borderBottom:'1px solid #222', fontFamily:'IBM Plex Mono,monospace', fontSize:10, letterSpacing:'.08em', fontWeight:500, color: sortCol===col ? '#ededed' : '#555', whiteSpace:'nowrap', cursor:sortable?'pointer':'default' }}>
                      {label}{sortable && (sortCol===col ? (sortDir>0?' ↑':' ↓') : ' ↕')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageItems.map((asset, i) => {
                  const prevCat = i > 0 ? pageItems[i-1].category : null
                  const showCatRow = activeCat === 'ALL' && !search && asset.category !== prevCat
                  return (
                    <>
                      {showCatRow && (
                        <tr key={`cat-${asset.category}`}>
                          <td colSpan={8} style={{ padding:'6px 14px', background:'#0e0e0e', borderBottom:'1px solid #1a1a1a' }}>
                            <span style={{ fontFamily:'IBM Plex Mono,monospace', fontSize:9, letterSpacing:'.12em', color:'#3a3a3a', textTransform:'uppercase' as const }}>{asset.category_label}</span>
                          </td>
                        </tr>
                      )}
                      <tr key={asset.id} onClick={()=>openDrawer(asset)}
                        style={{ cursor:'pointer', background:selectedAsset?.id===asset.id?'#1a1a1a':'transparent' }}
                        onMouseEnter={e=>(e.currentTarget.style.background='#141414')}
                        onMouseLeave={e=>(e.currentTarget.style.background=selectedAsset?.id===asset.id?'#1a1a1a':'transparent')}>
                        <td style={{ padding:'9px 14px', borderBottom:'1px solid #161616', fontFamily:'IBM Plex Mono,monospace', fontSize:11, color:'#444' }}>{asset.asset_id}</td>
                        <td style={{ padding:'9px 14px', borderBottom:'1px solid #161616', fontSize:11, color:'#555' }}>{asset.category_label}</td>
                        <td style={{ padding:'9px 14px', borderBottom:'1px solid #161616', fontWeight:500, color:'#ededed' }}>{asset.make||'—'}</td>
                        <td style={{ padding:'9px 14px', borderBottom:'1px solid #161616', color:'#888' }}>{asset.model||'—'}</td>
                        <td style={{ padding:'9px 14px', borderBottom:'1px solid #161616', color:'#444', fontSize:12, maxWidth:280, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={asset.description}>{asset.description}</td>
                        <td style={{ padding:'9px 14px', borderBottom:'1px solid #161616', fontFamily:'IBM Plex Mono,monospace', fontSize:11, color:(asset.serial==='TBD'||!asset.serial)?'#3a3a3a':'#00c853' }}>{asset.serial||'TBD'}</td>
                        <td style={{ padding:'9px 14px', borderBottom:'1px solid #161616', fontSize:11, color:'#555' }}>{asset.location||'—'}</td>
                        <td style={{ padding:'9px 14px', borderBottom:'1px solid #161616' }}><Badge status={asset.status} /></td>
                      </tr>
                    </>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* STATUSBAR */}
        <div style={{ height:32, borderTop:'1px solid #1a1a1a', display:'flex', alignItems:'center', padding:'0 20px', gap:16, background:'#0a0a0a', flexShrink:0 }}>
          {[['Total',assets.length],['Showing',filtered.length],['Serial TBD',tbdCount]].map(([label,val])=>(
            <span key={label as string} style={{ fontFamily:'IBM Plex Mono,monospace', fontSize:10, color:'#3a3a3a' }}>{label} <span style={{ color:'#666' }}>{val}</span></span>
          ))}
          <div style={{ flex:1 }} />
          <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1} style={{ fontFamily:'IBM Plex Mono,monospace', fontSize:11, color:'#444', padding:'2px 8px', border:'1px solid #1e1e1e', borderRadius:2, background:'#111', cursor:'pointer', opacity:page<=1?.3:1 }}>&#8592;</button>
          <span style={{ fontFamily:'IBM Plex Mono,monospace', fontSize:10, color:'#3a3a3a' }}>{page} / {totalPages}</span>
          <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page>=totalPages} style={{ fontFamily:'IBM Plex Mono,monospace', fontSize:11, color:'#444', padding:'2px 8px', border:'1px solid #1e1e1e', borderRadius:2, background:'#111', cursor:'pointer', opacity:page>=totalPages?.3:1 }}>&#8594;</button>
        </div>
      </div>

      {/* DETAIL DRAWER */}
      {selectedAsset && profile && (
        <>
          <div onClick={()=>setSelectedAsset(null)} style={{ position:'fixed', inset:0, zIndex:99, background:'rgba(0,0,0,.5)' }} />
          <div style={{ position:'fixed', top:0, right:0, width:460, height:'100vh', background:'#111', borderLeft:'1px solid #222', zIndex:100, display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid #222', display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexShrink:0 }}>
              <div>
                <div style={{ fontFamily:'IBM Plex Mono,monospace', fontSize:10, color:'#444', letterSpacing:'.08em' }}>{selectedAsset.asset_id} · {selectedAsset.category_label}</div>
                <div style={{ fontSize:18, fontWeight:500, color:'#ededed', marginTop:4 }}>{selectedAsset.make}</div>
                <div style={{ fontSize:13, color:'#666', marginTop:2 }}>{selectedAsset.model}</div>
                <div style={{ marginTop:6, display:'flex', gap:8, alignItems:'center' }}>
                  <Badge status={selectedAsset.status} />
                  {canDelete(profile.role) && (
                    <button onClick={deleteAsset} style={{ fontFamily:'IBM Plex Mono,monospace', fontSize:9, letterSpacing:'.06em', padding:'2px 7px', borderRadius:2, background:'rgba(255,68,68,.1)', border:'1px solid rgba(255,68,68,.2)', color:'#ff4444', cursor:'pointer' }}>DELETE</button>
                  )}
                </div>
              </div>
              <button onClick={()=>setSelectedAsset(null)} style={{ fontSize:18, color:'#444', cursor:'pointer', background:'none', border:'none' }}>&#x2715;</button>
            </div>
            <div style={{ display:'flex', borderBottom:'1px solid #222', flexShrink:0 }}>
              {(['details','checkout','maintenance','history'] as const).map(tab => (
                <button key={tab} onClick={()=>setDrawerTab(tab)} style={{ flex:1, padding:'9px 0', fontFamily:'IBM Plex Mono,monospace', fontSize:10, letterSpacing:'.06em', textTransform:'uppercase' as const, cursor:'pointer', background:'transparent', border:'none', borderBottom:drawerTab===tab?'1px solid #ededed':'1px solid transparent', color:drawerTab===tab?'#ededed':'#444', marginBottom:-1 }}>{tab}</button>
              ))}
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:20 }}>
              {drawerTab==='details' && <DetailsTab asset={selectedAsset} onSave={saveAsset} saving={saving} onPhotoClick={()=>fileInputRef.current?.click()} canEdit={canEdit(profile.role)} />}
              {drawerTab==='checkout' && <CheckoutTab checkouts={checkouts} assetStatus={selectedAsset.status} onCheckout={checkoutAsset} onCheckin={checkinAsset} canEdit={canEdit(profile.role)} />}
              {drawerTab==='maintenance' && <MaintenanceTab logs={maintenance} onAdd={addMaintenance} canEdit={canEdit(profile.role)} />}
              {drawerTab==='history' && <HistoryTab asset={selectedAsset} checkouts={checkouts} maintenance={maintenance} />}
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handlePhotoUpload} />
        </>
      )}

      {/* ADD MODAL */}
      {showAdd && profile && canEdit(profile.role) && (
        <AddModal onClose={()=>setShowAdd(false)} onAdd={async(data)=>{
          await fetch('/api/assets',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) })
          await fetchAssets(); setShowAdd(false); showToast('Asset added')
        }} />
      )}

      {/* USER MANAGEMENT MODAL */}
      {showAdmin && profile && canManageUsers(profile.role) && (
        <UserManagementModal onClose={()=>setShowAdmin(false)} />
      )}

      {toast && (
        <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:'#ededed', color:'#000', padding:'8px 20px', borderRadius:4, fontFamily:'IBM Plex Mono,monospace', fontSize:12, zIndex:999, letterSpacing:'.06em' }}>{toast}</div>
      )}
    </div>
  )
}

// ---- Sub-components ----

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontFamily:'IBM Plex Mono,monospace', fontSize:10, color:'#444', letterSpacing:'.06em', marginBottom:5 }}>{label}</div>
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder, type='text', disabled=false }: { value:string; onChange?:(v:string)=>void; placeholder?:string; type?:string; disabled?:boolean }) {
  return <input type={type} value={value} onChange={e=>onChange?.(e.target.value)} placeholder={placeholder} disabled={disabled}
    style={{ width:'100%', background: disabled?'#161616':'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:3, padding:'6px 10px', fontSize:12, color:disabled?'#555':'#ededed', outline:'none', fontFamily:"'IBM Plex Sans',system-ui" }} />
}

function Sel({ value, onChange, children, disabled=false }: { value:string; onChange:(v:string)=>void; children:React.ReactNode; disabled?:boolean }) {
  return <select value={value} onChange={e=>onChange(e.target.value)} disabled={disabled}
    style={{ width:'100%', background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:3, padding:'6px 10px', fontSize:12, color:'#ededed', outline:'none' }}>{children}</select>
}

function Textarea({ value, onChange, placeholder, disabled=false }: { value:string; onChange?:(v:string)=>void; placeholder?:string; disabled?:boolean }) {
  return <textarea value={value} onChange={e=>onChange?.(e.target.value)} placeholder={placeholder} rows={3} disabled={disabled}
    style={{ width:'100%', background:disabled?'#161616':'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:3, padding:'6px 10px', fontSize:12, color:disabled?'#555':'#ededed', outline:'none', resize:'vertical', lineHeight:1.5, fontFamily:"'IBM Plex Sans',system-ui" }} />
}

function Btn({ onClick, primary, children, disabled }: { onClick:()=>void; primary?:boolean; children:React.ReactNode; disabled?:boolean }) {
  return <button onClick={onClick} disabled={disabled} style={{ padding:'6px 14px', borderRadius:3, fontSize:12, cursor:disabled?'default':'pointer', fontWeight:primary?500:400, background:primary?'#ededed':'#1a1a1a', color:primary?'#000':'#777', border:primary?'none':'1px solid #2a2a2a', opacity:disabled?.5:1 }}>{children}</button>
}

function DetailsTab({ asset, onSave, saving, onPhotoClick, canEdit }: { asset:Asset; onSave:(p:Partial<Asset>)=>void; saving:boolean; onPhotoClick:()=>void; canEdit:boolean }) {
  const [serial, setSerial] = useState(asset.serial||'')
  const [status, setStatus] = useState(asset.status||'active')
  const [condition, setCondition] = useState(asset.condition||'good')
  const [location, setLocation] = useState(asset.location||'')
  const [assigned, setAssigned] = useState(asset.assigned_to||'')
  const [notes, setNotes] = useState(asset.notes||'')
  const [price, setPrice] = useState(asset.purchase_price?.toString()||'')
  const [value, setValue] = useState(asset.current_value?.toString()||'')
  const [pdate, setPdate] = useState(asset.purchase_date||'')

  useEffect(() => {
    setSerial(asset.serial||''); setStatus(asset.status||'active'); setCondition(asset.condition||'good')
    setLocation(asset.location||''); setAssigned(asset.assigned_to||''); setNotes(asset.notes||'')
    setPrice(asset.purchase_price?.toString()||''); setValue(asset.current_value?.toString()||''); setPdate(asset.purchase_date||'')
  }, [asset.id])

  return (
    <div>
      <div onClick={canEdit ? onPhotoClick : undefined} style={{ background:'#1a1a1a', border:'1px dashed #2a2a2a', borderRadius:4, minHeight:140, display:'flex', alignItems:'center', justifyContent:'center', cursor:canEdit?'pointer':'default', marginBottom:20, overflow:'hidden' }}>
        {asset.photo_url ? <img src={asset.photo_url} alt="" style={{ width:'100%', height:180, objectFit:'cover' }} /> : <span style={{ fontFamily:'IBM Plex Mono,monospace', fontSize:10, color:'#3a3a3a', letterSpacing:'.06em' }}>{canEdit ? '+ ADD PHOTO' : 'No photo'}</span>}
      </div>
      <div style={{ color:'#555', fontSize:12, lineHeight:1.6, marginBottom:20 }}>{asset.description}</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <Field label="Serial / License"><Input value={serial} onChange={canEdit?setSerial:undefined} disabled={!canEdit} /></Field>
        <Field label="Status"><Sel value={status} onChange={setStatus} disabled={!canEdit}><option value="active">Active</option><option value="legacy">Legacy</option><option value="licensed">Licensed</option><option value="parked">Parked</option><option value="concept">Concept</option><option value="in_development">In development</option></Sel></Field>
        <Field label="Condition"><Sel value={condition} onChange={setCondition} disabled={!canEdit}>{CONDITION_OPTS.map(c=><option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}</Sel></Field>
        <Field label="Location"><Input value={location} onChange={canEdit?setLocation:undefined} placeholder="Studio A..." disabled={!canEdit} /></Field>
        <Field label="Assigned To"><Input value={assigned} onChange={canEdit?setAssigned:undefined} placeholder="Name..." disabled={!canEdit} /></Field>
        <Field label="Purchase Date"><Input type="date" value={pdate} onChange={canEdit?setPdate:undefined} disabled={!canEdit} /></Field>
        <Field label="Purchase Price ($)"><Input value={price} onChange={canEdit?setPrice:undefined} placeholder="0.00" disabled={!canEdit} /></Field>
        <Field label="Current Value ($)"><Input value={value} onChange={canEdit?setValue:undefined} placeholder="0.00" disabled={!canEdit} /></Field>
      </div>
      <Field label="Notes"><Textarea value={notes} onChange={canEdit?setNotes:undefined} placeholder="Notes..." disabled={!canEdit} /></Field>
      {canEdit && (
        <Btn primary onClick={()=>onSave({ serial, status, condition, location, assigned_to:assigned, notes, purchase_date:pdate||null, purchase_price:price?parseFloat(price):null, current_value:value?parseFloat(value):null })} disabled={saving}>
          {saving ? 'Saving...' : 'Save changes'}
        </Btn>
      )}
    </div>
  )
}

function CheckoutTab({ checkouts, assetStatus, onCheckout, onCheckin, canEdit }: { checkouts:Checkout[]; assetStatus:string; onCheckout:(by:string,due:string,notes:string)=>void; onCheckin:(id:string)=>void; canEdit:boolean }) {
  const [by, setBy] = useState(''); const [due, setDue] = useState(''); const [notes, setNotes] = useState('')
  const active = checkouts.find(c => !c.checked_in_at)
  return (
    <div>
      {active ? (
        <div style={{ background:'rgba(255,171,0,.08)', border:'1px solid rgba(255,171,0,.2)', borderRadius:4, padding:14, marginBottom:20 }}>
          <div style={{ fontFamily:'IBM Plex Mono,monospace', fontSize:10, color:'#ffab00', marginBottom:6, letterSpacing:'.06em' }}>CURRENTLY CHECKED OUT</div>
          <div style={{ color:'#ededed', fontSize:13, marginBottom:4 }}>{active.checked_out_by}</div>
          <div style={{ color:'#555', fontSize:11 }}>Since {new Date(active.checked_out_at).toLocaleDateString()}</div>
          {active.due_back_at && <div style={{ color:'#555', fontSize:11 }}>Due: {new Date(active.due_back_at).toLocaleDateString()}</div>}
          {canEdit && <div style={{ marginTop:10 }}><Btn primary onClick={()=>onCheckin(active.id)}>Check In</Btn></div>}
        </div>
      ) : canEdit ? (
        <div style={{ marginBottom:20 }}>
          <div style={{ fontFamily:'IBM Plex Mono,monospace', fontSize:10, color:'#444', letterSpacing:'.06em', marginBottom:12 }}>CHECK OUT</div>
          <Field label="Checked out by"><Input value={by} onChange={setBy} placeholder="Name..." /></Field>
          <Field label="Due back"><Input type="date" value={due} onChange={setDue} /></Field>
          <Field label="Notes"><Textarea value={notes} onChange={setNotes} placeholder="Reason, project..." /></Field>
          <Btn primary onClick={()=>{ if(by){onCheckout(by,due,notes);setBy('');setDue('');setNotes('')} }}>Check Out</Btn>
        </div>
      ) : <div style={{ color:'#444', fontFamily:'IBM Plex Mono,monospace', fontSize:11 }}>Asset is available.</div>}
      {checkouts.filter(c=>c.checked_in_at).length > 0 && (
        <div>
          <div style={{ fontFamily:'IBM Plex Mono,monospace', fontSize:10, color:'#444', letterSpacing:'.06em', marginBottom:10 }}>HISTORY</div>
          {checkouts.filter(c=>c.checked_in_at).map(c=>(
            <div key={c.id} style={{ borderBottom:'1px solid #1a1a1a', paddingBottom:10, marginBottom:10 }}>
              <div style={{ color:'#ededed', fontSize:12 }}>{c.checked_out_by}</div>
              <div style={{ color:'#444', fontSize:11 }}>{new Date(c.checked_out_at).toLocaleDateString()} → {c.checked_in_at ? new Date(c.checked_in_at).toLocaleDateString() : 'pending'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MaintenanceTab({ logs, onAdd, canEdit }: { logs:MaintenanceLog[]; onAdd:(type:string,desc:string,by:string,date:string,cost:string,next:string,notes:string)=>void; canEdit:boolean }) {
  const [show, setShow] = useState(false)
  const [type, setType] = useState('service'); const [desc, setDesc] = useState(''); const [by, setBy] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]); const [cost, setCost] = useState(''); const [next, setNext] = useState(''); const [notes, setNotes] = useState('')
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div style={{ fontFamily:'IBM Plex Mono,monospace', fontSize:10, color:'#444', letterSpacing:'.06em' }}>MAINTENANCE LOG</div>
        {canEdit && <Btn onClick={()=>setShow(s=>!s)}>+ Log entry</Btn>}
      </div>
      {show && canEdit && (
        <div style={{ background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:4, padding:14, marginBottom:16 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label="Type"><Sel value={type} onChange={setType}><option value="service">Service</option><option value="repair">Repair</option><option value="calibration">Calibration</option><option value="cleaning">Cleaning</option><option value="firmware">Firmware update</option><option value="other">Other</option></Sel></Field>
            <Field label="Date"><Input type="date" value={date} onChange={setDate} /></Field>
          </div>
          <Field label="Description"><Input value={desc} onChange={setDesc} placeholder="What was done..." /></Field>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label="Performed by"><Input value={by} onChange={setBy} placeholder="Technician..." /></Field>
            <Field label="Cost ($)"><Input value={cost} onChange={setCost} placeholder="0.00" /></Field>
          </div>
          <Field label="Next service due"><Input type="date" value={next} onChange={setNext} /></Field>
          <Field label="Notes"><Textarea value={notes} onChange={setNotes} /></Field>
          <div style={{ display:'flex', gap:8 }}>
            <Btn primary onClick={()=>{ if(desc){onAdd(type,desc,by,date,cost,next,notes);setShow(false);setDesc('');setBy('');setCost('');setNext('');setNotes('')} }}>Save</Btn>
            <Btn onClick={()=>setShow(false)}>Cancel</Btn>
          </div>
        </div>
      )}
      {logs.length === 0 ? <div style={{ color:'#3a3a3a', fontFamily:'IBM Plex Mono,monospace', fontSize:11 }}>No records yet.</div>
        : logs.map(log=>(
          <div key={log.id} style={{ borderBottom:'1px solid #1a1a1a', paddingBottom:12, marginBottom:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
              <span style={{ color:'#ededed', fontSize:12, fontWeight:500 }}>{log.description}</span>
            </div>
            <div style={{ color:'#444', fontSize:11 }}>{log.type} · {new Date(log.performed_at).toLocaleDateString()} {log.performed_by && `· ${log.performed_by}`} {log.cost && `· $${log.cost}`}</div>
            {log.next_due_at && <div style={{ color:'#555', fontSize:11, marginTop:2 }}>Next: {new Date(log.next_due_at).toLocaleDateString()}</div>}
          </div>
        ))
      }
    </div>
  )
}

function HistoryTab({ asset, checkouts, maintenance }: { asset:Asset; checkouts:Checkout[]; maintenance:MaintenanceLog[] }) {
  const events = [
    ...checkouts.map(c=>({ date:c.checked_out_at, label:`Checked out by ${c.checked_out_by}`, sub:c.checked_in_at?`Returned ${new Date(c.checked_in_at).toLocaleDateString()}`:'Not yet returned' })),
    ...maintenance.map(m=>({ date:m.performed_at, label:`${m.type}: ${m.description}`, sub:m.performed_by?`By ${m.performed_by}`:'' })),
    { date:asset.updated_at, label:'Last updated', sub:'' },
  ].sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime())
  return (
    <div>
      <div style={{ fontFamily:'IBM Plex Mono,monospace', fontSize:10, color:'#444', letterSpacing:'.06em', marginBottom:16 }}>ACTIVITY</div>
      {events.map((e,i)=>(
        <div key={i} style={{ display:'flex', gap:12, marginBottom:14 }}>
          <div style={{ width:2, background:'#1e1e1e', flexShrink:0, borderRadius:1, marginTop:4 }} />
          <div>
            <div style={{ color:'#ededed', fontSize:12 }}>{e.label}</div>
            {e.sub && <div style={{ color:'#444', fontSize:11, marginTop:1 }}>{e.sub}</div>}
            <div style={{ color:'#333', fontSize:10, fontFamily:'IBM Plex Mono,monospace', marginTop:2 }}>{new Date(e.date).toLocaleString()}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function AddModal({ onClose, onAdd }: { onClose:()=>void; onAdd:(data:Record<string,unknown>)=>void }) {
  const allCats = Object.values(CAT_GROUPS).flat()
  const [cat, setCat] = useState('GUITARS'); const [make, setMake] = useState(''); const [model, setModel] = useState('')
  const [desc, setDesc] = useState(''); const [serial, setSerial] = useState('TBD'); const [status, setStatus] = useState('active')
  const [condition, setCondition] = useState('good'); const [location, setLocation] = useState(''); const [notes, setNotes] = useState('')
  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.7)' }}>
      <div style={{ background:'#111', border:'1px solid #2a2a2a', borderRadius:6, width:520, maxWidth:'95vw', maxHeight:'90vh', overflow:'hidden', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #222', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontFamily:'IBM Plex Mono,monospace', fontSize:12, letterSpacing:'.1em', color:'#ededed' }}>NEW ASSET</span>
          <button onClick={onClose} style={{ fontSize:18, color:'#444', cursor:'pointer', background:'none', border:'none' }}>&#x2715;</button>
        </div>
        <div style={{ padding:20, overflowY:'auto', flex:1 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field label="Category"><Sel value={cat} onChange={setCat}>{allCats.map(c=><option key={c} value={c}>{CAT_LABELS[c]||c}</option>)}</Sel></Field>
            <Field label="Status"><Sel value={status} onChange={setStatus}><option value="active">Active</option><option value="legacy">Legacy</option><option value="licensed">Licensed</option><option value="parked">Parked</option><option value="concept">Concept</option></Sel></Field>
            <Field label="Make / Brand"><Input value={make} onChange={setMake} placeholder="e.g. Sony" /></Field>
            <Field label="Model"><Input value={model} onChange={setModel} placeholder="e.g. FX3" /></Field>
            <Field label="Serial"><Input value={serial} onChange={setSerial} placeholder="TBD" /></Field>
            <Field label="Condition"><Sel value={condition} onChange={setCondition}>{CONDITION_OPTS.map(c=><option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}</Sel></Field>
            <Field label="Location"><Input value={location} onChange={setLocation} placeholder="Studio A..." /></Field>
          </div>
          <Field label="Description"><Textarea value={desc} onChange={setDesc} placeholder="Full spec..." /></Field>
          <Field label="Notes"><Textarea value={notes} onChange={setNotes} placeholder="Private notes..." /></Field>
        </div>
        <div style={{ padding:'12px 20px', borderTop:'1px solid #222', display:'flex', gap:8, justifyContent:'flex-end' }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn primary onClick={()=>{ if(!make||!model) return; onAdd({ asset_id:`${cat.slice(0,3)}${Date.now()}`, category:cat, category_label:CAT_LABELS[cat]||cat, make, model, description:desc, serial, status, condition, location, notes, assigned_to:'' }) }}>Add Asset</Btn>
        </div>
      </div>
    </div>
  )
}

function UserManagementModal({ onClose }: { onClose:()=>void }) {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [orgs, setOrgs] = useState<{id:string;name:string}[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin'|'viewer'>('viewer')
  const [inviteOrg, setInviteOrg] = useState('')
  const [inviting, setInviting] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/users').then(r=>r.json()),
      supabase.from('organizations').select('id,name').then(({data})=>data||[])
    ]).then(([u, o]) => { setUsers(Array.isArray(u)?u:[]); setOrgs(o); setLoading(false) })
  }, [])

  const updateUser = async (id: string, role: string, org_id: string) => {
    await fetch('/api/users', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id, role, org_id: org_id||null }) })
    setUsers(prev => prev.map(u => u.id===id ? {...u, role:role as UserRole, org_id:org_id||null} : u))
    setToast('Updated')
    setTimeout(() => setToast(''), 2000)
  }

  const sendInvite = async () => {
    if (!inviteEmail) return
    setInviting(true)
    const { error } = await supabase.auth.admin.inviteUserByEmail(inviteEmail)
    if (error) { setToast(`Error: ${error.message}`); setInviting(false); return }
    setToast(`Invite sent to ${inviteEmail}`)
    setInviteEmail(''); setInviting(false)
    setTimeout(() => setToast(''), 3000)
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.7)' }}>
      <div style={{ background:'#111', border:'1px solid #2a2a2a', borderRadius:6, width:700, maxWidth:'95vw', maxHeight:'90vh', overflow:'hidden', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #222', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontFamily:'IBM Plex Mono,monospace', fontSize:12, letterSpacing:'.1em', color:'#ededed' }}>USER MANAGEMENT</span>
          <button onClick={onClose} style={{ fontSize:18, color:'#444', cursor:'pointer', background:'none', border:'none' }}>&#x2715;</button>
        </div>

        <div style={{ padding:20, overflowY:'auto', flex:1 }}>
          {/* Invite */}
          <div style={{ background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:4, padding:16, marginBottom:24 }}>
            <div style={{ fontFamily:'IBM Plex Mono,monospace', fontSize:10, color:'#444', letterSpacing:'.06em', marginBottom:12 }}>INVITE USER</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto auto', gap:10, alignItems:'end' }}>
              <Field label="Email"><Input value={inviteEmail} onChange={setInviteEmail} placeholder="user@email.com" /></Field>
              <Field label="Role">
                <Sel value={inviteRole} onChange={v=>setInviteOrg(v as 'admin'|'viewer')}>
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </Sel>
              </Field>
              <Field label="Organization">
                <Sel value={inviteOrg} onChange={setInviteOrg}>
                  <option value="">None</option>
                  {orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
                </Sel>
              </Field>
              <div style={{ paddingBottom:2 }}><Btn primary onClick={sendInvite} disabled={inviting}>{inviting?'Sending...':'Send Invite'}</Btn></div>
            </div>
          </div>

          {/* User list */}
          <div style={{ fontFamily:'IBM Plex Mono,monospace', fontSize:10, color:'#444', letterSpacing:'.06em', marginBottom:12 }}>USERS</div>
          {loading ? <div style={{ color:'#444', fontSize:12 }}>Loading...</div> : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr>
                  {['Name / Email','Role','Organization',''].map(h=>(
                    <th key={h} style={{ textAlign:'left', padding:'8px 10px', borderBottom:'1px solid #222', fontFamily:'IBM Plex Mono,monospace', fontSize:10, color:'#444', letterSpacing:'.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u=>(
                  <UserRow key={u.id} user={u} orgs={orgs} onUpdate={updateUser} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {toast && (
          <div style={{ margin:'0 20px 16px', background:'rgba(0,200,83,.1)', border:'1px solid rgba(0,200,83,.2)', borderRadius:4, padding:'8px 14px', fontSize:12, color:'#00c853', fontFamily:'IBM Plex Mono,monospace' }}>{toast}</div>
        )}
      </div>
    </div>
  )
}

function UserRow({ user, orgs, onUpdate }: { user:UserProfile; orgs:{id:string;name:string}[]; onUpdate:(id:string,role:string,org:string)=>void }) {
  const [role, setRole] = useState(user.role)
  const [org, setOrg] = useState(user.org_id||'')
  const [dirty, setDirty] = useState(false)

  return (
    <tr style={{ borderBottom:'1px solid #1a1a1a' }}>
      <td style={{ padding:'10px 10px' }}>
        <div style={{ color:'#ededed', fontWeight:500 }}>{user.full_name||'—'}</div>
        <div style={{ color:'#555', fontSize:11 }}>{user.email}</div>
      </td>
      <td style={{ padding:'10px 10px' }}>
        <select value={role} onChange={e=>{ setRole(e.target.value as UserRole); setDirty(true) }}
          style={{ background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:3, padding:'4px 8px', fontSize:11, color:'#ededed', outline:'none' }}>
          <option value="super_admin">Super Admin</option>
          <option value="admin">Admin</option>
          <option value="viewer">Viewer</option>
        </select>
      </td>
      <td style={{ padding:'10px 10px' }}>
        <select value={org} onChange={e=>{ setOrg(e.target.value); setDirty(true) }}
          style={{ background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:3, padding:'4px 8px', fontSize:11, color:'#ededed', outline:'none' }}>
          <option value="">None</option>
          {orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </td>
      <td style={{ padding:'10px 10px' }}>
        {dirty && <Btn primary onClick={()=>{ onUpdate(user.id, role, org); setDirty(false) }}>Save</Btn>}
      </td>
    </tr>
  )
}
