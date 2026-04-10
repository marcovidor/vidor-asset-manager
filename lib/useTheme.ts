import { useEffect } from 'react'
import { supabase } from './auth'

export type OrgTheme = {
  accent?: string
  accentFg?: string
  bg?: string
  bgSidebar?: string
  textPrimary?: string
  logoUrl?: string
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

export function applyTheme(theme: OrgTheme) {
  const root = document.documentElement
  if (theme.accent)      root.style.setProperty('--color-accent', theme.accent)
  if (theme.accentFg)    root.style.setProperty('--color-accent-fg', theme.accentFg)
  if (theme.bg)          root.style.setProperty('--color-bg', theme.bg)
  if (theme.bgSidebar)   root.style.setProperty('--color-bg-1', theme.bgSidebar)
  if (theme.textPrimary) root.style.setProperty('--color-text-primary', theme.textPrimary)
}

export function resetTheme() {
  const root = document.documentElement
  ;['--color-accent','--color-accent-fg','--color-bg','--color-bg-1','--color-text-primary']
    .forEach(v => root.style.removeProperty(v))
}
