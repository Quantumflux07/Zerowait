/**
 * Supabase Configuration & Readiness Detection
 */

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return false;
  if (url.includes('placeholder') || url.includes('your-project-id')) return false;
  if (key.includes('placeholder') || key.includes('your-supabase-service-role-key')) return false;

  return true;
}

export function getMissingSupabaseConfigMessage(): string {
  return (
    'Supabase database is not configured. ' +
    'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY contain placeholder values in .env.local. ' +
    'To connect to your real Supabase project: ' +
    '1. Set NEXT_PUBLIC_SUPABASE_URL to your Supabase project URL (e.g. https://xyzcompany.supabase.co). ' +
    '2. Set SUPABASE_SERVICE_ROLE_KEY to your project service role secret. ' +
    '3. Set NEXT_PUBLIC_SUPABASE_ANON_KEY to your project anon key. ' +
    '4. Apply the SQL migrations in supabase/migrations/ to your database.'
  );
}
