'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/auth'
import type { UserProfile, UserRole } from '@/lib/auth'
import styles from './styles/app.module.css'
import { fetchOrgTheme, applyTheme, resetTheme, type OrgTheme } from '@/lib/useTheme'
import './styles/theme.css'

type Asset = {
  id: string; asset_id: string; category: string; category_label: string
  make: string; model: string; description: string; serial: string
  status: string; condition: string; notes: string; location: string
  assigned_to: string; purchase_date: string | null; purchase_price: number | null
  current_value: number | null; photo_url: string | null; updated_at: string
}
type Checkout = {
  id: string; asset_id: string; checked_out_by: string; checked_out_at: string
  due_back_at: string | null; checked_in_at: string | null; notes: string
}
type MaintenanceLog = {
  id: string; asset_id: string; type: string; description: string
  performed_by: string; performed_at: string; cost: number | null
  next_due_at: string | null; notes: string
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
const BADGE_MAP: Record<string, string> = {
  active:         styles.badgeActive,
  available:      styles.badgeActive,
  licensed:       styles.badgeLicensed,
  subscription:   styles.badgeLicensed,
  in_use:         styles.badgeTeal,
  reserved:       styles.badgeTeal,
  on_loan:        styles.badgeWarning,
  checked_out:    styles.badgeWarning,
  needs_repair:   styles.badgeDanger,
  in_repair:      styles.badgeWarning,
  expired:        styles.badgeDanger,
  stolen:         styles.badgeDanger,
  lost:           styles.badgeDanger,
  retired:        styles.badgeMuted,
  legacy:         styles.badgeMuted,
  active_dns_only:styles.badgeDim,
  parked:         styles.badgeDim,
}
const BADGE_LABELS: Record<string, string> = {
  // Operational
  active:       'Active',
  checked_out:  'Checked Out',
  in_use:       'In Use',
  // Availability
  available:    'Available',
  reserved:     'Reserved',
  on_loan:      'On Loan',
  // Condition flags
  needs_repair: 'Needs Repair',
  in_repair:    'In Repair',
  retired:      'Retired',
  // Software / Licenses
  licensed:     'Licensed',
  subscription: 'Subscription',
  expired:      'Expired',
  // Domains
  active_dns_only: 'DNS Only',
  parked:       'Parked',
  // Other
  legacy:       'Legacy',
  lost:         'Lost',
  stolen:       'Stolen',
}
const ROLE_CLASS: Record<UserRole, string> = {
  super_admin:styles.roleBadgeSuperAdmin, admin:styles.roleBadgeAdmin, viewer:styles.roleBadgeViewer,
}
const ROLE_LABEL: Record<UserRole, string> = {
  super_admin:'Super Admin', admin:'Admin', viewer:'Viewer',
}
const CONDITION_OPTS = ['excellent','good','fair','poor','damaged']
const STATUS_OPTS = [
  { group: 'Operational',        values: ['active','checked_out','in_use','available','reserved','on_loan'] },
  { group: 'Issues',             values: ['needs_repair','in_repair','lost','stolen'] },
  { group: 'Software & Licenses',values: ['licensed','subscription','expired'] },
  { group: 'Domains',            values: ['active_dns_only','parked'] },
  { group: 'End of Life',        values: ['legacy','retired'] },
]
const STATUS_OPTS_FLAT = STATUS_OPTS.flatMap(g => g.values)
const PER_PAGE_OPTS = [25, 50, 75, 100, 0] // 0 = All

function Badge({ status }: { status?: string }) {
  const s = status || 'active'
  return <span className={`${styles.badge} ${BADGE_MAP[s]||styles.badgeDim}`}>{BADGE_LABELS[s]||s}</span>
}
function RoleBadge({ role }: { role?: UserRole }) {
  if (!role) return null
  return <span className={ROLE_CLASS[role]}>{ROLE_LABEL[role]}</span>
}
function canEdit(role?: UserRole) { return role === 'super_admin' || role === 'admin' }
function canDelete(role?: UserRole) { return role === 'super_admin' }
function canManageUsers(role?: UserRole) { return role === 'super_admin' }

// Straight-line depreciation
function calcDepreciation(price: number | null, date: string | null): { currentValue: number; pctLost: number; yearsOld: number } | null {
  if (!price || !date) return null
  const years = (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24 * 365)
  const lifespan = 7 // assume 7 year lifespan
  const pctLost = Math.min(1, years / lifespan)
  return { currentValue: Math.round(price * (1 - pctLost)), pctLost, yearsOld: parseFloat(years.toFixed(1)) }
}

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
  const [perPage, setPerPage] = useState(75)
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
  const [drawerTab, setDrawerTab] = useState<'details'|'checkout'|'maintenance'|'history'>('details')
  const [showAdd, setShowAdd] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [showSchool, setShowSchool] = useState(false)
  const [showBulkSerial, setShowBulkSerial] = useState(false)
  const [showCSVImport, setShowCSVImport] = useState(false)
  const [duplicateAsset, setDuplicateAsset] = useState<Asset | null>(null)
  const [activeOrg, setActiveOrg] = useState<{id:string;name:string;theme:Record<string,string>}|null>(null)
  const [allOrgs, setAllOrgs] = useState<{id:string;name:string;theme:Record<string,string>}[]>([])
  const [catSearch, setCatSearch] = useState('')
  const [checkouts, setCheckouts] = useState<Checkout[]>([])
  const [maintenance, setMaintenance] = useState<MaintenanceLog[]>([])
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }
      const { data: p } = await supabase.from('user_profiles').select('*').eq('id', session.user.id).single()
      if (!p) { await supabase.auth.signOut(); window.location.href = '/login?error=not_invited'; return }
      setProfile(p)
      if (p.org_id) {
        const theme = await fetchOrgTheme(p.org_id)
        if (theme) applyTheme(theme)
      }
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { resetTheme(); window.location.href = '/login' }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (profile?.role === 'super_admin') {
      authHeaders().then(hdrs => fetch('/api/orgs', { headers: hdrs }).then(r=>r.json()).then(orgs => setAllOrgs(Array.isArray(orgs)?orgs:[])))
    }
  }, [profile])

  // Auth headers helper -- sends JWT with every API request
  const authHeaders = useCallback(async (): Promise<HeadersInit> => {
    const { data: { session } } = await supabase.auth.getSession()
    return session ? { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
  }, [])

  const fetchAssets = useCallback(async (orgId?: string) => {
    setLoading(true)
    const url = orgId ? `/api/assets?org_id=${orgId}` : '/api/assets'
    const hdrs = await authHeaders()
    const res = await fetch(url, { headers: hdrs })
    const data = await res.json()
    setAssets(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { if (!authLoading) fetchAssets(activeOrg?.id) }, [authLoading, fetchAssets, activeOrg])

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
        const av = String(a[sortCol]??'').toLowerCase()
        const bv = String(b[sortCol]??'').toLowerCase()
        return av < bv ? -sortDir : av > bv ? sortDir : 0
      })
    }
    setFiltered(result); setPage(1)
  }, [assets, activeCat, search, statusFilter, sortCol, sortDir])

  const openDrawer = async (asset: Asset) => {
    setSelectedAsset(asset); setDrawerTab('details')
    const hdrs = await authHeaders()
    const [co, ml] = await Promise.all([
      fetch(`/api/checkouts?asset_id=${asset.id}`, { headers: hdrs }).then(r=>r.json()),
      fetch(`/api/maintenance?asset_id=${asset.id}`, { headers: hdrs }).then(r=>r.json()),
    ])
    setCheckouts(Array.isArray(co)?co:[])
    setMaintenance(Array.isArray(ml)?ml:[])
  }

  const saveAsset = async (patch: Partial<Asset>) => {
    if (!selectedAsset || !canEdit(profile?.role)) return
    setSaving(true)
    const hdrs = await authHeaders()
    const res = await fetch(`/api/assets/${selectedAsset.id}`, { method:'PATCH', headers:hdrs, body:JSON.stringify(patch) })
    const updated = await res.json()
    setAssets(prev => prev.map(a => a.id===updated.id ? updated : a))
    setSelectedAsset(updated); setSaving(false); showToast('Saved')
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedAsset || !canEdit(profile?.role)) return
    const ext = file.name.split('.').pop()
    const path = `${selectedAsset.id}.${ext}`
    const { error } = await supabase.storage.from('asset-photos').upload(path, file, { upsert:true })
    if (error) { showToast('Photo upload failed'); return }
    const { data } = supabase.storage.from('asset-photos').getPublicUrl(path)
    await saveAsset({ photo_url: data.publicUrl + '?t=' + Date.now() })
    showToast('Photo uploaded')
  }

  const checkoutAsset = async (by: string, due: string, notes: string) => {
    if (!selectedAsset || !canEdit(profile?.role)) return
    const hdrs = await authHeaders()
    await fetch('/api/checkouts', { method:'POST', headers:hdrs, body:JSON.stringify({ asset_id:selectedAsset.id, checked_out_by:by, due_back_at:due||null, notes }) })
    await saveAsset({ status:'checked_out' })
    const co = await fetch(`/api/checkouts?asset_id=${selectedAsset.id}`, { headers: await authHeaders() }).then(r=>r.json())
    setCheckouts(Array.isArray(co)?co:[]); showToast('Checked out')
  }

  const checkinAsset = async (checkoutId: string) => {
    if (!canEdit(profile?.role)) return
    const hdrs = await authHeaders()
    await fetch('/api/checkouts', { method:'PATCH', headers:hdrs, body:JSON.stringify({ id:checkoutId, checked_in_at:new Date().toISOString() }) })
    await saveAsset({ status:'active' })
    const co = await fetch(`/api/checkouts?asset_id=${selectedAsset?.id}`, { headers: await authHeaders() }).then(r=>r.json())
    setCheckouts(Array.isArray(co)?co:[]); showToast('Checked in')
  }

  const addMaintenance = async (type: string, desc: string, by: string, date: string, cost: string, next: string, notes: string) => {
    if (!selectedAsset || !canEdit(profile?.role)) return
    const hdrs = await authHeaders()
    await fetch('/api/maintenance', { method:'POST', headers:hdrs, body:JSON.stringify({ asset_id:selectedAsset.id, type, description:desc, performed_by:by, performed_at:date, cost:cost?parseFloat(cost):null, next_due_at:next||null, notes }) })
    const ml = await fetch(`/api/maintenance?asset_id=${selectedAsset.id}`, { headers: await authHeaders() }).then(r=>r.json())
    setMaintenance(Array.isArray(ml)?ml:[]); showToast('Maintenance logged')
  }

  const deleteAsset = async () => {
    if (!selectedAsset || !canDelete(profile?.role)) return
    if (!confirm(`Delete ${selectedAsset.make} ${selectedAsset.model}? This cannot be undone.`)) return
    const hdrs = await authHeaders()
    await fetch(`/api/assets/${selectedAsset.id}`, { method:'DELETE', headers:hdrs })
    setAssets(prev => prev.filter(a => a.id !== selectedAsset.id))
    setSelectedAsset(null); showToast('Asset deleted')
  }

  const exportCSV = () => {
    const headers = ['ID','Category','Make','Model','Description','Serial','Status','Condition','Location','Assigned To','Notes']
    const rows = filtered.map(a => [a.asset_id,a.category_label,a.make,a.model,a.description,a.serial,a.status,a.condition,a.location,a.assigned_to,a.notes].map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(','))
    const blob = new Blob([[headers.join(','),...rows].join('\n')], { type:'text/csv' })
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'VidorMedia_Assets.csv'; link.click()
  }

  const catCounts = assets.reduce<Record<string,number>>((acc,a) => { acc[a.category]=(acc[a.category]||0)+1; return acc }, {})
  const effectivePerPage = perPage === 0 ? filtered.length : perPage
  const totalPages = Math.max(1, Math.ceil(filtered.length / effectivePerPage))
  const pageItems = perPage === 0 ? filtered : filtered.slice((page-1)*effectivePerPage, page*effectivePerPage)
  const tbdCount = assets.filter(a => a.serial==='TBD'||!a.serial).length

  if (authLoading) return <div className={styles.emptyState} style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>Loading...</div>

  return (
    <div className={styles.app}>

      {/* SIDEBAR */}
      <nav className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarLogo}>VIDOR MEDIA</div>
          <div className={styles.sidebarSub}>ASSET REGISTRY</div>
        </div>

        {profile && (
          <div className={styles.sidebarUser}>
            <div>
              <div className={styles.sidebarUserName}>{profile.full_name||profile.email}</div>
              <RoleBadge role={profile.role} />
            </div>
            <button className={styles.signOutBtn} onClick={()=>supabase.auth.signOut()} title="Sign out">⎋</button>
          </div>
        )}

        {/* ORG SWITCHER */}
        {profile?.role === 'super_admin' && (
          <div style={{ padding:'8px 10px', borderBottom:'1px solid var(--color-border)' }}>
            <select value={activeOrg?.id||''} onChange={e=>{
              const org = allOrgs.find(o=>o.id===e.target.value)||null
              setActiveOrg(org)
              if (org?.theme) applyTheme(org.theme); else resetTheme()
            }} style={{ width:'100%', background:'var(--color-bg-3)', border:'1px solid var(--color-border-2)', borderRadius:'var(--radius-sm)', padding:'5px 8px', fontSize:11, color:'var(--color-text-primary)', outline:'none', fontFamily:'var(--font-sans)' }}>
              <option value=''>All orgs (Vidor Media)</option>
              {allOrgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        )}

        <div className={styles.sidebarSearch}>
          <input className={styles.sidebarSearchInput} value={catSearch} onChange={e=>setCatSearch(e.target.value)} placeholder="Filter categories..." />
        </div>

        <div className={styles.sidebarScroll}>
          <div className={styles.catSection}>
            <div onClick={()=>setActiveCat('ALL')} className={`${styles.catItem} ${activeCat==='ALL'?styles.active:''}`}>
              <span className={styles.catName}>All Assets</span>
              <span className={styles.catCount}>{assets.length}</span>
            </div>
          </div>
          {Object.entries(CAT_GROUPS).map(([group, cats]) => {
            const visible = cats.filter(c=>!catSearch||(CAT_LABELS[c]||c).toLowerCase().includes(catSearch.toLowerCase()))
            if (!visible.length) return null
            return (
              <div key={group} className={styles.catSection}>
                <div className={styles.catGroupLabel}>{group}</div>
                {visible.map(cat=>(
                  <div key={cat} onClick={()=>setActiveCat(cat)} className={`${styles.catItem} ${activeCat===cat?styles.active:''}`}>
                    <span className={styles.catName}>{CAT_LABELS[cat]||cat}</span>
                    <span className={styles.catCount}>{catCounts[cat]||0}</span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>

        {profile && canManageUsers(profile.role) && (
          <div className={styles.sidebarAdminWrap} style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <button className={styles.sidebarAdminBtn} onClick={()=>setShowAdmin(true)}>User Management</button>
            <button className={styles.sidebarAdminBtn} onClick={()=>setShowSchool(true)}>Onboard School</button>
            <button className={styles.sidebarAdminBtn} onClick={()=>setShowBulkSerial(true)} style={{ color: tbdCount > 0 ? 'var(--color-warning)' : undefined }}>
              Bulk Serials {tbdCount > 0 ? `(${tbdCount})` : ''}
            </button>
          </div>
        )}
      </nav>

      {/* MAIN */}
      <div className={styles.main}>
        <div className={styles.topbar}>
          <span className={styles.topbarTitle}>{activeCat==='ALL'?'All Assets':(CAT_LABELS[activeCat]||activeCat)}</span>
          <div className={styles.topbarDivider} />
          <input className={styles.searchInput} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search make, model, serial, description, ID..." />
          <select className={styles.statusSelect} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
            <option value=''>All statuses</option>
            <option value='serial-tbd'>⚠ Serial TBD</option>
            {STATUS_OPTS.map(group=>(
              <optgroup key={group.group} label={group.group}>
                {group.values.map(v=><option key={v} value={v}>{BADGE_LABELS[v]||v}</option>)}
              </optgroup>
            ))}
          </select>
          <div className={styles.topbarSpacer} />
          {canEdit(profile?.role) && <button className={styles.btn} onClick={()=>setShowCSVImport(true)}>Import CSV</button>}
          {canEdit(profile?.role) && <button className={styles.btn} onClick={exportCSV}>Export CSV</button>}
          <button className={styles.btn} onClick={()=>window.print()}>Print</button>
          {canEdit(profile?.role) && <button className={styles.btnPrimary} onClick={()=>setShowAdd(true)}>+ Add Asset</button>}
        </div>

        <div className={styles.tableWrap}>
          {loading ? (
            <div className={styles.emptyState}>Loading assets...</div>
          ) : filtered.length === 0 ? (
            <div className={styles.emptyState}>No assets match.</div>
          ) : (
            <table className={styles.table}>
              <thead className={styles.tableThead}>
                <tr>
                  {([['asset_id','ID'],['category_label','Category'],['make','Make'],['model','Model'],['description','Description',false],['serial','Serial'],['location','Location'],['status','Status']] as [keyof Asset,string,boolean?][]).map(([col,label,sortable=true])=>(
                    <th key={col} className={`${styles.tableTh} ${sortCol===col?styles.sorted:''}`}
                      onClick={sortable?()=>{ if(sortCol===col) setSortDir(d=>d*-1); else { setSortCol(col); setSortDir(1) } }:undefined}>
                      {label}{sortable&&(sortCol===col?(sortDir>0?' ↑':' ↓'):' ↕')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageItems.map((asset,i)=>{
                  const showCatRow = activeCat==='ALL'&&!search&&asset.category!==(i>0?pageItems[i-1].category:null)
                  return (
                    <>
                      {showCatRow && (
                        <tr key={`cat-${asset.category}`} className={styles.catGroupRow}>
                          <td colSpan={8}><span className={styles.catGroupLabel}>{asset.category_label}</span></td>
                        </tr>
                      )}
                      <tr key={asset.id} className={`${styles.tableTr} ${selectedAsset?.id===asset.id?styles.selected:''}`} onClick={()=>openDrawer(asset)}>
                        <td className={`${styles.tableTd} ${styles.tdId}`}>{asset.asset_id}</td>
                        <td className={`${styles.tableTd} ${styles.tdCategory}`}>{asset.category_label}</td>
                        <td className={`${styles.tableTd} ${styles.tdMake}`}>{asset.make||'—'}</td>
                        <td className={`${styles.tableTd} ${styles.tdModel}`}>{asset.model||'—'}</td>
                        <td className={`${styles.tableTd} ${styles.tdDesc}`} title={asset.description}>{asset.description}</td>
                        <td className={`${styles.tableTd} ${(asset.serial==='TBD'||!asset.serial)?styles.tdSerialTbd:styles.tdSerialOk}`}>{asset.serial||'TBD'}</td>
                        <td className={`${styles.tableTd} ${styles.tdLocation}`}>{asset.location||'—'}</td>
                        <td className={styles.tableTd}><Badge status={asset.status} /></td>
                      </tr>
                    </>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className={styles.statusbar}>
          {[['Total',assets.length],['Showing',filtered.length],['Serial TBD',tbdCount]].map(([label,val])=>(
            <span key={label as string} className={styles.sbItem}>{label} <span className={styles.sbVal}>{val}</span></span>
          ))}
          <div className={styles.sbSpacer} />
          {/* ROWS PER PAGE */}
          <span className={styles.sbItem}>Rows:</span>
          <select value={perPage} onChange={e=>{setPerPage(Number(e.target.value));setPage(1)}}
            style={{ background:'var(--color-bg-1)', border:'1px solid var(--color-border-3)', borderRadius:'var(--radius-sm)', padding:'2px 6px', fontSize:11, color:'var(--color-text-secondary)', outline:'none', fontFamily:'var(--font-mono)' }}>
            {PER_PAGE_OPTS.map(n=><option key={n} value={n}>{n===0?'All':n}</option>)}
          </select>
          <button className={styles.pageBtn} onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1||perPage===0}>&#8592;</button>
          <span className={styles.sbItem}>{perPage===0?'All':page} {perPage!==0&&`/ ${totalPages}`}</span>
          <button className={styles.pageBtn} onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page>=totalPages||perPage===0}>&#8594;</button>
        </div>
      </div>

      {/* DETAIL DRAWER */}
      {selectedAsset && profile && (
        <>
          <div className={styles.overlay} onClick={()=>setSelectedAsset(null)} />
          <div className={styles.drawer}>
            <div className={styles.drawerHeader}>
              <div>
                <div className={styles.drawerAssetId}>{selectedAsset.asset_id} · {selectedAsset.category_label}</div>
                <div className={styles.drawerMake}>{selectedAsset.make}</div>
                <div className={styles.drawerModel}>{selectedAsset.model}</div>
                <div className={styles.drawerBadgeRow}>
                  <Badge status={selectedAsset.status} />
                  {canEdit(profile.role) && <button className={styles.btn} style={{fontSize:10,padding:'2px 8px'}} onClick={()=>{setDuplicateAsset(selectedAsset);setShowAdd(true)}}>Duplicate</button>}
                  {canDelete(profile.role) && <button className={styles.btnDanger} onClick={deleteAsset}>Delete</button>}
                </div>
              </div>
              <button className={styles.drawerClose} onClick={()=>setSelectedAsset(null)}>&#x2715;</button>
            </div>
            <div className={styles.drawerTabs}>
              {(['details','checkout','maintenance','history'] as const).map(tab=>(
                <button key={tab} className={`${styles.drawerTab} ${drawerTab===tab?styles.active:''}`} onClick={()=>setDrawerTab(tab)}>{tab}</button>
              ))}
            </div>
            <div className={styles.drawerBody}>
              {drawerTab==='details' && <DetailsTab asset={selectedAsset} onSave={saveAsset} saving={saving} onPhotoClick={()=>fileInputRef.current?.click()} canEdit={canEdit(profile.role)} />}
              {drawerTab==='checkout' && <CheckoutTab checkouts={checkouts} onCheckout={checkoutAsset} onCheckin={checkinAsset} canEdit={canEdit(profile.role)} />}
              {drawerTab==='maintenance' && <MaintenanceTab logs={maintenance} onAdd={addMaintenance} canEdit={canEdit(profile.role)} />}
              {drawerTab==='history' && <HistoryTab asset={selectedAsset} checkouts={checkouts} maintenance={maintenance} />}
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" style={{display:'none'}} onChange={handlePhotoUpload} />
        </>
      )}

      {showAdd && profile && canEdit(profile.role) && (
        <AddModal
          prefill={duplicateAsset||undefined}
          onClose={()=>{setShowAdd(false);setDuplicateAsset(null)}}
          onAdd={async(data)=>{
            const hdrs = await authHeaders()
          await fetch('/api/assets',{method:'POST',headers:hdrs,body:JSON.stringify(data)})
            await fetchAssets(activeOrg?.id); setShowAdd(false); setDuplicateAsset(null); showToast('Asset added')
          }} />
      )}
      {showAdmin && profile && canManageUsers(profile.role) && <UserManagementModal onClose={()=>setShowAdmin(false)} />}
      {showSchool && profile && canManageUsers(profile.role) && <SchoolModal onClose={()=>setShowSchool(false)} />}
      {showBulkSerial && profile && canEdit(profile.role) && (
        <BulkSerialModal assets={assets.filter(a=>a.serial==='TBD'||!a.serial)} onClose={()=>setShowBulkSerial(false)}
          onSave={async(id,serial)=>{
            await fetch(`/api/assets/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({serial})})
            setAssets(prev=>prev.map(a=>a.id===id?{...a,serial}:a))
          }} />
      )}
      {showCSVImport && profile && canEdit(profile.role) && (
        <CSVImportModal
          orgId={activeOrg?.id||'00000000-0000-0000-0000-000000000001'}
          onClose={()=>setShowCSVImport(false)}
          onImported={()=>{ fetchAssets(activeOrg?.id); showToast('Assets imported') }} />
      )}
      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}

// ---- FIELD HELPERS ----
function Field({ label, children }: { label:string; children:React.ReactNode }) {
  return <div className={styles.fieldWrap}><label className={styles.fieldLabel}>{label}</label>{children}</div>
}
function Input({ value, onChange, placeholder, type='text', disabled=false }: { value:string; onChange?:(v:string)=>void; placeholder?:string; type?:string; disabled?:boolean }) {
  return <input type={type} value={value} onChange={e=>onChange?.(e.target.value)} placeholder={placeholder} disabled={disabled} className={styles.fieldInput} />
}
function Sel({ value, onChange, children, disabled=false }: { value:string; onChange:(v:string)=>void; children:React.ReactNode; disabled?:boolean }) {
  return <select value={value} onChange={e=>onChange(e.target.value)} disabled={disabled} className={styles.fieldSelect}>{children}</select>
}
function Textarea({ value, onChange, placeholder, disabled=false }: { value:string; onChange?:(v:string)=>void; placeholder?:string; disabled?:boolean }) {
  return <textarea value={value} onChange={e=>onChange?.(e.target.value)} placeholder={placeholder} rows={3} disabled={disabled} className={styles.fieldTextarea} />
}
function Btn({ onClick, primary, children, disabled }: { onClick:()=>void; primary?:boolean; children:React.ReactNode; disabled?:boolean }) {
  return <button onClick={onClick} disabled={disabled} className={primary?styles.btnPrimary:styles.btn}>{children}</button>
}

// ---- DETAILS TAB ----
function DetailsTab({ asset, onSave, saving, onPhotoClick, canEdit }: { asset:Asset; onSave:(p:Partial<Asset>)=>void; saving:boolean; onPhotoClick:()=>void; canEdit:boolean }) {
  const [name, setName] = useState(asset.model||'')
  const [make, setMake] = useState(asset.make||'')
  const [category, setCategory] = useState(asset.category||'')
  const [serial, setSerial] = useState(asset.serial||'')
  const [status, setStatus] = useState(asset.status||'active')
  const [condition, setCondition] = useState(asset.condition||'good')
  const [location, setLocation] = useState(asset.location||'')
  const [assigned, setAssigned] = useState(asset.assigned_to||'')
  const [notes, setNotes] = useState(asset.notes||'')
  const [price, setPrice] = useState(asset.purchase_price?.toString()||'')
  const [value, setValue] = useState(asset.current_value?.toString()||'')
  const [pdate, setPdate] = useState(asset.purchase_date||'')

  useEffect(()=>{
    setName(asset.model||''); setMake(asset.make||''); setCategory(asset.category||'')
    setSerial(asset.serial||''); setStatus(asset.status||'active'); setCondition(asset.condition||'good')
    setLocation(asset.location||''); setAssigned(asset.assigned_to||''); setNotes(asset.notes||'')
    setPrice(asset.purchase_price?.toString()||''); setValue(asset.current_value?.toString()||''); setPdate(asset.purchase_date||'')
  }, [asset.id])

  const depr = calcDepreciation(asset.purchase_price, asset.purchase_date)
  return (
    <div>
      <div className={styles.photoArea} onClick={canEdit?onPhotoClick:undefined} style={{cursor:canEdit?'pointer':'default'}}>
        {asset.photo_url
          ? <img src={asset.photo_url} alt="" style={{width:'100%',height:180,objectFit:'cover'}} />
          : <span className={styles.photoHint}>{canEdit?'+ ADD PHOTO':'No photo'}</span>}
      </div>
      <div className={styles.drawerDesc}>{asset.description}</div>

      <div className={styles.fieldGrid}>
        <Field label="Model / Name"><Input value={name} onChange={canEdit?setName:undefined} disabled={!canEdit} /></Field>
        <Field label="Make / Brand"><Input value={make} onChange={canEdit?setMake:undefined} disabled={!canEdit} /></Field>
        <Field label="Category">
          <Sel value={category} onChange={setCategory} disabled={!canEdit}>
            {Object.values(CAT_GROUPS).flat().map(c=><option key={c} value={c}>{CAT_LABELS[c]||c}</option>)}
          </Sel>
        </Field>
        <Field label="Status">
          <Sel value={status} onChange={setStatus} disabled={!canEdit}>
            {STATUS_OPTS_FLAT.map(s=><option key={s} value={s}>{BADGE_LABELS[s]||s}</option>)}
          </Sel>
        </Field>
        <Field label="Serial / License"><Input value={serial} onChange={canEdit?setSerial:undefined} disabled={!canEdit} /></Field>
        <Field label="Condition">
          <Sel value={condition} onChange={setCondition} disabled={!canEdit}>
            {CONDITION_OPTS.map(c=><option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
          </Sel>
        </Field>
        <Field label="Location"><Input value={location} onChange={canEdit?setLocation:undefined} placeholder="Studio A..." disabled={!canEdit} /></Field>
        <Field label="Assigned To"><Input value={assigned} onChange={canEdit?setAssigned:undefined} placeholder="Name..." disabled={!canEdit} /></Field>
        <Field label="Purchase Date"><Input type="date" value={pdate} onChange={canEdit?setPdate:undefined} disabled={!canEdit} /></Field>
        <Field label="Purchase Price ($)"><Input value={price} onChange={canEdit?setPrice:undefined} placeholder="0.00" disabled={!canEdit} /></Field>
        <Field label="Current Value ($)"><Input value={value} onChange={canEdit?setValue:undefined} placeholder="0.00" disabled={!canEdit} /></Field>
      </div>

      {/* DEPRECIATION */}
      {depr && (
        <div style={{ background:'var(--color-bg-3)', border:'1px solid var(--color-border-2)', borderRadius:'var(--radius-md)', padding:'12px 14px', marginBottom:14 }}>
          <div className={styles.fieldLabel} style={{marginBottom:8}}>DEPRECIATION (straight-line, 7yr)</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
            {[
              ['Age', `${depr.yearsOld} yrs`],
              ['Lost', `${Math.round(depr.pctLost*100)}%`],
              ['Est. Value', `$${depr.currentValue.toLocaleString()}`],
            ].map(([l,v])=>(
              <div key={l}>
                <div style={{fontFamily:'var(--font-mono)',fontSize:9,color:'var(--color-text-muted)',letterSpacing:'.06em',marginBottom:3}}>{l}</div>
                <div style={{fontSize:13,fontWeight:500,color:'var(--color-text-primary)'}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{marginTop:10,height:4,background:'var(--color-border-2)',borderRadius:2,overflow:'hidden'}}>
            <div style={{height:'100%',width:`${Math.round(depr.pctLost*100)}%`,background:'var(--color-warning)',borderRadius:2,transition:'width .3s'}} />
          </div>
        </div>
      )}

      <Field label="Notes"><Textarea value={notes} onChange={canEdit?setNotes:undefined} disabled={!canEdit} /></Field>
      {canEdit && (
        <Btn primary onClick={()=>onSave({
          model:name, make, category, category_label:CAT_LABELS[category]||category,
          serial, status, condition, location, assigned_to:assigned, notes,
          purchase_date:pdate||null, purchase_price:price?parseFloat(price):null,
          current_value:value?parseFloat(value):null
        })} disabled={saving}>{saving?'Saving...':'Save changes'}</Btn>
      )}
    </div>
  )
}

// ---- CHECKOUT TAB ----
function CheckoutTab({ checkouts, onCheckout, onCheckin, canEdit }: { checkouts:Checkout[]; onCheckout:(by:string,due:string,notes:string)=>void; onCheckin:(id:string)=>void; canEdit:boolean }) {
  const [by, setBy] = useState(''); const [due, setDue] = useState(''); const [notes, setNotes] = useState('')
  const active = checkouts.find(c=>!c.checked_in_at)
  return (
    <div>
      {active ? (
        <div className={styles.checkoutActive}>
          <div className={styles.checkoutLabel}>CURRENTLY CHECKED OUT</div>
          <div className={styles.checkoutName}>{active.checked_out_by}</div>
          <div className={styles.checkoutMeta}>Since {new Date(active.checked_out_at).toLocaleDateString()}</div>
          {active.due_back_at && <div className={styles.checkoutMeta}>Due: {new Date(active.due_back_at).toLocaleDateString()}</div>}
          {canEdit && <div style={{marginTop:10}}><Btn primary onClick={()=>onCheckin(active.id)}>Check In</Btn></div>}
        </div>
      ) : canEdit ? (
        <div style={{marginBottom:20}}>
          <div className={styles.sectionLabel}>CHECK OUT</div>
          <Field label="Checked out by"><Input value={by} onChange={setBy} placeholder="Name..." /></Field>
          <Field label="Due back"><Input type="date" value={due} onChange={setDue} /></Field>
          <Field label="Notes"><Textarea value={notes} onChange={setNotes} /></Field>
          <Btn primary onClick={()=>{if(by){onCheckout(by,due,notes);setBy('');setDue('');setNotes('')}}}>Check Out</Btn>
        </div>
      ) : <div className={styles.emptyLog}>Asset is available.</div>}
      {checkouts.filter(c=>c.checked_in_at).length>0 && (
        <div>
          <div className={styles.sectionLabel}>HISTORY</div>
          {checkouts.filter(c=>c.checked_in_at).map(c=>(
            <div key={c.id} className={styles.logItem}>
              <div className={styles.logTitle}>{c.checked_out_by}</div>
              <div className={styles.logMeta}>{new Date(c.checked_out_at).toLocaleDateString()} → {c.checked_in_at?new Date(c.checked_in_at).toLocaleDateString():'pending'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---- MAINTENANCE TAB ----
function MaintenanceTab({ logs, onAdd, canEdit }: { logs:MaintenanceLog[]; onAdd:(type:string,desc:string,by:string,date:string,cost:string,next:string,notes:string)=>void; canEdit:boolean }) {
  const [show, setShow] = useState(false)
  const [type, setType] = useState('service'); const [desc, setDesc] = useState(''); const [by, setBy] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]); const [cost, setCost] = useState(''); const [next, setNext] = useState(''); const [notes, setNotes] = useState('')
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div className={styles.sectionLabel}>MAINTENANCE LOG</div>
        {canEdit && <Btn onClick={()=>setShow(s=>!s)}>+ Log entry</Btn>}
      </div>
      {show && canEdit && (
        <div style={{background:'var(--color-bg-3)',border:'1px solid var(--color-border-2)',borderRadius:'var(--radius-md)',padding:14,marginBottom:16}}>
          <div className={styles.fieldGrid}>
            <Field label="Type"><Sel value={type} onChange={setType}><option value="service">Service</option><option value="repair">Repair</option><option value="calibration">Calibration</option><option value="cleaning">Cleaning</option><option value="firmware">Firmware update</option><option value="other">Other</option></Sel></Field>
            <Field label="Date"><Input type="date" value={date} onChange={setDate} /></Field>
          </div>
          <Field label="Description"><Input value={desc} onChange={setDesc} placeholder="What was done..." /></Field>
          <div className={styles.fieldGrid}>
            <Field label="Performed by"><Input value={by} onChange={setBy} /></Field>
            <Field label="Cost ($)"><Input value={cost} onChange={setCost} placeholder="0.00" /></Field>
          </div>
          <Field label="Next service due"><Input type="date" value={next} onChange={setNext} /></Field>
          <Field label="Notes"><Textarea value={notes} onChange={setNotes} /></Field>
          <div style={{display:'flex',gap:8}}>
            <Btn primary onClick={()=>{if(desc){onAdd(type,desc,by,date,cost,next,notes);setShow(false);setDesc('');setBy('');setCost('');setNext('');setNotes('')}}}>Save</Btn>
            <Btn onClick={()=>setShow(false)}>Cancel</Btn>
          </div>
        </div>
      )}
      {logs.length===0 ? <div className={styles.emptyLog}>No records yet.</div>
        : logs.map(log=>(
          <div key={log.id} className={styles.logItem}>
            <div className={styles.logTitle}>{log.description}</div>
            <div className={styles.logMeta}>{log.type} · {new Date(log.performed_at).toLocaleDateString()} {log.performed_by&&`· ${log.performed_by}`} {log.cost&&`· $${log.cost}`}</div>
            {log.next_due_at && <div className={styles.logNext}>Next: {new Date(log.next_due_at).toLocaleDateString()}</div>}
          </div>
        ))
      }
    </div>
  )
}

// ---- HISTORY TAB ----
function HistoryTab({ asset, checkouts, maintenance }: { asset:Asset; checkouts:Checkout[]; maintenance:MaintenanceLog[] }) {
  const events = [
    ...checkouts.map(c=>({date:c.checked_out_at,label:`Checked out by ${c.checked_out_by}`,sub:c.checked_in_at?`Returned ${new Date(c.checked_in_at).toLocaleDateString()}`:'Not yet returned'})),
    ...maintenance.map(m=>({date:m.performed_at,label:`${m.type}: ${m.description}`,sub:m.performed_by?`By ${m.performed_by}`:''})),
    {date:asset.updated_at,label:'Last updated',sub:''},
  ].sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime())
  return (
    <div>
      <div className={styles.sectionLabel}>ACTIVITY</div>
      {events.map((e,i)=>(
        <div key={i} className={styles.historyItem}>
          <div className={styles.historyLine} />
          <div>
            <div className={styles.historyTitle}>{e.label}</div>
            {e.sub && <div className={styles.historySub}>{e.sub}</div>}
            <div className={styles.historyTime}>{new Date(e.date).toLocaleString()}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---- ADD / DUPLICATE MODAL ----
function AddModal({ onClose, onAdd, prefill }: { onClose:()=>void; onAdd:(data:Record<string,unknown>)=>void; prefill?: Asset }) {
  const allCats = Object.values(CAT_GROUPS).flat()
  const [cat, setCat] = useState(prefill?.category||'GUITARS')
  const [make, setMake] = useState(prefill?.make||'')
  const [model, setModel] = useState(prefill?.model||'')
  const [desc, setDesc] = useState(prefill?.description||'')
  const [serial, setSerial] = useState('TBD')
  const [status, setStatus] = useState(prefill?.status||'active')
  const [condition, setCondition] = useState(prefill?.condition||'good')
  const [location, setLocation] = useState(prefill?.location||'')
  const [notes, setNotes] = useState(prefill?.notes||'')
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalBox}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>{prefill?'DUPLICATE ASSET':'NEW ASSET'}</span>
          <button className={styles.drawerClose} onClick={onClose}>&#x2715;</button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.fieldGrid}>
            <Field label="Category"><Sel value={cat} onChange={setCat}>{allCats.map(c=><option key={c} value={c}>{CAT_LABELS[c]||c}</option>)}</Sel></Field>
            <Field label="Status">
              <select value={status} onChange={e=>setStatus(e.target.value)} disabled={!canEdit} className={styles.fieldSelect}>
                {STATUS_OPTS.map(group=>(
                  <optgroup key={group.group} label={group.group}>
                    {group.values.map(v=><option key={v} value={v}>{BADGE_LABELS[v]||v}</option>)}
                  </optgroup>
                ))}
              </select>
            </Field>
            <Field label="Make / Brand"><Input value={make} onChange={setMake} placeholder="e.g. Sony" /></Field>
            <Field label="Model"><Input value={model} onChange={setModel} placeholder="e.g. FX3" /></Field>
            <Field label="Serial"><Input value={serial} onChange={setSerial} /></Field>
            <Field label="Condition"><Sel value={condition} onChange={setCondition}>{CONDITION_OPTS.map(c=><option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}</Sel></Field>
            <Field label="Location"><Input value={location} onChange={setLocation} placeholder="Studio A..." /></Field>
          </div>
          <Field label="Description"><Textarea value={desc} onChange={setDesc} placeholder="Full spec..." /></Field>
          <Field label="Notes"><Textarea value={notes} onChange={setNotes} /></Field>
        </div>
        <div className={styles.modalFooter}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn primary onClick={()=>{ if(!make||!model) return; onAdd({ asset_id:`${cat.slice(0,3)}${Date.now()}`, category:cat, category_label:CAT_LABELS[cat]||cat, make, model, description:desc, serial, status, condition, location, notes, assigned_to:'' }) }}>{prefill?'Duplicate':'Add Asset'}</Btn>
        </div>
      </div>
    </div>
  )
}

// ---- BULK SERIAL MODAL ----
function BulkSerialModal({ assets, onClose, onSave }: { assets:Asset[]; onClose:()=>void; onSave:(id:string,serial:string)=>Promise<void> }) {
  const [serials, setSerials] = useState<Record<string,string>>({})
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<string|null>(null)

  const save = async (asset: Asset) => {
    const val = serials[asset.id]?.trim()
    if (!val || val === 'TBD') return
    setSaving(asset.id)
    await onSave(asset.id, val)
    setSaved(prev => new Set([...prev, asset.id]))
    setSaving(null)
  }

  const remaining = assets.filter(a => !saved.has(a.id))

  return (
    <div className={styles.modalOverlay}>
      <div className={`${styles.modalBox} ${styles.modalBoxWide}`}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>BULK SERIAL ENTRY <span style={{color:'var(--color-warning)',marginLeft:8}}>{remaining.length} remaining</span></span>
          <button className={styles.drawerClose} onClick={onClose}>&#x2715;</button>
        </div>
        <div className={styles.modalBody}>
          {remaining.length === 0
            ? <div className={styles.emptyLog}>All serials filled in!</div>
            : remaining.map(asset=>(
              <div key={asset.id} style={{display:'grid',gridTemplateColumns:'120px 1fr 1fr 1fr auto',gap:10,alignItems:'center',borderBottom:'1px solid var(--color-border)',paddingBottom:10,marginBottom:10}}>
                <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--color-text-muted)'}}>{asset.asset_id}</span>
                <span style={{fontSize:12,fontWeight:500,color:'var(--color-text-primary)'}}>{asset.make}</span>
                <span style={{fontSize:12,color:'var(--color-text-secondary)'}}>{asset.model}</span>
                <input
                  value={serials[asset.id]||''}
                  onChange={e=>setSerials(prev=>({...prev,[asset.id]:e.target.value}))}
                  onKeyDown={e=>e.key==='Enter'&&save(asset)}
                  placeholder="Enter serial..."
                  className={styles.fieldInput}
                  style={{fontSize:12}}
                  autoFocus={remaining[0]?.id===asset.id}
                />
                <Btn primary onClick={()=>save(asset)} disabled={saving===asset.id||!serials[asset.id]?.trim()}>
                  {saving===asset.id?'...':'Save'}
                </Btn>
              </div>
            ))
          }
        </div>
        <div className={styles.modalFooter}>
          <Btn onClick={onClose}>Done</Btn>
        </div>
      </div>
    </div>
  )
}

// ---- CSV IMPORT MODAL ----
function CSVImportModal({ orgId, onClose, onImported }: { orgId:string; onClose:()=>void; onImported:()=>void }) {
  const [step, setStep] = useState<'upload'|'map'|'preview'|'done'>('upload')
  const [rows, setRows] = useState<string[][]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<string,string>>({})
  const [importing, setImporting] = useState(false)
  const [importCount, setImportCount] = useState(0)
  const dropRef = useRef<HTMLDivElement>(null)

  const FIELDS = [
    {key:'make',label:'Make / Brand',required:true},
    {key:'model',label:'Model / Name',required:true},
    {key:'category',label:'Category key'},
    {key:'category_label',label:'Category label'},
    {key:'description',label:'Description'},
    {key:'serial',label:'Serial'},
    {key:'status',label:'Status'},
    {key:'condition',label:'Condition'},
    {key:'location',label:'Location'},
    {key:'assigned_to',label:'Assigned To'},
    {key:'notes',label:'Notes'},
    {key:'purchase_price',label:'Purchase Price'},
    {key:'purchase_date',label:'Purchase Date'},
  ]

  const parseCSV = (text: string) => {
    const lines = text.trim().split('\n').filter(l=>l.trim())
    const parseRow = (line: string) => {
      const result: string[] = []; let cur = ''; let inQ = false
      for (const ch of line) {
        if (ch==='"') { inQ=!inQ }
        else if (ch===',' && !inQ) { result.push(cur.trim()); cur='' }
        else { cur+=ch }
      }
      result.push(cur.trim()); return result
    }
    const hdrs = parseRow(lines[0]).map(h=>h.replace(/"/g,''))
    const data = lines.slice(1).map(parseRow)
    setHeaders(hdrs); setRows(data)
    // Auto-map obvious columns
    const autoMap: Record<string,string> = {}
    FIELDS.forEach(f=>{
      const match = hdrs.find(h=>h.toLowerCase().includes(f.key)||h.toLowerCase().includes(f.label.toLowerCase().split('/')[0].trim()))
      if (match) autoMap[f.key] = match
    })
    setMapping(autoMap); setStep('map')
  }

  const handleFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = e => parseCSV(e.target?.result as string)
    reader.readAsText(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const doImport = async () => {
    setImporting(true)
    const assets = rows.map((row, i) => {
      const obj: Record<string,string> = {}
      headers.forEach((h,hi) => obj[h] = row[hi]||'')
      const get = (key: string) => (mapping[key] ? obj[mapping[key]] : '') || ''
      const cat = get('category') || 'UNCATEGORIZED'
      return {
        org_id: orgId,
        asset_id: `IMP${String(i+1).padStart(4,'0')}_${Date.now()}`,
        category: cat,
        category_label: get('category_label') || CAT_LABELS[cat] || cat,
        make: get('make') || '—',
        model: get('model') || '—',
        description: get('description') || '',
        serial: get('serial') || 'TBD',
        status: get('status') || 'active',
        condition: get('condition') || 'good',
        location: get('location') || '',
        assigned_to: get('assigned_to') || '',
        notes: get('notes') || '',
        purchase_price: get('purchase_price') ? parseFloat(get('purchase_price').replace(/[$,]/g,'')) : null,
        purchase_date: get('purchase_date') || null,
      }
    }).filter(a => a.make !== '—' || a.model !== '—')

    // Insert in batches of 50
    let count = 0
    for (let i = 0; i < assets.length; i += 50) {
      const batch = assets.slice(i, i+50)
      const {data:{session}} = await supabase.auth.getSession()
      await fetch('/api/assets', { method:'POST', headers:{Authorization:`Bearer ${session?.access_token}`,'Content-Type':'application/json'}, body:JSON.stringify({ batch }) })
      count += batch.length
    }
    setImportCount(count); setImporting(false); setStep('done'); onImported()
  }

  return (
    <div className={styles.modalOverlay}>
      <div className={`${styles.modalBox} ${styles.modalBoxWide}`}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>IMPORT CSV</span>
          <button className={styles.drawerClose} onClick={onClose}>&#x2715;</button>
        </div>
        <div className={styles.modalBody}>

          {step==='upload' && (
            <div>
              <p style={{color:'var(--color-text-secondary)',fontSize:13,marginBottom:20}}>
                Upload any CSV with asset data. You&apos;ll map the columns in the next step.
              </p>
              <div ref={dropRef} onDragOver={e=>e.preventDefault()} onDrop={handleDrop}
                style={{border:'2px dashed var(--color-border-3)',borderRadius:'var(--radius-md)',padding:40,textAlign:'center',cursor:'pointer'}}
                onClick={()=>document.getElementById('csvFileInput')?.click()}>
                <div style={{fontSize:32,marginBottom:12}}>📂</div>
                <div style={{color:'var(--color-text-primary)',fontSize:14,fontWeight:500,marginBottom:6}}>Drop CSV file here</div>
                <div style={{color:'var(--color-text-muted)',fontSize:12}}>or click to browse</div>
                <input id="csvFileInput" type="file" accept=".csv,.txt" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f)}} />
              </div>
              <div style={{marginTop:16,padding:14,background:'var(--color-bg-3)',borderRadius:'var(--radius-md)'}}>
                <div className={styles.fieldLabel} style={{marginBottom:8}}>EXPECTED COLUMNS (any order, any name)</div>
                <div style={{fontSize:12,color:'var(--color-text-tertiary)',lineHeight:1.8}}>
                  Make, Model, Category, Description, Serial, Status, Condition, Location, Assigned To, Notes, Purchase Price, Purchase Date
                </div>
              </div>
            </div>
          )}

          {step==='map' && (
            <div>
              <p style={{color:'var(--color-text-secondary)',fontSize:13,marginBottom:16}}>
                Match your CSV columns to the right fields. {rows.length} rows detected.
              </p>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                {FIELDS.map(f=>(
                  <Field key={f.key} label={f.label + (f.required?' *':'')}>
                    <select value={mapping[f.key]||''} onChange={e=>setMapping(prev=>({...prev,[f.key]:e.target.value}))} className={styles.fieldSelect}>
                      <option value=''>— skip —</option>
                      {headers.map(h=><option key={h} value={h}>{h}</option>)}
                    </select>
                  </Field>
                ))}
              </div>
              <div style={{marginTop:16,background:'var(--color-bg-3)',borderRadius:'var(--radius-md)',padding:12,overflow:'auto',maxHeight:200}}>
                <div className={styles.fieldLabel} style={{marginBottom:8}}>PREVIEW (first 3 rows)</div>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                  <thead><tr>{headers.map(h=><th key={h} style={{textAlign:'left',padding:'4px 8px',color:'var(--color-text-muted)',fontFamily:'var(--font-mono)',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
                  <tbody>{rows.slice(0,3).map((row,i)=>(
                    <tr key={i}>{row.map((cell,ci)=><td key={ci} style={{padding:'4px 8px',color:'var(--color-text-secondary)',borderTop:'1px solid var(--color-border)',whiteSpace:'nowrap',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis'}}>{cell}</td>)}</tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          {step==='done' && (
            <div style={{textAlign:'center',padding:40}}>
              <div style={{fontSize:48,marginBottom:16}}>✓</div>
              <div style={{fontSize:18,fontWeight:500,color:'var(--color-text-primary)',marginBottom:8}}>{importCount} assets imported</div>
              <div style={{fontSize:13,color:'var(--color-text-tertiary)'}}>They are now visible in your asset list.</div>
            </div>
          )}
        </div>
        <div className={styles.modalFooter}>
          {step==='upload' && <Btn onClick={onClose}>Cancel</Btn>}
          {step==='map' && (
            <>
              <Btn onClick={()=>setStep('upload')}>Back</Btn>
              <Btn primary onClick={doImport} disabled={importing||!mapping.make||!mapping.model}>
                {importing?`Importing ${rows.length} rows...`:`Import ${rows.length} assets`}
              </Btn>
            </>
          )}
          {step==='done' && <Btn primary onClick={onClose}>Done</Btn>}
        </div>
      </div>
    </div>
  )
}

// ---- USER MANAGEMENT MODAL ----
function UserManagementModal({ onClose }: { onClose:()=>void }) {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [orgs, setOrgs] = useState<{id:string;name:string}[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin'|'viewer'>('viewer')
  const [inviteOrg, setInviteOrg] = useState('')
  const [toast, setToast] = useState('')

  useEffect(()=>{
    Promise.all([
      supabase.auth.getSession().then(({data:{session}})=>fetch('/api/users',{headers:{Authorization:`Bearer ${session?.access_token}`}}).then(r=>r.json())),
      supabase.from('organizations').select('id,name').then(({data})=>data||[])
    ]).then(([u,o])=>{ setUsers(Array.isArray(u)?u:[]); setOrgs(o); setLoading(false) })
  },[])

  const updateUser = async (id:string,role:string,org_id:string) => {
    const {data:{session}} = await supabase.auth.getSession()
    await fetch('/api/users',{method:'PATCH',headers:{Authorization:`Bearer ${session?.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({id,role,org_id:org_id||null})})
    setUsers(prev=>prev.map(u=>u.id===id?{...u,role:role as UserRole,org_id:org_id||null}:u))
    setToast('Updated'); setTimeout(()=>setToast(''),2000)
  }

  return (
    <div className={styles.modalOverlay}>
      <div className={`${styles.modalBox} ${styles.modalBoxWide}`}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>USER MANAGEMENT</span>
          <button className={styles.drawerClose} onClick={onClose}>&#x2715;</button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.inviteBox}>
            <div className={styles.sectionLabel}>INVITE USER</div>
            <div className={styles.inviteGrid}>
              <Field label="Email"><Input value={inviteEmail} onChange={setInviteEmail} placeholder="user@email.com" /></Field>
              <Field label="Role"><Sel value={inviteRole} onChange={v=>setInviteRole(v as 'admin'|'viewer')}><option value="viewer">Viewer</option><option value="admin">Admin</option></Sel></Field>
              <Field label="Organization"><Sel value={inviteOrg} onChange={setInviteOrg}><option value="">None</option>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</Sel></Field>
              <div style={{paddingBottom:2}}><Btn primary onClick={async()=>{ if(!inviteEmail) return; const {error} = await supabase.auth.admin.inviteUserByEmail(inviteEmail); setToast(error?`Error: ${error.message}`:`Invite sent to ${inviteEmail}`); setInviteEmail(''); setTimeout(()=>setToast(''),3000) }}>Send Invite</Btn></div>
            </div>
          </div>
          <div className={styles.sectionLabel}>USERS</div>
          {loading ? <div className={styles.emptyLog}>Loading...</div> : (
            <table className={styles.userTable}>
              <thead><tr><th className={styles.userTableTh}>Name / Email</th><th className={styles.userTableTh}>Role</th><th className={styles.userTableTh}>Organization</th><th className={styles.userTableTh}></th></tr></thead>
              <tbody>{users.map(u=><UserRow key={u.id} user={u} orgs={orgs} onUpdate={updateUser} />)}</tbody>
            </table>
          )}
        </div>
        {toast && <div style={{margin:'0 20px 16px',padding:'8px 14px',background:'var(--color-success-bg)',border:'1px solid var(--color-success-bdr)',borderRadius:'var(--radius-md)',fontSize:12,color:'var(--color-success)',fontFamily:'var(--font-mono)'}}>{toast}</div>}
      </div>
    </div>
  )
}

function UserRow({ user, orgs, onUpdate }: { user:UserProfile; orgs:{id:string;name:string}[]; onUpdate:(id:string,role:string,org:string)=>void }) {
  const [role, setRole] = useState(user.role)
  const [org, setOrg] = useState(user.org_id||'')
  const [dirty, setDirty] = useState(false)
  return (
    <tr style={{borderBottom:'1px solid var(--color-border)'}}>
      <td className={styles.userTableTd}><div className={styles.userFullName}>{user.full_name||'—'}</div><div className={styles.userEmail}>{user.email}</div></td>
      <td className={styles.userTableTd}><select value={role} onChange={e=>{setRole(e.target.value as UserRole);setDirty(true)}} className={styles.userSelect}><option value="super_admin">Super Admin</option><option value="admin">Admin</option><option value="viewer">Viewer</option></select></td>
      <td className={styles.userTableTd}><select value={org} onChange={e=>{setOrg(e.target.value);setDirty(true)}} className={styles.userSelect}><option value="">None</option>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></td>
      <td className={styles.userTableTd}>{dirty && <Btn primary onClick={()=>{onUpdate(user.id,role,org);setDirty(false)}}>Save</Btn>}</td>
    </tr>
  )
}

// ---- SCHOOL MODAL ----
type _Org = { id: string; name: string; theme: Record<string,string>; logo_url?: string | null }

function SchoolModal({ onClose }: { onClose:()=>void }) {
  const [orgs, setOrgs] = useState<_Org[]>([])
  const [editing, setEditing] = useState<_Org|null>(null)
  const [name, setName] = useState('')
  const [accent, setAccent] = useState('#ededed')
  const [accentFg, setAccentFg] = useState('#000000')
  const [bgSidebar, setBgSidebar] = useState('#111111')
  const [textPrimary, setTextPrimary] = useState('#f0f0f0')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  const load = () => supabase.auth.getSession().then(({data:{session}})=>fetch('/api/orgs',{headers:{Authorization:`Bearer ${session?.access_token}`}}).then(r=>r.json()).then(setOrgs))
  useEffect(()=>{load()},[])

  const startEdit = (org: _Org) => {
    setEditing(org); setName(org.name)
    setAccent(org.theme?.accent||'#ededed')
    setAccentFg(org.theme?.accentFg||'#000000')
    setBgSidebar(org.theme?.bgSidebar||'#111111')
    setTextPrimary(org.theme?.textPrimary||'#f0f0f0')
  }

  const save = async () => {
    setSaving(true)
    const theme = {accent,accentFg,bgSidebar,textPrimary}
    const body = editing?.id ? {id:editing.id,name,theme} : {name,theme}
    const method = editing?.id ? 'PATCH' : 'POST'
    const {data:{session}} = await supabase.auth.getSession()
    await fetch('/api/orgs',{method,headers:{Authorization:`Bearer ${session?.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(body)})
    await load(); setSaving(false); setEditing(null); setName('')
    setToast(editing?.id?'School updated':'School created'); setTimeout(()=>setToast(''),2500)
  }

  return (
    <div className={styles.modalOverlay}>
      <div className={`${styles.modalBox} ${styles.modalBoxWide}`}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>SCHOOL ONBOARDING</span>
          <button className={styles.drawerClose} onClick={onClose}>&#x2715;</button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.inviteBox}>
            <div className={styles.sectionLabel}>{editing?.id?'EDIT SCHOOL':'NEW SCHOOL'}</div>
            <Field label="School name"><input className={styles.fieldInput} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Lincoln High School" /></Field>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:10,marginBottom:14}}>
              {([['Accent color',accent,setAccent],['Accent text',accentFg,setAccentFg],['Sidebar bg',bgSidebar,setBgSidebar],['Primary text',textPrimary,setTextPrimary]] as [string,string,(v:string)=>void][]).map(([label,val,setter])=>(
                <div key={label}>
                  <label className={styles.fieldLabel}>{label}</label>
                  <div style={{display:'flex',gap:6,alignItems:'center'}}>
                    <input type="color" value={val} onChange={e=>setter(e.target.value)} style={{width:36,height:32,border:'1px solid var(--color-border-2)',borderRadius:'var(--radius-sm)',background:'none',cursor:'pointer',padding:2}} />
                    <input className={styles.fieldInput} value={val} onChange={e=>setter(e.target.value)} style={{fontFamily:'var(--font-mono)',fontSize:11}} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:8}}>
              <Btn onClick={()=>applyTheme({accent,accentFg,bgSidebar,textPrimary})}>Preview</Btn>
              <Btn primary onClick={save} disabled={!name||saving}>{saving?'Saving...':editing?.id?'Update':'Create School'}</Btn>
              {editing?.id && <Btn onClick={()=>{setEditing(null);setName('')}}>Cancel</Btn>}
            </div>
          </div>
          <div className={styles.sectionLabel}>SCHOOLS</div>
          {orgs.length===0 ? <div className={styles.emptyLog}>No schools yet.</div>
            : orgs.map(org=>(
              <div key={org.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid var(--color-border)'}}>
                <div>
                  <div style={{color:'var(--color-text-primary)',fontSize:13,fontWeight:500}}>{org.name}</div>
                  {org.theme?.accent && (
                    <div style={{display:'flex',alignItems:'center',gap:6,marginTop:4}}>
                      <div style={{width:12,height:12,borderRadius:2,background:org.theme.accent,border:'1px solid var(--color-border-2)'}} />
                      <span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--color-text-muted)'}}>{org.theme.accent}</span>
                    </div>
                  )}
                </div>
                <Btn onClick={()=>startEdit(org)}>Edit</Btn>
              </div>
            ))
          }
        </div>
        {toast && <div style={{margin:'0 20px 16px',padding:'8px 14px',background:'var(--color-success-bg)',border:'1px solid var(--color-success-bdr)',borderRadius:'var(--radius-md)',fontSize:12,color:'var(--color-success)',fontFamily:'var(--font-mono)'}}>{toast}</div>}
      </div>
    </div>
  )
}
