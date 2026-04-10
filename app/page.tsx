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
  active: styles.badgeActive, licensed: styles.badgeLicensed,
  concept: styles.badgeConcept, in_development: styles.badgeTeal,
  checked_out: styles.badgeWarning,
  legacy: styles.badgeMuted, parked: styles.badgeDim, active_dns_only: styles.badgeDim,
}
const BADGE_LABELS: Record<string, string> = {
  active:'Active', licensed:'Licensed', concept:'Concept', in_development:'In dev',
  checked_out:'Checked out', legacy:'Legacy', parked:'Parked', active_dns_only:'DNS only',
}
const ROLE_CLASS: Record<UserRole, string> = {
  super_admin: styles.roleBadgeSuperAdmin,
  admin: styles.roleBadgeAdmin,
  viewer: styles.roleBadgeViewer,
}
const ROLE_LABEL: Record<UserRole, string> = {
  super_admin: 'Super Admin', admin: 'Admin', viewer: 'Viewer',
}
const CONDITION_OPTS = ['excellent','good','fair','poor','damaged']

function Badge({ status }: { status?: string }) {
  const s = status || 'active'
  const cls = BADGE_MAP[s] || styles.badgeDim
  return <span className={`${styles.badge} ${cls}`}>{BADGE_LABELS[s] || s}</span>
}

function RoleBadge({ role }: { role?: UserRole }) {
  if (!role) return null
  return <span className={ROLE_CLASS[role]}>{ROLE_LABEL[role]}</span>
}

function canEdit(role?: UserRole) { return role === 'super_admin' || role === 'admin' }
function canDelete(role?: UserRole) { return role === 'super_admin' }
function canManageUsers(role?: UserRole) { return role === 'super_admin' }

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
  const [showSchool, setShowSchool] = useState(false)
  const [activeOrg, setActiveOrg] = useState<{id:string;name:string;theme:Record<string,string>}|null>(null)
  const [allOrgs, setAllOrgs] = useState<{id:string;name:string;theme:Record<string,string>}[]>([])
  const [catSearch, setCatSearch] = useState('')
  const [checkouts, setCheckouts] = useState<Checkout[]>([])
  const [maintenance, setMaintenance] = useState<MaintenanceLog[]>([])
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const PER_PAGE = 75
  const fileInputRef = useRef<HTMLInputElement>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }
      const { data: p } = await supabase.from('user_profiles').select('*').eq('id', session.user.id).single()
      if (!p) { await supabase.auth.signOut(); window.location.href = '/login?error=not_invited'; return }
      setProfile(p)
      // Apply org theme if user belongs to an org
      if (p.org_id) {
        const { data: org } = await supabase.from('organizations').select('theme').eq('id', p.org_id).single()
        if (org?.theme) applyTheme(org.theme as OrgTheme)
      }
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { resetTheme(); window.location.href = '/login' }
    })
    return () => subscription.unsubscribe()
  }, [])

  const fetchAssets = useCallback(async (orgId?: string) => {
    setLoading(true)
    const url = orgId ? `/api/assets?org_id=${orgId}` : '/api/assets'
    const res = await fetch(url)
    const data = await res.json()
    setAssets(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { if (!authLoading) fetchAssets(activeOrg?.id) }, [authLoading, fetchAssets, activeOrg])

  // Load orgs for switcher once profile is known
  useEffect(() => {
    if (profile?.role === 'super_admin') {
      fetch('/api/orgs').then(r=>r.json()).then(orgs => {
        setAllOrgs(Array.isArray(orgs) ? orgs : [])
      })
    }
  }, [profile])

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
    if (!selectedAsset || !canEdit(profile?.role)) return
    setSaving(true)
    const res = await fetch(`/api/assets/${selectedAsset.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(patch) })
    const updated = await res.json()
    setAssets(prev => prev.map(a => a.id === updated.id ? updated : a))
    setSelectedAsset(updated); setSaving(false); showToast('Saved')
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedAsset || !canEdit(profile?.role)) return
    const ext = file.name.split('.').pop()
    const path = `${selectedAsset.id}.${ext}`
    const { error } = await supabase.storage.from('asset-photos').upload(path, file, { upsert: true })
    if (error) { showToast('Photo upload failed'); return }
    const { data } = supabase.storage.from('asset-photos').getPublicUrl(path)
    await saveAsset({ photo_url: data.publicUrl + '?t=' + Date.now() })
    showToast('Photo uploaded')
  }

  const checkoutAsset = async (by: string, due: string, notes: string) => {
    if (!selectedAsset || !canEdit(profile?.role)) return
    await fetch('/api/checkouts', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ asset_id:selectedAsset.id, checked_out_by:by, due_back_at:due||null, notes }) })
    await saveAsset({ status: 'checked_out' })
    const co = await fetch(`/api/checkouts?asset_id=${selectedAsset.id}`).then(r => r.json())
    setCheckouts(Array.isArray(co) ? co : []); showToast('Checked out')
  }

  const checkinAsset = async (checkoutId: string) => {
    if (!canEdit(profile?.role)) return
    await fetch('/api/checkouts', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id:checkoutId, checked_in_at:new Date().toISOString() }) })
    await saveAsset({ status: 'active' })
    const co = await fetch(`/api/checkouts?asset_id=${selectedAsset?.id}`).then(r => r.json())
    setCheckouts(Array.isArray(co) ? co : []); showToast('Checked in')
  }

  const addMaintenance = async (type: string, desc: string, by: string, date: string, cost: string, next: string, notes: string) => {
    if (!selectedAsset || !canEdit(profile?.role)) return
    await fetch('/api/maintenance', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ asset_id:selectedAsset.id, type, description:desc, performed_by:by, performed_at:date, cost:cost?parseFloat(cost):null, next_due_at:next||null, notes }) })
    const ml = await fetch(`/api/maintenance?asset_id=${selectedAsset.id}`).then(r => r.json())
    setMaintenance(Array.isArray(ml) ? ml : []); showToast('Maintenance logged')
  }

  const deleteAsset = async () => {
    if (!selectedAsset || !canDelete(profile?.role)) return
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
    return <div className={styles.emptyState} style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>Loading...</div>
  }

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
              <div className={styles.sidebarUserName}>{profile.full_name || profile.email}</div>
              <RoleBadge role={profile.role} />
            </div>
            <button className={styles.signOutBtn} onClick={() => supabase.auth.signOut()} title="Sign out">⎋</button>
          </div>
        )}

        {/* ORG SWITCHER -- super_admin only */}
        {profile?.role === 'super_admin' && (
          <div style={{ padding:'8px 10px', borderBottom:'1px solid var(--color-border)' }}>
            <select
              value={activeOrg?.id || ''}
              onChange={e => {
                const org = allOrgs.find(o => o.id === e.target.value) || null
                setActiveOrg(org)
                if (org?.theme) applyTheme(org.theme)
                else resetTheme()
              }}
              style={{ width:'100%', background:'var(--color-bg-3)', border:'1px solid var(--color-border-2)', borderRadius:'var(--radius-sm)', padding:'5px 8px', fontSize:11, color:'var(--color-text-primary)', outline:'none', fontFamily:'var(--font-sans)' }}
            >
              <option value=''>All orgs (Vidor Media)</option>
              {allOrgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
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
            const visible = cats.filter(c => !catSearch || (CAT_LABELS[c]||c).toLowerCase().includes(catSearch.toLowerCase()))
            if (!visible.length) return null
            return (
              <div key={group} className={styles.catSection}>
                <div className={styles.catGroupLabel}>{group}</div>
                {visible.map(cat => (
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
          <div className={styles.sidebarAdminWrap}>
            <button className={styles.sidebarAdminBtn} onClick={()=>setShowAdmin(true)} style={{marginBottom:6}}>User Management</button>
            <button className={styles.sidebarAdminBtn} onClick={()=>setShowSchool(true)}>Onboard School</button>
          </div>
        )}
      </nav>

      {/* MAIN */}
      <div className={styles.main}>
        <div className={styles.topbar}>
          <span className={styles.topbarTitle}>{activeCat==='ALL' ? 'All Assets' : (CAT_LABELS[activeCat]||activeCat)}</span>
          <div className={styles.topbarDivider} />
          <input className={styles.searchInput} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search make, model, serial, description, ID..." />
          <select className={styles.statusSelect} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
            <option value=''>All statuses</option>
            <option value='active'>Active</option>
            <option value='serial-tbd'>Serial TBD</option>
            <option value='checked_out'>Checked out</option>
            <option value='legacy'>Legacy</option>
            <option value='licensed'>Licensed</option>
            <option value='parked'>Parked</option>
            <option value='concept'>Concept</option>
          </select>
          <div className={styles.topbarSpacer} />
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
                  {([['asset_id','ID'],['category_label','Category'],['make','Make'],['model','Model'],['description','Description',false],['serial','Serial'],['location','Location'],['status','Status']] as [keyof Asset, string, boolean?][]).map(([col, label, sortable=true]) => (
                    <th key={col} className={`${styles.tableTh} ${sortCol===col?styles.sorted:''}`}
                      onClick={sortable ? ()=>{ if(sortCol===col) setSortDir(d=>d*-1); else { setSortCol(col); setSortDir(1) } } : undefined}>
                      {label}{sortable && (sortCol===col ? (sortDir>0?' ↑':' ↓') : ' ↕')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageItems.map((asset, i) => {
                  const showCatRow = activeCat === 'ALL' && !search && asset.category !== (i > 0 ? pageItems[i-1].category : null)
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
          <button className={styles.pageBtn} onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1}>&#8592;</button>
          <span className={styles.sbItem}>{page} / {totalPages}</span>
          <button className={styles.pageBtn} onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page>=totalPages}>&#8594;</button>
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
                  {canDelete(profile.role) && (
                    <button className={styles.btnDanger} onClick={deleteAsset}>Delete</button>
                  )}
                </div>
              </div>
              <button className={styles.drawerClose} onClick={()=>setSelectedAsset(null)}>&#x2715;</button>
            </div>
            <div className={styles.drawerTabs}>
              {(['details','checkout','maintenance','history'] as const).map(tab => (
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
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handlePhotoUpload} />
        </>
      )}

      {showAdd && profile && canEdit(profile.role) && (
        <AddModal onClose={()=>setShowAdd(false)} onAdd={async(data)=>{
          await fetch('/api/assets',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) })
          await fetchAssets(); setShowAdd(false); showToast('Asset added')
        }} />
      )}

      {showAdmin && profile && canManageUsers(profile.role) && (
        <UserManagementModal onClose={()=>setShowAdmin(false)} />
      )}

      {showSchool && profile && canManageUsers(profile.role) && (
        <SchoolModal onClose={()=>setShowSchool(false)} />
      )}
      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.fieldWrap}>
      <label className={styles.fieldLabel}>{label}</label>
      {children}
    </div>
  )
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
      <div className={styles.photoArea} onClick={canEdit ? onPhotoClick : undefined} style={{ cursor: canEdit?'pointer':'default' }}>
        {asset.photo_url
          ? <img src={asset.photo_url} alt="" style={{ width:'100%', height:180, objectFit:'cover' }} />
          : <span className={styles.photoHint}>{canEdit ? '+ ADD PHOTO' : 'No photo'}</span>}
      </div>
      <div className={styles.drawerDesc}>{asset.description}</div>
      <div className={styles.fieldGrid}>
        <Field label="Serial / License"><Input value={serial} onChange={canEdit?setSerial:undefined} disabled={!canEdit} /></Field>
        <Field label="Status"><Sel value={status} onChange={setStatus} disabled={!canEdit}><option value="active">Active</option><option value="legacy">Legacy</option><option value="licensed">Licensed</option><option value="parked">Parked</option><option value="concept">Concept</option><option value="in_development">In development</option></Sel></Field>
        <Field label="Condition"><Sel value={condition} onChange={setCondition} disabled={!canEdit}>{CONDITION_OPTS.map(c=><option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}</Sel></Field>
        <Field label="Location"><Input value={location} onChange={canEdit?setLocation:undefined} placeholder="Studio A..." disabled={!canEdit} /></Field>
        <Field label="Assigned To"><Input value={assigned} onChange={canEdit?setAssigned:undefined} placeholder="Name..." disabled={!canEdit} /></Field>
        <Field label="Purchase Date"><Input type="date" value={pdate} onChange={canEdit?setPdate:undefined} disabled={!canEdit} /></Field>
        <Field label="Purchase Price ($)"><Input value={price} onChange={canEdit?setPrice:undefined} placeholder="0.00" disabled={!canEdit} /></Field>
        <Field label="Current Value ($)"><Input value={value} onChange={canEdit?setValue:undefined} placeholder="0.00" disabled={!canEdit} /></Field>
      </div>
      <Field label="Notes"><Textarea value={notes} onChange={canEdit?setNotes:undefined} disabled={!canEdit} /></Field>
      {canEdit && <Btn primary onClick={()=>onSave({ serial, status, condition, location, assigned_to:assigned, notes, purchase_date:pdate||null, purchase_price:price?parseFloat(price):null, current_value:value?parseFloat(value):null })} disabled={saving}>{saving?'Saving...':'Save changes'}</Btn>}
    </div>
  )
}

function CheckoutTab({ checkouts, onCheckout, onCheckin, canEdit }: { checkouts:Checkout[]; onCheckout:(by:string,due:string,notes:string)=>void; onCheckin:(id:string)=>void; canEdit:boolean }) {
  const [by, setBy] = useState(''); const [due, setDue] = useState(''); const [notes, setNotes] = useState('')
  const active = checkouts.find(c => !c.checked_in_at)
  return (
    <div>
      {active ? (
        <div className={styles.checkoutActive}>
          <div className={styles.checkoutLabel}>CURRENTLY CHECKED OUT</div>
          <div className={styles.checkoutName}>{active.checked_out_by}</div>
          <div className={styles.checkoutMeta}>Since {new Date(active.checked_out_at).toLocaleDateString()}</div>
          {active.due_back_at && <div className={styles.checkoutMeta}>Due: {new Date(active.due_back_at).toLocaleDateString()}</div>}
          {canEdit && <div style={{ marginTop:10 }}><Btn primary onClick={()=>onCheckin(active.id)}>Check In</Btn></div>}
        </div>
      ) : canEdit ? (
        <div style={{ marginBottom:20 }}>
          <div className={styles.sectionLabel}>CHECK OUT</div>
          <Field label="Checked out by"><Input value={by} onChange={setBy} placeholder="Name..." /></Field>
          <Field label="Due back"><Input type="date" value={due} onChange={setDue} /></Field>
          <Field label="Notes"><Textarea value={notes} onChange={setNotes} /></Field>
          <Btn primary onClick={()=>{ if(by){onCheckout(by,due,notes);setBy('');setDue('');setNotes('')} }}>Check Out</Btn>
        </div>
      ) : <div className={styles.emptyLog}>Asset is available.</div>}
      {checkouts.filter(c=>c.checked_in_at).length > 0 && (
        <div>
          <div className={styles.sectionLabel}>HISTORY</div>
          {checkouts.filter(c=>c.checked_in_at).map(c=>(
            <div key={c.id} className={styles.logItem}>
              <div className={styles.logTitle}>{c.checked_out_by}</div>
              <div className={styles.logMeta}>{new Date(c.checked_out_at).toLocaleDateString()} → {c.checked_in_at ? new Date(c.checked_in_at).toLocaleDateString() : 'pending'}</div>
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
        <div className={styles.sectionLabel}>MAINTENANCE LOG</div>
        {canEdit && <Btn onClick={()=>setShow(s=>!s)}>+ Log entry</Btn>}
      </div>
      {show && canEdit && (
        <div style={{ background:'var(--color-bg-3)', border:'1px solid var(--color-border-2)', borderRadius:'var(--radius-md)', padding:14, marginBottom:16 }}>
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
          <div style={{ display:'flex', gap:8 }}>
            <Btn primary onClick={()=>{ if(desc){onAdd(type,desc,by,date,cost,next,notes);setShow(false);setDesc('');setBy('');setCost('');setNext('');setNotes('')} }}>Save</Btn>
            <Btn onClick={()=>setShow(false)}>Cancel</Btn>
          </div>
        </div>
      )}
      {logs.length === 0 ? <div className={styles.emptyLog}>No records yet.</div>
        : logs.map(log=>(
          <div key={log.id} className={styles.logItem}>
            <div className={styles.logTitle}>{log.description}</div>
            <div className={styles.logMeta}>{log.type} · {new Date(log.performed_at).toLocaleDateString()} {log.performed_by && `· ${log.performed_by}`} {log.cost && `· $${log.cost}`}</div>
            {log.next_due_at && <div className={styles.logNext}>Next: {new Date(log.next_due_at).toLocaleDateString()}</div>}
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

function AddModal({ onClose, onAdd }: { onClose:()=>void; onAdd:(data:Record<string,unknown>)=>void }) {
  const allCats = Object.values(CAT_GROUPS).flat()
  const [cat, setCat] = useState('GUITARS'); const [make, setMake] = useState(''); const [model, setModel] = useState('')
  const [desc, setDesc] = useState(''); const [serial, setSerial] = useState('TBD'); const [status, setStatus] = useState('active')
  const [condition, setCondition] = useState('good'); const [location, setLocation] = useState(''); const [notes, setNotes] = useState('')
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalBox}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>NEW ASSET</span>
          <button className={styles.drawerClose} onClick={onClose}>&#x2715;</button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.fieldGrid}>
            <Field label="Category"><Sel value={cat} onChange={setCat}>{allCats.map(c=><option key={c} value={c}>{CAT_LABELS[c]||c}</option>)}</Sel></Field>
            <Field label="Status"><Sel value={status} onChange={setStatus}><option value="active">Active</option><option value="legacy">Legacy</option><option value="licensed">Licensed</option><option value="parked">Parked</option><option value="concept">Concept</option></Sel></Field>
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
    setToast('Updated'); setTimeout(()=>setToast(''), 2000)
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
              <div style={{ paddingBottom:2 }}><Btn primary onClick={async()=>{ if(!inviteEmail) return; const {error} = await supabase.auth.admin.inviteUserByEmail(inviteEmail); setToast(error?`Error: ${error.message}`:`Invite sent to ${inviteEmail}`); setInviteEmail(''); setTimeout(()=>setToast(''),3000) }}>Send Invite</Btn></div>
            </div>
          </div>
          <div className={styles.sectionLabel}>USERS</div>
          {loading ? <div className={styles.emptyLog}>Loading...</div> : (
            <table className={styles.userTable}>
              <thead><tr><th className={styles.userTableTh}>Name / Email</th><th className={styles.userTableTh}>Role</th><th className={styles.userTableTh}>Organization</th><th className={styles.userTableTh}></th></tr></thead>
              <tbody>
                {users.map(u => <UserRow key={u.id} user={u} orgs={orgs} onUpdate={updateUser} />)}
              </tbody>
            </table>
          )}
        </div>
        <div style={{ marginTop:24 }}>
          <div className={styles.sectionLabel}>ORGANIZATIONS</div>
          <OrgManagement />
        </div>
        {toast && <div style={{ margin:'0 20px 16px', padding:'8px 14px', background:'var(--color-success-bg)', border:'1px solid var(--color-success-bdr)', borderRadius:'var(--radius-md)', fontSize:12, color:'var(--color-success)', fontFamily:'var(--font-mono)' }}>{toast}</div>}
      </div>
    </div>
  )
}

function UserRow({ user, orgs, onUpdate }: { user:UserProfile; orgs:{id:string;name:string}[]; onUpdate:(id:string,role:string,org:string)=>void }) {
  const [role, setRole] = useState(user.role)
  const [org, setOrg] = useState(user.org_id||'')
  const [dirty, setDirty] = useState(false)
  return (
    <tr style={{ borderBottom:'1px solid var(--color-border)' }}>
      <td className={styles.userTableTd}><div className={styles.userFullName}>{user.full_name||'—'}</div><div className={styles.userEmail}>{user.email}</div></td>
      <td className={styles.userTableTd}><select value={role} onChange={e=>{ setRole(e.target.value as UserRole); setDirty(true) }} className={styles.userSelect}><option value="super_admin">Super Admin</option><option value="admin">Admin</option><option value="viewer">Viewer</option></select></td>
      <td className={styles.userTableTd}><select value={org} onChange={e=>{ setOrg(e.target.value); setDirty(true) }} className={styles.userSelect}><option value="">None</option>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></td>
      <td className={styles.userTableTd}>{dirty && <Btn primary onClick={()=>{ onUpdate(user.id, role, org); setDirty(false) }}>Save</Btn>}</td>
    </tr>
  )
}

type Org = { id: string; name: string; theme: OrgTheme }

function OrgManagement() {
  const [orgs, setOrgs] = useState<Org[]>([])
  const [editing, setEditing] = useState<_Org | null>(null)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    fetch('/api/orgs').then(r => r.json()).then(d => setOrgs(Array.isArray(d) ? d : []))
  }, [])

  const save = async () => {
    if (!editing) return
    setSaving(true)
    const method = editing.id ? 'PATCH' : 'POST'
    const body = editing.id
      ? { id: editing.id, name: editing.name, theme: editing.theme }
      : { name: editing.name, theme: editing.theme }
    const res = await fetch('/api/orgs', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    if (editing.id) setOrgs(prev => prev.map(o => o.id === data.id ? data : o))
    else setOrgs(prev => [...prev, data])
    setEditing(null); setSaving(false)
    resetTheme()
  }

  const updateTheme = (key: keyof OrgTheme, val: string) => {
    if (!editing) return
    const updated = { ...editing, theme: { ...editing.theme, [key]: val } }
    setEditing(updated)
    if (preview) applyTheme(updated.theme)
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <span style={{ fontSize:11, color:'var(--color-text-tertiary)' }}>{orgs.length} organization{orgs.length!==1?'s':''}</span>
        <Btn onClick={() => setEditing({ id:'', name:'', theme:{} })}>+ New School</Btn>
      </div>

      {orgs.map((org) => (
        <div key={org.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--color-border)' }}>
          <div>
            <div style={{ color:'var(--color-text-primary)', fontSize:13 }}>{org.name}</div>
            {org.theme?.accent && (
              <div style={{ display:'flex', gap:6, marginTop:4, alignItems:'center' }}>
                <div style={{ width:12, height:12, borderRadius:2, background: org.theme.accent, border:'1px solid var(--color-border-3)' }} />
                <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--color-text-muted)' }}>{org.theme.accent}</span>
              </div>
            )}
          </div>
          <Btn onClick={() => { setEditing(org); setPreview(false) }}>Edit</Btn>
        </div>
      ))}

      {editing && (
        <div style={{ marginTop:16, background:'var(--color-bg-3)', border:'1px solid var(--color-border-2)', borderRadius:'var(--radius-md)', padding:16 }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--color-text-tertiary)', letterSpacing:'.06em', marginBottom:12 }}>
            {editing.id ? 'EDIT ORGANIZATION' : 'NEW ORGANIZATION'}
          </div>

          <Field label="School Name">
            <input className={styles.fieldInput} value={editing.name} onChange={e => setEditing({...editing, name: e.target.value})} placeholder="e.g. Lincoln High School" />
          </Field>

          <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--color-text-tertiary)', letterSpacing:'.06em', marginBottom:10, marginTop:4 }}>THEME</div>

          <div className={styles.fieldGrid}>
            <Field label="Accent Color">
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <input type="color" value={editing.theme?.accent || '#ededed'} onChange={e => updateTheme('accent', e.target.value)}
                  style={{ width:36, height:32, padding:2, background:'var(--color-bg-3)', border:'1px solid var(--color-border-2)', borderRadius:'var(--radius-sm)', cursor:'pointer' }} />
                <input className={styles.fieldInput} value={editing.theme?.accent || ''} onChange={e => updateTheme('accent', e.target.value)} placeholder="#ededed" style={{ flex:1 }} />
              </div>
            </Field>
            <Field label="Accent Text Color">
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <input type="color" value={editing.theme?.accentFg || '#000000'} onChange={e => updateTheme('accentFg', e.target.value)}
                  style={{ width:36, height:32, padding:2, background:'var(--color-bg-3)', border:'1px solid var(--color-border-2)', borderRadius:'var(--radius-sm)', cursor:'pointer' }} />
                <input className={styles.fieldInput} value={editing.theme?.accentFg || ''} onChange={e => updateTheme('accentFg', e.target.value)} placeholder="#000000" style={{ flex:1 }} />
              </div>
            </Field>
            <Field label="Background">
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <input type="color" value={editing.theme?.bg || '#0a0a0a'} onChange={e => updateTheme('bg', e.target.value)}
                  style={{ width:36, height:32, padding:2, background:'var(--color-bg-3)', border:'1px solid var(--color-border-2)', borderRadius:'var(--radius-sm)', cursor:'pointer' }} />
                <input className={styles.fieldInput} value={editing.theme?.bg || ''} onChange={e => updateTheme('bg', e.target.value)} placeholder="#0a0a0a" style={{ flex:1 }} />
              </div>
            </Field>
            <Field label="Sidebar Background">
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <input type="color" value={editing.theme?.bgSidebar || '#111111'} onChange={e => updateTheme('bgSidebar', e.target.value)}
                  style={{ width:36, height:32, padding:2, background:'var(--color-bg-3)', border:'1px solid var(--color-border-2)', borderRadius:'var(--radius-sm)', cursor:'pointer' }} />
                <input className={styles.fieldInput} value={editing.theme?.bgSidebar || ''} onChange={e => updateTheme('bgSidebar', e.target.value)} placeholder="#111111" style={{ flex:1 }} />
              </div>
            </Field>
          </div>

          <Field label="Logo URL">
            <input className={styles.fieldInput} value={editing.theme?.logoUrl || ''} onChange={e => updateTheme('logoUrl', e.target.value)} placeholder="https://school.edu/logo.png" />
          </Field>

          <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:4 }}>
            <Btn primary onClick={save} disabled={saving || !editing.name}>{saving?'Saving...':'Save'}</Btn>
            <Btn onClick={() => { setEditing(null); resetTheme() }}>Cancel</Btn>
            <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', marginLeft:8 }}>
              <input type="checkbox" checked={preview} onChange={e => { setPreview(e.target.checked); if(e.target.checked) applyTheme(editing.theme); else resetTheme() }} />
              <span style={{ fontSize:12, color:'var(--color-text-tertiary)' }}>Preview theme</span>
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

// ---- SCHOOL ONBOARDING MODAL ----

type _Org = { id: string; name: string; theme: Record<string,string>; logo_url?: string | null }

function SchoolModal({ onClose }: { onClose: () => void }) {
  const [orgs, setOrgs] = useState<_Org[]>([])
  const [editing, setEditing] = useState<_Org | null>(null)
  const [name, setName] = useState('')
  const [accent, setAccent] = useState('#ededed')
  const [accentFg, setAccentFg] = useState('#000000')
  const [bgSidebar, setBgSidebar] = useState('#111111')
  const [textPrimary, setTextPrimary] = useState('#f0f0f0')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  const load = () => fetch('/api/orgs').then(r=>r.json()).then(setOrgs)
  useEffect(() => { load() }, [])

  const startEdit = (org: _Org) => {
    setEditing(org as _Org); setName(org.name)
    setAccent(org.theme?.accent || '#ededed')
    setAccentFg(org.theme?.accentFg || '#000000')
    setBgSidebar(org.theme?.bgSidebar || '#111111')
    setTextPrimary(org.theme?.textPrimary || '#f0f0f0')
  }

  const save = async () => {
    setSaving(true)
    const theme = { accent, accentFg, bgSidebar, textPrimary }
    const body = editing?.id
      ? { id: editing.id, name, theme }
      : { name, theme }
    const method = editing?.id ? 'PATCH' : 'POST'
    await fetch('/api/orgs', { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) })
    await load(); setSaving(false); setEditing(null); setName('')
    setToast(editing?.id ? 'School updated' : 'School created')
    setTimeout(() => setToast(''), 2500)
  }

  const preview = () => {
    applyTheme({ accent, accentFg, bgSidebar, textPrimary })
    setToast('Preview applied — close to reset')
    setTimeout(() => setToast(''), 3000)
  }

  return (
    <div className={styles.modalOverlay}>
      <div className={`${styles.modalBox} ${styles.modalBoxWide}`}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>SCHOOL ONBOARDING</span>
          <button className={styles.drawerClose} onClick={onClose}>&#x2715;</button>
        </div>
        <div className={styles.modalBody}>

          {/* Form */}
          <div className={styles.inviteBox}>
            <div className={styles.sectionLabel}>{editing?.id ? 'EDIT SCHOOL' : 'NEW SCHOOL'}</div>
            <Field label="School name">
              <input className={styles.fieldInput} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Lincoln High School" />
            </Field>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:10, marginBottom:14 }}>
              {[
                ['Accent color', accent, setAccent],
                ['Accent text', accentFg, setAccentFg],
                ['Sidebar bg', bgSidebar, setBgSidebar],
                ['Primary text', textPrimary, setTextPrimary],
              ].map(([label, val, setter]) => (
                <div key={label as string}>
                  <label className={styles.fieldLabel}>{label as string}</label>
                  <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                    <input type="color" value={val as string} onChange={e=>(setter as (v:string)=>void)(e.target.value)}
                      style={{ width:36, height:32, border:'1px solid var(--color-border-2)', borderRadius:'var(--radius-sm)', background:'none', cursor:'pointer', padding:2 }} />
                    <input className={styles.fieldInput} value={val as string} onChange={e=>(setter as (v:string)=>void)(e.target.value)}
                      style={{ fontFamily:'var(--font-mono)', fontSize:11 }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <Btn onClick={preview}>Preview</Btn>
              <Btn primary onClick={save} disabled={!name||saving}>{saving?'Saving...': editing?.id?'Update':'Create School'}</Btn>
              {editing?.id && <Btn onClick={()=>{ setEditing(null); setName('') }}>Cancel</Btn>}
            </div>
          </div>

          {/* School list */}
          <div className={styles.sectionLabel}>SCHOOLS</div>
          {orgs.length === 0
            ? <div className={styles.emptyLog}>No schools yet.</div>
            : orgs.map((org) => (
              <div key={org.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid var(--color-border)' }}>
                <div>
                  <div style={{ color:'var(--color-text-primary)', fontSize:13, fontWeight:500 }}>{org.name}</div>
                  {org.theme?.accent && (
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4 }}>
                      <div style={{ width:12, height:12, borderRadius:2, background:org.theme.accent, border:'1px solid var(--color-border-2)' }} />
                      <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--color-text-muted)' }}>{org.theme.accent}</span>
                    </div>
                  )}
                </div>
                <Btn onClick={() => startEdit(org)}>Edit</Btn>
              </div>
            ))
          }
        </div>
        {toast && <div style={{ margin:'0 20px 16px', padding:'8px 14px', background:'var(--color-success-bg)', border:'1px solid var(--color-success-bdr)', borderRadius:'var(--radius-md)', fontSize:12, color:'var(--color-success)', fontFamily:'var(--font-mono)' }}>{toast}</div>}
      </div>
    </div>
  )
}
