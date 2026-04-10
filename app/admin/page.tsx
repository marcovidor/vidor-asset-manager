'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/auth'
import type { UserProfile, UserRole } from '@/lib/auth'
import { applyTheme } from '@/lib/useTheme'
import styles from '../styles/app.module.css'
import '../styles/theme.css'

// ---- TYPES ----
type Org = { id: string; name: string; theme: Record<string,string>; logo_url?: string | null }

const ROLE_CLASS: Record<UserRole, string> = {
  super_admin: styles.roleBadgeSuperAdmin,
  admin: styles.roleBadgeAdmin,
  viewer: styles.roleBadgeViewer,
}
const ROLE_LABEL: Record<UserRole, string> = {
  super_admin: 'Super Admin', admin: 'Admin', viewer: 'Viewer',
}

function RoleBadge({ role }: { role?: UserRole }) {
  if (!role) return null
  return <span className={ROLE_CLASS[role]}>{ROLE_LABEL[role]}</span>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className={styles.fieldWrap}><label className={styles.fieldLabel}>{label}</label>{children}</div>
}
function Input({ value, onChange, placeholder, type='text' }: { value:string; onChange:(v:string)=>void; placeholder?:string; type?:string }) {
  return <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className={styles.fieldInput} />
}
function Sel({ value, onChange, children }: { value:string; onChange:(v:string)=>void; children:React.ReactNode }) {
  return <select value={value} onChange={e=>onChange(e.target.value)} className={styles.fieldSelect}>{children}</select>
}
function Btn({ onClick, primary, children, disabled }: { onClick:()=>void; primary?:boolean; children:React.ReactNode; disabled?:boolean }) {
  return <button onClick={onClick} disabled={disabled} className={primary?styles.btnPrimary:styles.btn}>{children}</button>
}

export default function AdminPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<'users'|'schools'|'import'|'serials'>('users')
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }
      const { data: p } = await supabase.from('user_profiles').select('*').eq('id', session.user.id).single()
      if (!p || p.role !== 'super_admin') { window.location.href = '/'; return }
      setProfile(p); setLoading(false)
    })
  }, [])

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'var(--color-bg)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-mono)', fontSize:11, color:'var(--color-text-muted)' }}>
      Loading...
    </div>
  )

  const sections = [
    { id:'users',   label:'Users',          icon:'👥' },
    { id:'schools', label:'Schools',         icon:'🏫' },
    { id:'import',  label:'Import / Export', icon:'⇅' },
    { id:'serials', label:'Bulk Serials',    icon:'#' },
  ] as const

  return (
    <div style={{ minHeight:'100vh', background:'var(--color-bg)', fontFamily:'var(--font-sans)' }}>

      {/* TOPBAR */}
      <div style={{ height:52, borderBottom:'1px solid var(--color-border)', display:'flex', alignItems:'center', padding:'0 24px', gap:16, background:'var(--color-bg)' }}>
        <a href="/" style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--color-text-muted)', letterSpacing:'.06em', textDecoration:'none', display:'flex', alignItems:'center', gap:6 }}>
          ← Registry
        </a>
        <div style={{ width:1, height:16, background:'var(--color-border)' }} />
        <span style={{ fontFamily:'var(--font-mono)', fontSize:11, letterSpacing:'.1em', color:'var(--color-text-primary)' }}>ADMIN</span>
        <div style={{ flex:1 }} />
        {profile && (
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:12, color:'var(--color-text-muted)' }}>{profile.full_name||profile.email}</span>
            <RoleBadge role={profile.role} />
          </div>
        )}
      </div>

      <div style={{ display:'flex', minHeight:'calc(100vh - 52px)' }}>

        {/* LEFT NAV */}
        <nav style={{ width:200, borderRight:'1px solid var(--color-border)', padding:'24px 0', background:'var(--color-bg-1)', flexShrink:0 }}>
          {sections.map(s => (
            <button key={s.id} onClick={()=>setActiveSection(s.id)}
              style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'10px 20px', background:activeSection===s.id?'var(--color-bg-active)':'transparent', border:'none', borderLeft:activeSection===s.id?'2px solid var(--color-accent)':'2px solid transparent', cursor:'pointer', fontSize:13, color:activeSection===s.id?'var(--color-text-primary)':'var(--color-text-tertiary)', textAlign:'left', fontFamily:'var(--font-sans)', transition:'all .1s' }}>
              <span style={{ fontSize:16, opacity:.7 }}>{s.icon}</span>
              {s.label}
            </button>
          ))}
        </nav>

        {/* CONTENT */}
        <div style={{ flex:1, padding:32, maxWidth:900 }}>
          {activeSection === 'users'   && <UsersSection onToast={showToast} />}
          {activeSection === 'schools' && <SchoolsSection onToast={showToast} />}
          {activeSection === 'import'  && <ImportExportSection onToast={showToast} />}
          {activeSection === 'serials' && <BulkSerialsSection onToast={showToast} />}
        </div>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}

// ---- SECTION: USERS ----
function UsersSection({ onToast }: { onToast:(m:string)=>void }) {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [orgs, setOrgs] = useState<Org[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin'|'viewer'>('viewer')
  const [inviteOrg, setInviteOrg] = useState('')
  const [inviting, setInviting] = useState(false)

  const loadUsers = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const hdrs = { Authorization: `Bearer ${session?.access_token}` }
    const [u, o] = await Promise.all([
      fetch('/api/users', { headers: hdrs }).then(r=>r.json()),
      fetch('/api/orgs', { headers: hdrs }).then(r=>r.json()),
    ])
    setUsers(Array.isArray(u)?u:[]); setOrgs(Array.isArray(o)?o:[]); setLoading(false)
  }

  useEffect(() => { loadUsers() }, [])

  const invite = async () => {
    if (!inviteEmail) return
    setInviting(true)
    const { error } = await supabase.auth.admin.inviteUserByEmail(inviteEmail)
    onToast(error ? `Error: ${error.message}` : `Invite sent to ${inviteEmail}`)
    setInviteEmail(''); setInviting(false)
  }

  const updateUser = async (id: string, role: string, org_id: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/users', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, role, org_id: org_id||null })
    })
    setUsers(prev => prev.map(u => u.id===id ? {...u, role:role as UserRole, org_id:org_id||null} : u))
    onToast('User updated')
  }

  return (
    <div>
      <h2 style={{ fontSize:18, fontWeight:500, color:'var(--color-text-primary)', marginBottom:4 }}>Users</h2>
      <p style={{ fontSize:13, color:'var(--color-text-tertiary)', marginBottom:28 }}>Manage who has access and their permissions.</p>

      {/* Invite */}
      <div style={{ background:'var(--color-bg-2)', border:'1px solid var(--color-border-2)', borderRadius:'var(--radius-md)', padding:20, marginBottom:28 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'.08em', color:'var(--color-text-muted)', marginBottom:14 }}>INVITE USER</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 140px 180px auto', gap:10, alignItems:'end' }}>
          <Field label="Email address"><Input value={inviteEmail} onChange={setInviteEmail} placeholder="user@email.com" /></Field>
          <Field label="Role"><Sel value={inviteRole} onChange={v=>setInviteRole(v as 'admin'|'viewer')}><option value="viewer">Viewer</option><option value="admin">Admin</option></Sel></Field>
          <Field label="Organization"><Sel value={inviteOrg} onChange={setInviteOrg}><option value="">None</option>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</Sel></Field>
          <div style={{ paddingBottom:2 }}><Btn primary onClick={invite} disabled={inviting||!inviteEmail}>{inviting?'Sending...':'Send Invite'}</Btn></div>
        </div>
      </div>

      {/* User list */}
      {loading ? <div className={styles.emptyLog}>Loading...</div> : (
        <div style={{ border:'1px solid var(--color-border)', borderRadius:'var(--radius-md)', overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--color-border)', background:'var(--color-bg-2)' }}>
                {['Name / Email','Role','Organization',''].map(h=>(
                  <th key={h} style={{ textAlign:'left', padding:'10px 16px', fontFamily:'var(--font-mono)', fontSize:10, color:'var(--color-text-muted)', letterSpacing:'.06em', fontWeight:400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => <UserRow key={u.id} user={u} orgs={orgs} onUpdate={updateUser} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function UserRow({ user, orgs, onUpdate }: { user:UserProfile; orgs:Org[]; onUpdate:(id:string,role:string,org:string)=>void }) {
  const [role, setRole] = useState(user.role)
  const [org, setOrg] = useState(user.org_id||'')
  const [dirty, setDirty] = useState(false)
  return (
    <tr style={{ borderBottom:'1px solid var(--color-border)' }}>
      <td style={{ padding:'12px 16px' }}>
        <div style={{ fontWeight:500, color:'var(--color-text-primary)' }}>{user.full_name||'—'}</div>
        <div style={{ fontSize:11, color:'var(--color-text-muted)', marginTop:2 }}>{user.email}</div>
      </td>
      <td style={{ padding:'12px 16px' }}>
        <select value={role} onChange={e=>{ setRole(e.target.value as UserRole); setDirty(true) }}
          style={{ background:'var(--color-bg-3)', border:'1px solid var(--color-border-2)', borderRadius:'var(--radius-sm)', padding:'4px 8px', fontSize:12, color:'var(--color-text-primary)', outline:'none' }}>
          <option value="super_admin">Super Admin</option>
          <option value="admin">Admin</option>
          <option value="viewer">Viewer</option>
        </select>
      </td>
      <td style={{ padding:'12px 16px' }}>
        <select value={org} onChange={e=>{ setOrg(e.target.value); setDirty(true) }}
          style={{ background:'var(--color-bg-3)', border:'1px solid var(--color-border-2)', borderRadius:'var(--radius-sm)', padding:'4px 8px', fontSize:12, color:'var(--color-text-primary)', outline:'none' }}>
          <option value="">None</option>
          {orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </td>
      <td style={{ padding:'12px 16px' }}>
        {dirty && <Btn primary onClick={()=>{ onUpdate(user.id, role, org); setDirty(false) }}>Save</Btn>}
      </td>
    </tr>
  )
}

// ---- SECTION: SCHOOLS ----
function SchoolsSection({ onToast }: { onToast:(m:string)=>void }) {
  const [orgs, setOrgs] = useState<Org[]>([])
  const [editing, setEditing] = useState<Org|null>(null)
  const [name, setName] = useState('')
  const [accent, setAccent] = useState('#ededed')
  const [accentFg, setAccentFg] = useState('#000000')
  const [bgSidebar, setBgSidebar] = useState('#111111')
  const [textPrimary, setTextPrimary] = useState('#f0f0f0')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const data = await fetch('/api/orgs', { headers: { Authorization: `Bearer ${session?.access_token}` } }).then(r=>r.json())
    setOrgs(Array.isArray(data)?data:[])
  }

  useEffect(() => { load() }, [])

  const startEdit = (org: Org) => {
    setEditing(org); setName(org.name)
    setAccent(org.theme?.accent||'#ededed')
    setAccentFg(org.theme?.accentFg||'#000000')
    setBgSidebar(org.theme?.bgSidebar||'#111111')
    setTextPrimary(org.theme?.textPrimary||'#f0f0f0')
  }

  const save = async () => {
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const hdrs = { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
    const theme = { accent, accentFg, bgSidebar, textPrimary }
    const body = editing?.id ? { id:editing.id, name, theme } : { name, theme }
    await fetch('/api/orgs', { method: editing?.id?'PATCH':'POST', headers:hdrs, body:JSON.stringify(body) })
    await load(); setSaving(false); setEditing(null); setName('')
    onToast(editing?.id ? 'School updated' : 'School created')
  }

  const colorFields: [string, string, (v:string)=>void][] = [
    ['Accent color', accent, setAccent],
    ['Accent text', accentFg, setAccentFg],
    ['Sidebar bg', bgSidebar, setBgSidebar],
    ['Primary text', textPrimary, setTextPrimary],
  ]

  return (
    <div>
      <h2 style={{ fontSize:18, fontWeight:500, color:'var(--color-text-primary)', marginBottom:4 }}>Schools</h2>
      <p style={{ fontSize:13, color:'var(--color-text-tertiary)', marginBottom:28 }}>Onboard client schools and customize their branding.</p>

      {/* Form */}
      <div style={{ background:'var(--color-bg-2)', border:'1px solid var(--color-border-2)', borderRadius:'var(--radius-md)', padding:20, marginBottom:28 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'.08em', color:'var(--color-text-muted)', marginBottom:14 }}>{editing?.id?'EDIT SCHOOL':'NEW SCHOOL'}</div>
        <Field label="School name">
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Lincoln High School" className={styles.fieldInput} style={{ maxWidth:320 }} />
        </Field>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12, marginBottom:16, marginTop:4 }}>
          {colorFields.map(([label, val, setter])=>(
            <div key={label}>
              <label className={styles.fieldLabel}>{label}</label>
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <input type="color" value={val} onChange={e=>setter(e.target.value)}
                  style={{ width:32, height:30, border:'1px solid var(--color-border-2)', borderRadius:'var(--radius-sm)', background:'none', cursor:'pointer', padding:2 }} />
                <input value={val} onChange={e=>setter(e.target.value)} className={styles.fieldInput}
                  style={{ fontFamily:'var(--font-mono)', fontSize:11 }} />
              </div>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <Btn onClick={()=>applyTheme({accent,accentFg,bgSidebar,textPrimary})}>Preview</Btn>
          <Btn primary onClick={save} disabled={!name||saving}>{saving?'Saving...':editing?.id?'Update':'Create School'}</Btn>
          {editing?.id && <Btn onClick={()=>{setEditing(null);setName('')}}>Cancel</Btn>}
        </div>
      </div>

      {/* School list */}
      {orgs.length === 0
        ? <div className={styles.emptyLog}>No schools yet.</div>
        : <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {orgs.map(org=>(
              <div key={org.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', background:'var(--color-bg-2)', border:'1px solid var(--color-border)', borderRadius:'var(--radius-md)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  {org.theme?.accent && <div style={{ width:16, height:16, borderRadius:3, background:org.theme.accent, border:'1px solid var(--color-border-2)', flexShrink:0 }} />}
                  <div>
                    <div style={{ fontWeight:500, color:'var(--color-text-primary)', fontSize:13 }}>{org.name}</div>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--color-text-muted)', marginTop:2 }}>{org.theme?.accent||'No theme'}</div>
                  </div>
                </div>
                <Btn onClick={()=>startEdit(org)}>Edit</Btn>
              </div>
            ))}
          </div>
      }
    </div>
  )
}

// ---- SECTION: IMPORT / EXPORT ----
function ImportExportSection({ onToast }: { onToast:(m:string)=>void }) {
  const [step, setStep] = useState<'idle'|'map'|'done'>('idle')
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
        if (ch==='"') { inQ=!inQ } else if (ch===',' && !inQ) { result.push(cur.trim()); cur='' } else { cur+=ch }
      }
      result.push(cur.trim()); return result
    }
    const hdrs = parseRow(lines[0]).map(h=>h.replace(/"/g,''))
    const data = lines.slice(1).map(parseRow)
    setHeaders(hdrs); setRows(data)
    const autoMap: Record<string,string> = {}
    FIELDS.forEach(f=>{
      const match = hdrs.find(h=>h.toLowerCase().includes(f.key)||h.toLowerCase().includes(f.label.toLowerCase().split('/')[0].trim()))
      if (match) autoMap[f.key] = match
    })
    setMapping(autoMap); setStep('map')
  }

  const handleFile = (file: File) => {
    const reader = new FileReader(); reader.onload = e => parseCSV(e.target?.result as string); reader.readAsText(file)
  }

  const doImport = async () => {
    setImporting(true)
    const { data: { session } } = await supabase.auth.getSession()
    const assets = rows.map((row, i) => {
      const obj: Record<string,string> = {}; headers.forEach((h,hi) => obj[h] = row[hi]||'')
      const get = (key: string) => (mapping[key] ? obj[mapping[key]] : '') || ''
      const cat = get('category') || 'UNCATEGORIZED'
      return { org_id:'00000000-0000-0000-0000-000000000001', asset_id:`IMP${String(i+1).padStart(4,'0')}_${Date.now()}`, category:cat, category_label:get('category_label')||cat, make:get('make')||'—', model:get('model')||'—', description:get('description')||'', serial:get('serial')||'TBD', status:get('status')||'active', condition:get('condition')||'good', location:get('location')||'', assigned_to:get('assigned_to')||'', notes:get('notes')||'', purchase_price:get('purchase_price')?parseFloat(get('purchase_price').replace(/[$,]/g,'')):null, purchase_date:get('purchase_date')||null }
    }).filter(a=>a.make!=='—'||a.model!=='—')
    let count = 0
    for (let i = 0; i < assets.length; i += 50) {
      await fetch('/api/assets', { method:'POST', headers:{Authorization:`Bearer ${session?.access_token}`,'Content-Type':'application/json'}, body:JSON.stringify({ batch:assets.slice(i,i+50) }) })
      count += Math.min(50, assets.length - i)
    }
    setImportCount(count); setImporting(false); setStep('done'); onToast(`${count} assets imported`)
  }

  const exportCSV = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const data = await fetch('/api/assets', { headers: { Authorization: `Bearer ${session?.access_token}` } }).then(r=>r.json())
    if (!Array.isArray(data)) return
    const headers = ['ID','Category','Make','Model','Description','Serial','Status','Condition','Location','Assigned To','Notes']
    const rows = data.map((a: Record<string,unknown>) => ['asset_id','category_label','make','model','description','serial','status','condition','location','assigned_to','notes'].map(k=>`"${String(a[k]||'').replace(/"/g,'""')}"`).join(','))
    const blob = new Blob([[headers.join(','),...rows].join('\n')], { type:'text/csv' })
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'VidorMedia_Assets.csv'; link.click()
    onToast('CSV exported')
  }

  return (
    <div>
      <h2 style={{ fontSize:18, fontWeight:500, color:'var(--color-text-primary)', marginBottom:4 }}>Import / Export</h2>
      <p style={{ fontSize:13, color:'var(--color-text-tertiary)', marginBottom:28 }}>Bulk import assets from a CSV, or export your current inventory.</p>

      {/* Export */}
      <div style={{ background:'var(--color-bg-2)', border:'1px solid var(--color-border-2)', borderRadius:'var(--radius-md)', padding:20, marginBottom:20 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'.08em', color:'var(--color-text-muted)', marginBottom:10 }}>EXPORT</div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <p style={{ fontSize:13, color:'var(--color-text-tertiary)', margin:0 }}>Download all assets as a CSV file.</p>
          <Btn onClick={exportCSV}>Export CSV</Btn>
        </div>
      </div>

      {/* Import */}
      <div style={{ background:'var(--color-bg-2)', border:'1px solid var(--color-border-2)', borderRadius:'var(--radius-md)', padding:20 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'.08em', color:'var(--color-text-muted)', marginBottom:14 }}>IMPORT</div>

        {step === 'idle' && (
          <div>
            <div ref={dropRef} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)handleFile(f)}}
              onClick={()=>document.getElementById('csvIn')?.click()}
              style={{ border:'2px dashed var(--color-border-3)', borderRadius:'var(--radius-md)', padding:32, textAlign:'center', cursor:'pointer' }}>
              <div style={{ fontSize:28, marginBottom:10 }}>📂</div>
              <div style={{ fontSize:13, fontWeight:500, color:'var(--color-text-primary)', marginBottom:4 }}>Drop CSV file here or click to browse</div>
              <div style={{ fontSize:12, color:'var(--color-text-muted)' }}>Any CSV with Make, Model, Category, Description, Serial...</div>
              <input id="csvIn" type="file" accept=".csv,.txt" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f)}} />
            </div>
          </div>
        )}

        {step === 'map' && (
          <div>
            <p style={{ fontSize:13, color:'var(--color-text-secondary)', marginBottom:16 }}>{rows.length} rows detected. Map your columns below.</p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
              {FIELDS.map(f=>(
                <div key={f.key} className={styles.fieldWrap}>
                  <label className={styles.fieldLabel}>{f.label}{f.required?' *':''}</label>
                  <select value={mapping[f.key]||''} onChange={e=>setMapping(prev=>({...prev,[f.key]:e.target.value}))} className={styles.fieldSelect}>
                    <option value=''>— skip —</option>
                    {headers.map(h=><option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div style={{ background:'var(--color-bg-3)', borderRadius:'var(--radius-md)', padding:12, overflow:'auto', maxHeight:160, marginBottom:16 }}>
              <div className={styles.fieldLabel} style={{marginBottom:6}}>PREVIEW (first 3 rows)</div>
              <table style={{ fontSize:11, borderCollapse:'collapse', width:'100%' }}>
                <thead><tr>{headers.map(h=><th key={h} style={{textAlign:'left',padding:'3px 8px',color:'var(--color-text-muted)',fontFamily:'var(--font-mono)',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
                <tbody>{rows.slice(0,3).map((row,i)=><tr key={i}>{row.map((c,ci)=><td key={ci} style={{padding:'3px 8px',color:'var(--color-text-secondary)',borderTop:'1px solid var(--color-border)',whiteSpace:'nowrap',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis'}}>{c}</td>)}</tr>)}</tbody>
              </table>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <Btn onClick={()=>setStep('idle')}>Back</Btn>
              <Btn primary onClick={doImport} disabled={importing||!mapping.make||!mapping.model}>
                {importing?`Importing...`:`Import ${rows.length} assets`}
              </Btn>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div style={{ textAlign:'center', padding:'24px 0' }}>
            <div style={{ fontSize:36, marginBottom:12 }}>✓</div>
            <div style={{ fontSize:16, fontWeight:500, color:'var(--color-text-primary)', marginBottom:6 }}>{importCount} assets imported</div>
            <div style={{ fontSize:13, color:'var(--color-text-tertiary)', marginBottom:16 }}>They are now visible in the registry.</div>
            <Btn onClick={()=>setStep('idle')}>Import more</Btn>
          </div>
        )}
      </div>
    </div>
  )
}

// ---- SECTION: BULK SERIALS ----
function BulkSerialsSection({ onToast }: { onToast:(m:string)=>void }) {
  type Asset = { id:string; asset_id:string; make:string; model:string; category_label:string; serial:string }
  const [assets, setAssets] = useState<Asset[]>([])
  const [serials, setSerials] = useState<Record<string,string>>({})
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<string|null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>
      fetch('/api/assets',{headers:{Authorization:`Bearer ${session?.access_token}`}})
        .then(r=>r.json())
        .then(data=>{
          const tbd = Array.isArray(data) ? data.filter((a: Asset)=>a.serial==='TBD'||!a.serial) : []
          setAssets(tbd); setLoading(false)
        })
    )
  },[])

  const save = async (asset: Asset) => {
    const val = serials[asset.id]?.trim()
    if (!val || val==='TBD') return
    setSaving(asset.id)
    const { data: { session } } = await supabase.auth.getSession()
    await fetch(`/api/assets/${asset.id}`, { method:'PATCH', headers:{Authorization:`Bearer ${session?.access_token}`,'Content-Type':'application/json'}, body:JSON.stringify({serial:val}) })
    setSaved(prev=>new Set([...prev,asset.id])); setSaving(null); onToast('Serial saved')
  }

  const remaining = assets.filter(a=>!saved.has(a.id))

  return (
    <div>
      <h2 style={{ fontSize:18, fontWeight:500, color:'var(--color-text-primary)', marginBottom:4 }}>Bulk Serials</h2>
      <p style={{ fontSize:13, color:'var(--color-text-tertiary)', marginBottom:28 }}>
        {loading ? 'Loading...' : `${remaining.length} assets still need a serial number.`}
      </p>

      {!loading && remaining.length === 0 && (
        <div style={{ textAlign:'center', padding:40, color:'var(--color-text-muted)', fontFamily:'var(--font-mono)', fontSize:12 }}>All serials filled in ✓</div>
      )}

      {remaining.map((asset, idx)=>(
        <div key={asset.id} style={{ display:'grid', gridTemplateColumns:'100px 1fr 1fr 1fr auto', gap:12, alignItems:'center', padding:'12px 0', borderBottom:'1px solid var(--color-border)' }}>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--color-text-muted)' }}>{asset.asset_id}</span>
          <span style={{ fontSize:13, fontWeight:500, color:'var(--color-text-primary)' }}>{asset.make}</span>
          <span style={{ fontSize:12, color:'var(--color-text-secondary)' }}>{asset.model}</span>
          <input
            value={serials[asset.id]||''}
            onChange={e=>setSerials(prev=>({...prev,[asset.id]:e.target.value}))}
            onKeyDown={e=>e.key==='Enter'&&save(asset)}
            placeholder="Enter serial number..."
            autoFocus={idx===0}
            className={styles.fieldInput}
            style={{ fontSize:12 }}
          />
          <Btn primary onClick={()=>save(asset)} disabled={saving===asset.id||!serials[asset.id]?.trim()}>
            {saving===asset.id?'...':'Save'}
          </Btn>
        </div>
      ))}
    </div>
  )
}
