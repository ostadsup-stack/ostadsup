import { createClient } from '@supabase/supabase-js'
import { isSupabaseConfigured } from './supabaseConfig'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!isSupabaseConfigured()) {
  console.warn(
    '[Ostadi] عدّل web/.env: VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY من Supabase → Settings → API',
  )
}

export const supabase = createClient(url || '', key || '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})
