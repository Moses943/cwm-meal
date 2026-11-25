'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [info, setInfo] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setErr('Incorrect email or password.');
    router.replace('/dashboard'); router.refresh();
  }
  async function reset() {
    if (!email) return setErr('Enter your email first.');
    const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/login` });
    setErr(''); setInfo(error ? '' : 'If that email has an account, a reset link has been sent.'); if (error) setErr('Could not send reset email.');
  }
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border bg-white p-6 shadow-sm">
        <div className="text-center">
          <img src="/logo.jpg" alt="Cornerstone Widows" className="mx-auto mb-2 h-24 w-24 object-contain" />
          <div className="text-xs font-semibold tracking-widest text-brand">CORNERSTONE WIDOWS MINISTRY</div>
          <h1 className="mt-1 text-lg font-semibold">Empowerment &amp; Monitoring System</h1>
        </div>
        <div><label className="label">Email</label><input className="input" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" /></div>
        <div><label className="label">Password</label><input className="input" type="password" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></div>
        {err && <p className="text-sm text-red-600">{err}</p>}{info && <p className="text-sm text-green-700">{info}</p>}
        <button className="btn w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <button type="button" onClick={reset} className="w-full text-xs text-slate-500 underline">Forgot password?</button>
        <p className="text-center text-xs text-slate-500">New staff member? <a href="/signup" className="underline">Request access</a>. The Project Director gives you a role.</p>
      </form>
    </main>
  );
}
