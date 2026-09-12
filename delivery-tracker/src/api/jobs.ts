import { supabase } from '@/lib/supabase';
import type { EtaSource, Job, JobEvent, JobStatus } from '@/lib/types';

export interface NewJobInput {
  orgId: string;
  createdBy: string;
  address: string;
  addressLat?: number | null;
  addressLng?: number | null;
  productCount: number;
  cashToCollect: number;
  customerName?: string | null;
  customerPhone?: string | null;
  notes?: string | null;
  assignTo?: string | null;
}

export async function createJob(input: NewJobInput): Promise<Job> {
  const { data, error } = await supabase
    .from('jobs')
    .insert({
      org_id: input.orgId,
      created_by: input.createdBy,
      address: input.address,
      address_lat: input.addressLat ?? null,
      address_lng: input.addressLng ?? null,
      product_count: input.productCount,
      cash_to_collect: input.cashToCollect,
      customer_name: input.customerName ?? null,
      customer_phone: input.customerPhone ?? null,
      notes: input.notes ?? null,
      status: 'unassigned',
    })
    .select('*')
    .single();
  if (error) throw error;

  const job = data as Job;
  return input.assignTo ? assignJob(job.id, input.assignTo) : job;
}

export async function updateJobDetails(
  jobId: string,
  changes: Partial<
    Pick<
      Job,
      | 'address'
      | 'address_lat'
      | 'address_lng'
      | 'product_count'
      | 'cash_to_collect'
      | 'customer_name'
      | 'customer_phone'
      | 'notes'
    >
  >,
): Promise<Job> {
  const { data, error } = await supabase.from('jobs').update(changes).eq('id', jobId).select('*').single();
  if (error) throw error;
  return data as Job;
}

export async function listOrgJobs(orgId: string, statuses?: JobStatus[]): Promise<Job[]> {
  let query = supabase.from('jobs').select('*').eq('org_id', orgId);
  if (statuses?.length) query = query.in('status', statuses);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []) as Job[];
}

export async function listDriverJobs(driverId: string, statuses?: JobStatus[]): Promise<Job[]> {
  let query = supabase.from('jobs').select('*').eq('assigned_to', driverId);
  if (statuses?.length) query = query.in('status', statuses);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []) as Job[];
}

export async function fetchJob(jobId: string): Promise<Job | null> {
  const { data, error } = await supabase.from('jobs').select('*').eq('id', jobId).maybeSingle();
  if (error) throw error;
  return (data as Job | null) ?? null;
}

export async function fetchJobEvents(jobId: string): Promise<JobEvent[]> {
  const { data, error } = await supabase
    .from('job_events')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as JobEvent[];
}

// --- state machine -------------------------------------------------------
// Each of these maps to a security-definer function that enforces the legal
// transitions server-side, so a tampered client cannot skip a step.

async function callJobRpc(fn: string, args: Record<string, unknown>): Promise<Job> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as Job;
}

export const assignJob = (jobId: string, driverId: string): Promise<Job> =>
  callJobRpc('assign_job', { p_job: jobId, p_driver: driverId });

export const acceptJob = (jobId: string): Promise<Job> => callJobRpc('accept_job', { p_job: jobId });

export const declineJob = (jobId: string, reason?: string): Promise<Job> =>
  callJobRpc('decline_job', { p_job: jobId, p_reason: reason ?? null });

export const submitEta = (
  jobId: string,
  etaAt: string,
  source: EtaSource,
  minutes: number | null,
): Promise<Job> =>
  callJobRpc('submit_eta', { p_job: jobId, p_eta_at: etaAt, p_source: source, p_minutes: minutes });

export const startTrip = (jobId: string): Promise<Job> => callJobRpc('start_trip', { p_job: jobId });

export const markArrived = (jobId: string): Promise<Job> => callJobRpc('mark_arrived', { p_job: jobId });

export const completeJob = (
  jobId: string,
  deliveredCount: number,
  cashCollected: number,
  notes?: string,
): Promise<Job> =>
  callJobRpc('complete_job', {
    p_job: jobId,
    p_delivered_count: deliveredCount,
    p_cash_collected: cashCollected,
    p_notes: notes ?? null,
  });

export const cancelJob = (jobId: string, reason?: string): Promise<Job> =>
  callJobRpc('cancel_job', { p_job: jobId, p_reason: reason ?? null });

export async function addJobNote(jobId: string, orgId: string, actorId: string, message: string): Promise<void> {
  const { error } = await supabase
    .from('job_events')
    .insert({ job_id: jobId, org_id: orgId, actor_id: actorId, type: 'note', message });
  if (error) throw error;
}
