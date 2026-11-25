import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';

export default async function Pending({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const { r } = await searchParams;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return (
    <main className="flex min-h-screen items-center justify-center p-4"><div className="w-full max-w-sm space-y-3 rounded-2xl border bg-white p-6 text-center shadow-sm">
      <img src="/logo.jpg" alt="Cornerstone Widows" className="mx-auto mb-2 h-24 w-24 object-contain" /><div className="text-xs font-semibold tracking-widest text-brand">CORNERSTONE WIDOWS MINISTRY</div>
      <h1 className="text-lg font-semibold">{r === 'inactive' ? 'Your access is switched off' : 'Waiting for access'}</h1>
      <p className="text-sm text-slate-600">{r === 'inactive' ? 'Please contact the Project Director.' : `You are signed in as ${user.email}, but you have not been given a role yet. Ask the Project Director to give you access.`}</p>
      <form action="/auth/signout" method="post"><button className="btn">Sign out</button></form></div></main>);
}
