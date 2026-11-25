import { requireSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { grantRole, updateStaff } from './actions';

export default async function Users({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  if (!s.permissions.includes('users.manage'))
    return <p className="rounded-lg border bg-white p-4 text-sm">Your role ({s.role.replace(/_/g, ' ')}) cannot manage staff. Only the Project Director and the Administrator can.</p>;
  const supabase = await supabaseServer();
  const [{ data: roles }, { data: staff }, { data: pending }] = await Promise.all([
    supabase.from('roles').select('role,label').order('label'),
    supabase.from('profiles').select('id,full_name,email,role,is_active').order('full_name'),
    supabase.rpc('pending_signups'),
  ]);
  const isAdmin = s.permissions.includes('admin.manage');
  const options = (roles ?? []).filter(r => isAdmin || r.role !== 'system_admin');
  const label = (r: string) => roles?.find(x => x.role === r)?.label ?? r;
  return (
    <div className="max-w-4xl space-y-6">
      <div><h1 className="text-xl font-bold">Staff and User Management</h1>
        <p className="text-sm text-slate-500">New staff use <b>Request access</b> on the sign-in page. They appear below, and you give them a role.</p></div>
      {sp.ok && <p className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">{sp.ok}</p>}
      {sp.err && <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{sp.err}</p>}

      <section className="space-y-2"><h2 className="font-semibold">Waiting for access ({pending?.length ?? 0})</h2>
        {!pending?.length && <p className="text-sm text-slate-400">No one is waiting.</p>}
        {pending?.map((p: { id: string; email: string; full_name: string }) => (
          <form key={p.id} action={grantRole} className="flex flex-wrap items-end gap-2 rounded-xl border bg-white p-3">
            <input type="hidden" name="email" value={p.email} />
            <div className="min-w-40 flex-1"><label className="label">Name</label><input name="name" defaultValue={p.full_name} className="input" required /></div>
            <div className="min-w-40 flex-1"><label className="label">Email</label><div className="py-2 text-sm">{p.email}</div></div>
            <div><label className="label">Role</label><select name="role" className="input" required defaultValue=""><option value="" disabled>Choose…</option>{options.map(r => <option key={r.role} value={r.role}>{r.label}</option>)}</select></div>
            <button className="btn">Give access</button></form>))}
      </section>

      <section className="space-y-2"><h2 className="font-semibold">Give access by email</h2>
        <form action={grantRole} className="flex flex-wrap items-end gap-2 rounded-xl border bg-white p-3">
          <div className="min-w-40 flex-1"><label className="label">Full name</label><input name="name" className="input" required /></div>
          <div className="min-w-40 flex-1"><label className="label">Email (must already have an account)</label><input name="email" type="email" className="input" required /></div>
          <div><label className="label">Role</label><select name="role" className="input" required defaultValue=""><option value="" disabled>Choose…</option>{options.map(r => <option key={r.role} value={r.role}>{r.label}</option>)}</select></div>
          <button className="btn">Give access</button></form></section>

      <section className="space-y-2"><h2 className="font-semibold">Staff ({staff?.length ?? 0})</h2>
        <div className="space-y-2">{staff?.map(u => {
          const locked = u.role === 'system_admin' && !isAdmin;
          return (
            <form key={u.id} action={updateStaff} className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3">
              <input type="hidden" name="id" value={u.id} />
              <div className="min-w-44 flex-1"><div className="text-sm font-medium">{u.full_name}</div><div className="text-xs text-slate-500">{u.email}</div></div>
              {locked ? <div className="text-sm">{label(u.role)} <span className="text-xs text-slate-400">(needs Administrator rights)</span></div> : <>
                <select name="role" defaultValue={u.role} className="input w-auto">{options.map(r => <option key={r.role} value={r.role}>{r.label}</option>)}</select>
                <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="active" defaultChecked={u.is_active} /> Active</label>
                <button className="btn">Save</button></>}
            </form>);
        })}</div></section>
    </div>);
}
