'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function Signup() {
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState(''); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    if (f.password.length < 8) return setErr('Use a password of at least 8 characters.');
    setBusy(true);
    const { error } = await supabaseBrowser().auth.signUp({
      email: f.email.trim(), password: f.password,
      options: { data: { full_name: f.name.trim(), app: 'cwems' }, emailRedirectTo: `${location.origin}/login` },
    });
    setBusy(false);
    if (error) return setErr(error.message);
    setDone(true);
  }
  if (done) return (
    <main className="flex min-h-screen items-center justify-center p-4"><div className="w-full max-w-sm space-y-3 rounded-2xl border bg-white p-6 text-center shadow-sm">
      <h1 className="text-lg font-semibold">Request sent</h1>
      <p className="text-sm text-slate-600">If you are asked to confirm your email, open the message we sent and confirm it. Then ask the Project Director to give you a role. You can sign in after that.</p>
      <a href="/login" className="btn inline-block">Back to sign in</a></div></main>);
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border bg-white p-6 shadow-sm">
        <div className="text-center"><img src="/logo.jpg" alt="Cornerstone Widows" className="mx-auto mb-2 h-24 w-24 object-contain" /><div className="text-xs font-semibold tracking-widest text-brand">CORNERSTONE WIDOWS MINISTRY</div><h1 className="mt-1 text-lg font-semibold">Request access</h1>
          <p className="mt-1 text-xs text-slate-500">You will not see any records until the Project Director gives you a role.</p></div>
        <div><label className="label">Full name</label><input className="input" required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
        <div><label className="label">Email</label><input className="input" type="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} autoComplete="username" /></div>
        <div><label className="label">Password (8+ characters)</label><input className="input" type="password" required value={f.password} onChange={e => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn w-full" disabled={busy}>{busy ? 'Sending…' : 'Request access'}</button>
        <p className="text-center text-xs"><a href="/login" className="underline">Back to sign in</a></p>
      </form></main>);
}
