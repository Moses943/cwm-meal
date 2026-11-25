'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';

const back = (msg: string, ok = false) => redirect(`/users?${ok ? 'ok' : 'err'}=${encodeURIComponent(msg)}`);
const clean = (m: string) => m.replace(/^.*?(No account|Only an|You cannot|You are not|Not permitted)/, '$1');

export async function grantRole(fd: FormData) {
  const email = String(fd.get('email') ?? '').trim(), name = String(fd.get('name') ?? '').trim(), role = String(fd.get('role') ?? '');
  if (!email || !name || !role) back('Name, email and role are required.');
  const { error } = await (await supabaseServer()).rpc('grant_role', { p_email: email, p_full_name: name, p_role: role });
  if (error) back(clean(error.message));
  revalidatePath('/users'); back(`Access given to ${name}.`, true);
}

export async function updateStaff(fd: FormData) {
  const id = String(fd.get('id')), role = String(fd.get('role')), active = fd.get('active') === 'on';
  const { error } = await (await supabaseServer()).from('profiles').update({ role, is_active: active }).eq('id', id);
  if (error) back(clean(error.message));
  revalidatePath('/users'); back('Saved.', true);
}
