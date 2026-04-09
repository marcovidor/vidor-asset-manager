import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export type UserRole = 'super_admin' | 'admin' | 'viewer'

export type UserProfile = {
  id: string
  email: string
  full_name: string
  role: UserRole
  org_id: string | null
  created_at: string
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getProfile(): Promise<UserProfile | null> {
  const session = await getSession()
  if (!session) return null
  const { data } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', session.user.id)
    .single()
  return data
}

export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` }
  })
}

export async function signOut() {
  return supabase.auth.signOut()
}

export function canEdit(role: UserRole) {
  return role === 'super_admin' || role === 'admin'
}

export function canDelete(role: UserRole) {
  return role === 'super_admin'
}

export function canManageUsers(role: UserRole) {
  return role === 'super_admin'
}
