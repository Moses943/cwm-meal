import { requireSession } from '@/lib/auth';
import RegisterForm from './form';

export default async function NewBeneficiary() {
  const s = await requireSession();
  if (!s.permissions.includes('beneficiary.register'))
    return <p className="rounded-lg border bg-white p-4 text-sm">Your role ({s.role.replace(/_/g, ' ')}) cannot register beneficiaries.</p>;
  return (<div className="max-w-3xl space-y-4"><h1 className="text-xl font-bold">Beneficiary Registration</h1>
    <p className="text-sm text-slate-500">The Beneficiary ID (CWM-YYYY-NNN) is generated automatically. A duplicate NRC will be refused.</p>
    <RegisterForm today={new Date().toISOString().slice(0, 10)} /></div>);
}
