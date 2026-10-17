import { randomBytes } from "node:crypto";

// Long-running work returns a job (blueprint API rule: 202 + status URL, never a blocking call).
const jobs = new Map();

export function createJob(type, ref) {
  const id = `job-${randomBytes(3).toString("hex")}`;
  const job = { id, type, ref, status: "queued", created_at: new Date().toISOString(), steps: [], result: null, error: null };
  jobs.set(id, job);
  return job;
}
export function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return null;
  Object.assign(job, patch, { updated_at: new Date().toISOString() });
  if (patch.step) job.steps.push({ at: job.updated_at, text: patch.step });
  return job;
}
export const getJob = (id) => jobs.get(id) ?? null;
