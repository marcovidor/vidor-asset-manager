export type OrgTheme = {
  accent?: string; accentFg?: string; bg?: string
  bgSidebar?: string; logoUrl?: string; orgName?: string
}

const DEFAULTS: OrgTheme = {
  accent: '#ededed', accentFg: '#000000', bg: '#0a0a0a', bgSidebar: '#111111'
}

export function applyTheme(theme: OrgTheme | null) {
  const t = { ...DEFAULTS, ...theme }
  const r = document.documentElement
  r.style.setProperty('--color-accent', t.accent!)
  r.style.setProperty('--color-accent-fg', t.accentFg!)
  r.style.setProperty('--color-bg', t.bg!)
  r.style.setProperty('--color-bg-1', t.bgSidebar!)
  r.style.setProperty('--color-bg-2', t.bgSidebar!)
}

export function resetTheme() {
  ;['--color-accent','--color-accent-fg','--color-bg','--color-bg-1','--color-bg-2']
    .forEach(v => document.documentElement.style.removeProperty(v))
}
