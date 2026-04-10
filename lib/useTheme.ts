import { supabase } from './auth'

export type OrgTheme = {
  accent?: string
  accentFg?: string
  bg?: string
  bgSidebar?: string
  textPrimary?: string
  logoUrl?: string
}

const DEFAULTS: OrgTheme = {
  accent: '#ededed',
  accentFg: '#000000',
  bg: '#0a0a0a',
  bgSidebar: '#111111',
  textPrimary: '#f0f0f0',
}

export async function fetchOrgTheme(orgId: string): Promise<OrgTheme | null> {
  const { data } = await supabase
    .from('organizations')
    .select('theme, logo_url')
    .eq('id', orgId)
    .single()
  if (!data) return null
  return { ...data.theme, logoUrl: data.logo_url }
}

export function applyTheme(theme: OrgTheme | null) {
  const t = { ...DEFAULTS, ...theme }
  const r = document.documentElement
  if (t.accent)      r.style.setProperty('--color-accent', t.accent)
  if (t.accentFg)    r.style.setProperty('--color-accent-fg', t.accentFg)
  if (t.bg)          r.style.setProperty('--color-bg', t.bg)
  if (t.bgSidebar) { r.style.setProperty('--color-bg-1', t.bgSidebar); r.style.setProperty('--color-bg-2', t.bgSidebar) }
  if (t.textPrimary) r.style.setProperty('--color-text-primary', t.textPrimary)
}

export function resetTheme() {
  ;['--color-accent','--color-accent-fg','--color-bg','--color-bg-1','--color-bg-2','--color-text-primary']
    .forEach(v => document.documentElement.style.removeProperty(v))
}
