'use server';
import { supabaseServer } from '@/lib/supabase/server';

export type RegState = { error?: string; duplicate?: boolean; ok?: { beneficiary_no: string } };

const num = (v: FormDataEntryValue | null) => (v === null || v === '' ? null : Number(v));

export async function registerBeneficiary(_: RegState, fd: FormData): Promise<RegState> {
  const g = (k: string) => String(fd.get(k) ?? '').trim();
  const payload = {
    full_name: g('full_name'), nrc: g('nrc'), date_of_birth: g('date_of_birth'), approx_age: num(fd.get('approx_age')),
    phone: g('phone'), alt_contact: g('alt_contact'), province: g('province'), district: g('district'), community: g('community'),
    number_of_children: num(fd.get('number_of_children')) ?? 0, number_of_dependants: num(fd.get('number_of_dependants')) ?? 0,
    household_size: num(fd.get('household_size')), education_background: g('education_background'),
    employment_status: g('employment_status'), income_sources: g('income_sources'), existing_business: g('existing_business'),
    skills: g('skills'), business_interests: g('business_interests'), registration_date: g('registration_date') || undefined,
  };
  if (payload.full_name.length < 2) return { error: 'Full name is required.' };
  if (!payload.date_of_birth && !payload.approx_age) return { error: 'Enter date of birth or age.' };
  if (!payload.province || !payload.district || !payload.community) return { error: 'Province, district and community are required.' };

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc('register_beneficiary', { p: payload });
  if (error) {
    if (error.message.includes('DUPLICATE_NRC')) return { duplicate: true, error: 'This NRC number is already registered. The record was NOT saved.' };
    if (error.message.includes('Invalid NRC')) return { error: 'Invalid NRC. Use the format 123456/12/1.' };
    if (error.code === '42501') return { error: 'You are not permitted to register beneficiaries.' };
    return { error: 'Could not save: ' + error.message };
  }
  return { ok: { beneficiary_no: (data as { beneficiary_no: string }).beneficiary_no } };
}

// Early warning while typing. Returns only true/false, never who owns the NRC.
export async function checkNrc(nrc: string): Promise<boolean> {
  if (!/^\d{6}\D?\d{2}\D?\d$/.test(nrc.trim())) return false;
  const { data } = await (await supabaseServer()).rpc('nrc_exists', { p_nrc: nrc });
  return data === true;
}
