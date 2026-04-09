# Vidor Asset Manager

Full-stack asset management app built with Next.js + Supabase.

## Setup
1. Run the SQL schema in Supabase SQL Editor (see `supabase-schema.sql`)
2. Deploy to Vercel
3. Add env vars to Vercel: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
4. Visit /api/seed (POST) to seed initial assets

## Stack
- Next.js 15 (App Router)
- Supabase (Postgres + Storage)
- Vercel (hosting)
