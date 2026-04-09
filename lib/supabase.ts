import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Asset = {
  id: string
  org_id: string
  asset_id: string
  category: string
  category_label: string
  make: string
  model: string
  description: string
  serial: string
  status: string
  notes: string
  purchase_date: string | null
  purchase_price: number | null
  current_value: number | null
  location: string
  assigned_to: string
  condition: string
  photo_url: string | null
  created_at: string
  updated_at: string
}

export type CheckoutRecord = {
  id: string
  asset_id: string
  org_id: string
  checked_out_by: string
  checked_out_at: string
  due_back_at: string | null
  checked_in_at: string | null
  notes: string
}

export type MaintenanceRecord = {
  id: string
  asset_id: string
  org_id: string
  type: string
  description: string
  performed_by: string
  performed_at: string
  cost: number | null
  next_due_at: string | null
  notes: string
}
