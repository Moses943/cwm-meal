import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { MODULES } from '@/lib/modules';
import { supabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  return (
    <div className="min-h-screen md:flex">
      <input type="checkbox" id="nav" className="peer hidden" />
      <header className="flex items-center justify-between bg-brand p-3 text-white md:hidden">
        <span className="text-sm font-semibold">CWEMS</span><span className="flex items-center gap-3"><form action="/auth/signout" method="post"><button className="text-sm underline">Sign out</button></form><label htmlFor="nav" className="cursor-pointer text-sm">☰ Menu</label></span>
      </header>
      <aside className="hidden w-64 shrink-0 bg-white/95 p-4 peer-checked:block md:block md:min-h-screen md:border-r">
        <div className="mb-4 flex items-center gap-2"><img src="/logo.jpg" alt="" className="h-10 w-10 object-contain" /><div><div className="text-[10px] font-semibold tracking-widest text-brand">CORNERSTONE</div><div className="text-sm font-bold">WIDOWS MINISTRY</div></div></div>
        <nav className="space-y-0.5 text-sm">
          {MODULES.map(m => (
            <Link key={m.slug} href={`/${m.slug}`} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-brand-light">
              <span>{m.label}</span>{m.status === 'planned' && <span className="text-[10px] text-slate-400">soon</span>}
            </Link>))}
        </nav>
        <div className="mt-4 border-t pt-3 text-xs text-slate-500">
          <div className="font-medium text-slate-700">{s.fullName}</div><div>{s.role.replace(/_/g, ' ')}</div>
          <form action="/auth/signout" method="post"><button className="mt-2 underline">Sign out</button></form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
