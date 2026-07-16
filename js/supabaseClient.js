// ============================================================================
// CONEXIÓN A SUPABASE
// Pega aquí los valores de: Supabase → Project Settings → API
//   · Project URL  → SUPABASE_URL
//   · anon public  → SUPABASE_ANON_KEY
// Nota: la anon key SIEMPRE es visible en el navegador (así funciona Supabase).
// Por eso la seguridad real está en las políticas RLS de sql/setup.sql.
// ============================================================================

const SUPABASE_URL = 'https://ejanyezgsxlyrnnbjirb.supabase.co';   // ⚠️ CAMBIAR
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqYW55ZXpnc3hseXJubmJqaXJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxNjgwOTIsImV4cCI6MjA5OTc0NDA5Mn0.1KrvKsyhJ2J2NS7TDJ2CKL3kxJshL5TmVX2rsEZR85A';        // ⚠️ CAMBIAR

// "supabase" es el global que expone el CDN de supabase-js.
// Usamos "sb" como nombre del cliente para no chocar con ese global.
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
