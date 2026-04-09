import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Auth protection is handled client-side in page.tsx
// This middleware only handles static/api passthrough
export async function middleware(request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}