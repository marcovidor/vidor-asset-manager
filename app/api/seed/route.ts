import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ message: 'Seed disabled -- use deploy-from-scratch.sql instead' })
}
