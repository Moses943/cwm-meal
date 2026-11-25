import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { MODULES } from '@/lib/modules';

export default async function Planned({ params }: { params: Promise<{ module: string }> }) {
  await requireSession();
  const { module } = await params;
  const m = MODULES.find(x => x.slug === module);
  if (!m) notFound();
  return (<div className="max-w-xl space-y-2"><h1 className="text-xl font-bold">{m.label}</h1>
    <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">This module is not built yet. It is scheduled for Phase {m.phase} and has no data or functions at the moment.</p></div>);
}
