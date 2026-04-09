'use client'
import { useState } from 'react'
import { supabase } from '@/lib/auth'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const signInWithGoogle = async () => {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    })
    if (error) { setError(error.message); setLoading(false) }
  }

  return (
    <div style={{
      minHeight:'100vh', background:'#0a0a0a', display:'flex',
      alignItems:'center', justifyContent:'center', fontFamily:"'IBM Plex Sans',system-ui"
    }}>
      <div style={{
        background:'#111', border:'1px solid #222', borderRadius:8,
        padding:'48px 40px', width:380, maxWidth:'90vw'
      }}>
        <div style={{ marginBottom:32, textAlign:'center' }}>
          <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:13, fontWeight:600, letterSpacing:'.12em', color:'#ededed', marginBottom:4 }}>
            VIDOR MEDIA
          </div>
          <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:9, color:'#444', letterSpacing:'.1em' }}>
            ASSET REGISTRY
          </div>
        </div>

        <div style={{ marginBottom:32 }}>
          <div style={{ fontSize:18, fontWeight:500, color:'#ededed', marginBottom:6 }}>Sign in</div>
          <div style={{ fontSize:13, color:'#555' }}>Access is by invitation only.</div>
        </div>

        {error && (
          <div style={{ background:'rgba(255,68,68,.1)', border:'1px solid rgba(255,68,68,.2)', borderRadius:4, padding:'10px 14px', marginBottom:16, fontSize:12, color:'#ff4444' }}>
            {error}
          </div>
        )}

        <button onClick={signInWithGoogle} disabled={loading} style={{
          width:'100%', padding:'11px 0', borderRadius:4, border:'1px solid #2a2a2a',
          background: loading ? '#1a1a1a' : '#ededed', color: loading ? '#555' : '#000',
          fontSize:13, fontWeight:500, cursor: loading ? 'default' : 'pointer',
          display:'flex', alignItems:'center', justifyContent:'center', gap:10,
          transition:'all .15s'
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill={loading ? '#555' : '#4285F4'} d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill={loading ? '#555' : '#34A853'} d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill={loading ? '#555' : '#FBBC05'} d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill={loading ? '#555' : '#EA4335'} d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {loading ? 'Signing in...' : 'Continue with Google'}
        </button>

        <div style={{ marginTop:24, fontSize:11, color:'#333', textAlign:'center', fontFamily:"'IBM Plex Mono',monospace", letterSpacing:'.04em' }}>
          Don&apos;t have access? Contact your administrator.
        </div>
      </div>
    </div>
  )
}
