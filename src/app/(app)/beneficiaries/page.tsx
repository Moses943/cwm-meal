import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';

export default async function Beneficiaries({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireSession();
  const { q = '' } = await searchParams;
  const term = q.replace(/[%,()]/g, ' ').trim();
  const supabase = await supabaseServer();
  let query = supabase.from('beneficiaries').select('id,beneficiary_no,full_name,district,community,status,registration_date')
    .eq('is_archived', false).order('beneficiary_no').limit(200);   // RLS decides which rows this user may see
  if (term) query = query.or(`full_name.ilike.%${term}%,beneficiary_no.ilike.%${term}%,community.ilike.%${term}%,district.ilike.%${term}%`);
  const { data, error } = await query;
  const fmt = (d: string) => d.split('-').reverse().join('/');   // DD/MM/YYYY
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-xl font-bold">Beneficiary Profiles</h1>
        <Link href="/beneficiaries/new" className="btn">+ Register widow</Link></div>
      <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Search name, ID, community or district" className="input max-w-md" /><button className="btn">Search</button></form>
      {error && <p className="text-sm text-red-600">Could not load records.</p>}
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>
          {['ID', 'Name', 'District', 'Community', 'Status', 'Registered'].map(h => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
          <tbody>{(data ?? []).map(b => (<tr key={b.id} className="border-t"><td className="px-3 py-2 font-mono text-xs">{b.beneficiary_no}</td><td className="px-3 py-2">{b.full_name}</td>
            <td className="px-3 py-2">{b.district}</td><td className="px-3 py-2">{b.community}</td><td className="px-3 py-2 capitalize">{b.status.replace('_', ' ')}</td><td className="px-3 py-2">{fmt(b.registration_date)}</td></tr>))}
            {!data?.length && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">No beneficiaries found.</td></tr>}</tbody></table>
      </div>
    </div>);
}
