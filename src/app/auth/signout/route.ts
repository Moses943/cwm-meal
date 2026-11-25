import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Signs the person out and always clears the login cookies, then sends them to /login.
export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/login', req.url), 303);
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list: { name: string; value: string; options: CookieOptions }[]) => list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
    },
  });
  try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* cookies are cleared below regardless */ }
  req.cookies.getAll().filter(c => c.name.startsWith('sb-')).forEach(c => res.cookies.set(c.name, '', { path: '/', maxAge: 0 }));
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
