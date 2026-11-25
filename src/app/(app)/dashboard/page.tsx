import { requireSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';

// All figures come from v_dashboard_counts (database). Nothing is hardcoded.
function Ring({ value, total, label }: { value: number; total: number; label: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : null;
  const r = 34, c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center rounded-xl border bg-white p-4">
      <svg width="88" height="88" viewBox="0 0 88 88" role="img" aria-label={`${label}: ${pct ?? 'no target'}%`}>
        <circle cx="44" cy="44" r={r} fill="none" stroke="#e5e7eb" strokeWidth="9" />
        {pct !== null && <circle cx="44" cy="44" r={r} fill="none" stroke="#2e7d32" strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 44 44)" />}
        <text x="44" y="49" textAnchor="middle" fontSize="16" fontWeight="700">{pct === null ? '–' : `${pct}%`}</text>
      </svg>
      <div className="mt-2 text-center text-xs text-slate-500">{label}</div>
      <div className="text-sm font-semibold">{value} / {total || '–'}</div>
    </div>);
}

export default async function Dashboard() {
  await requireSession();
  const supabase = await supabaseServer();
  const [{ data: c }, { data: cohort }] = await Promise.all([
    supabase.from('v_dashboard_counts').select('*').single(),
    supabase.from('programme_cohorts').select('name,target_beneficiaries').eq('is_active', true).order('start_date', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const target = cohort?.target_beneficiaries ?? 0;
  const cards: [string, number][] = [['Widows mobilised', c?.mobilised ?? 0], ['Registered', c?.registered ?? 0], ['Enrolled', c?.enrolled ?? 0],
    ['Active', c?.active ?? 0], ['Graduates', c?.graduates ?? 0], ['Post-graduation', c?.post_graduation ?? 0]];
  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-bold">Dashboard</h1><p className="text-sm text-slate-500">{cohort ? `Cohort: ${cohort.name}` : 'No active cohort yet. Create one in System Settings.'}</p></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map(([l, v]) => <div key={l} className="rounded-xl border bg-white p-4"><div className="text-xs uppercase text-slate-500">{l}</div><div className="text-2xl font-bold">{v}</div></div>)}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Ring value={c?.registered ?? 0} total={target} label="Registered vs target" />
        <Ring value={c?.enrolled ?? 0} total={target} label="Enrolled vs target" />
        <Ring value={c?.graduates ?? 0} total={c?.enrolled ?? 0} label="Graduation rate" />
      </div>
      <p className="text-xs text-slate-400">Training, welfare, business and follow-up figures will appear here as those modules are built (Phases 3–5).</p>
    </div>);
}
