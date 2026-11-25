import { redirect } from 'next/navigation';
import { supabaseServer } from './supabase/server';

export type Session = { id: string; fullName: string; role: string; permissions: string[] };

export async function requireSession(): Promise<Session> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('full_name, role, is_active').eq('id', user.id).single();
  if (!profile) redirect('/pending');
  if (!profile.is_active) redirect('/pending?r=inactive');
  const { data: perms } = await supabase.from('role_permissions').select('permission').eq('role', profile.role);
  return { id: user.id, fullName: profile.full_name, role: profile.role, permissions: (perms ?? []).map(p => p.permission) };
}
