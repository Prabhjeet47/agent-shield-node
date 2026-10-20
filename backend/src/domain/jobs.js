import { randomBytes } from "node:crypto";
import { persistSoon } from "./persist.js";

// Long-running work returns a job (blueprint API rule: 202 + status URL, never a blocking call).
let jobs = new Map();

export const exportJobs = () => [...jobs.values()].slice(-200);
export function importJobs(saved) {
  jobs = new Map((saved ?? []).map((j) => [j.id, j]));
}
export const listJobs = (type) => [...jobs.values()].filter((j) => !type || j.type === type).reverse();

export function createJob(type, ref) {
  const id = `job-${randomBytes(3).toString("hex")}`;
  const job = { id, type, ref, status: "queued", created_at: new Date().toISOString(), steps: [], result: null, error: null };
  jobs.set(id, job);
  persistSoon();
  return job;
}
export function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return null;
  Object.assign(job, patch, { updated_at: new Date().toISOString() });
  if (patch.step) job.steps.push({ at: job.updated_at, text: patch.step });
  persistSoon();
  return job;
}
export const getJob = (id) => jobs.get(id) ?? null;
