'use client';
import { useActionState, useState } from 'react';
import { registerBeneficiary, checkNrc, type RegState } from './actions';

const F = ({ l, n, t = 'text', req, hint }: { l: string; n: string; t?: string; req?: boolean; hint?: string }) => (
  <div><label className="label" htmlFor={n}>{l}{req && ' *'}</label><input id={n} name={n} type={t} required={req} className="input" min={t === 'number' ? 0 : undefined} />{hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}</div>);

export default function RegisterForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState<RegState, FormData>(registerBeneficiary, {});
  const [dup, setDup] = useState(false);
  if (state.ok) return (
    <div className="rounded-xl border border-green-300 bg-green-50 p-5">
      <p className="font-semibold text-green-800">Registered successfully</p>
      <p className="mt-1 text-2xl font-bold">{state.ok.beneficiary_no}</p>
      <a href="/beneficiaries/new" className="btn mt-3 inline-block">Register another</a>
    </div>);
  return (
    <form action={action} className="space-y-6">
      {state.error && <div className={`rounded-lg border p-3 text-sm font-medium ${state.duplicate ? 'border-red-400 bg-red-50 text-red-800' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>{state.error}</div>}
      <section className="grid gap-3 md:grid-cols-2">
        <F l="Full name" n="full_name" req />
        <div>
          <label className="label" htmlFor="nrc">NRC number *</label>
          <input id="nrc" name="nrc" required placeholder="123456/12/1" className={`input ${dup ? 'border-red-500' : ''}`}
            onChange={() => setDup(false)} onBlur={async e => setDup(await checkNrc(e.target.value))} />
          {dup && <p className="mt-0.5 text-xs font-medium text-red-600">This NRC is already registered. You will not be able to save.</p>}
        </div>
        <F l="Date of birth" n="date_of_birth" t="date" /><F l="Or approximate age" n="approx_age" t="number" hint="Date of birth or age is required" />
        <F l="Phone number" n="phone" t="tel" /><F l="Alternative contact" n="alt_contact" t="tel" />
        <F l="Province" n="province" req /><F l="District" n="district" req /><F l="Community" n="community" req />
        <F l="Registration date" n="registration_date" t="date" />
      </section>
      <section className="grid gap-3 md:grid-cols-3">
        <F l="Number of children" n="number_of_children" t="number" /><F l="Number of dependants" n="number_of_dependants" t="number" /><F l="Household size" n="household_size" t="number" />
      </section>
      <section className="grid gap-3 md:grid-cols-2">
        <F l="Educational background" n="education_background" /><F l="Employment status" n="employment_status" />
        <F l="Existing income sources" n="income_sources" /><F l="Existing business" n="existing_business" />
        <F l="Skills" n="skills" /><F l="Business interests" n="business_interests" />
      </section>
      <button className="btn" disabled={pending || dup}>{pending ? 'Saving…' : 'Register widow'}</button>
    </form>);
}
