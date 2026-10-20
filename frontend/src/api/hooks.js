import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, p } from './client.js'
import { useToast } from '../components/layout/Toast.jsx'

// ---------- reads ----------
export const useOverview = () => useQuery({ queryKey: ['overview'], queryFn: () => api(p('/overview')) })
export const useGraph = (snapshot) => useQuery({ queryKey: ['graph', snapshot], queryFn: () => api(p(`/graph?snapshot=${snapshot}`)), placeholderData: (prev) => prev })
export const useFindings = () => useQuery({ queryKey: ['findings'], queryFn: () => api(p('/findings')) })
export const useFinding = (id) => useQuery({ queryKey: ['finding', id], queryFn: () => api(`/findings/${id}`), retry: (n, e) => e.status !== 404 && n < 2 })
export const useRemediations = () => useQuery({ queryKey: ['remediations'], queryFn: () => api(p('/remediations')) })
export const useRemediation = (id) => useQuery({ queryKey: ['remediation', id], queryFn: () => api(`/remediations/${id}`), enabled: !!id })
export const useAgents = () => useQuery({ queryKey: ['agents'], queryFn: () => api(p('/agents')) })
export const useAgent = (id) => useQuery({ queryKey: ['agent', id], queryFn: () => api(`/agents/${id}`), retry: (n, e) => e.status !== 404 && n < 2 })
export const usePolicies = () => useQuery({ queryKey: ['policies'], queryFn: () => api(p('/policies')) })
export const useAudit = () => useQuery({ queryKey: ['audit'], queryFn: () => api('/audit-events') })
export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => api(p('/settings')) })
export const useScans = () => useQuery({ queryKey: ['scans'], queryFn: () => api(p('/scans')), refetchInterval: (q) => (q.state.data?.running ? 1500 : false) })
export const useIntegrations = () => useQuery({ queryKey: ['integrations'], queryFn: () => api('/integrations') })
export const useSearch = (q) => useQuery({ queryKey: ['search', q], queryFn: () => api(p(`/search?q=${encodeURIComponent(q)}`)), enabled: q.trim().length > 0, placeholderData: (prev) => prev })

// ---------- writes ----------
// Every change can touch findings, fixes, paths and the audit log, so refresh everything after it.
export function useAction(fn, { success } = {}) {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: fn,
    onSuccess: (data, vars) => {
      qc.invalidateQueries()
      if (success) toast(...[].concat(typeof success === 'function' ? success(data, vars) : success))
    },
    onError: (err) => toast('Not done', err.message),
  })
}

// Starts AI work (202 + job), then polls the job and refreshes data when it finishes.
export function useJob() {
  const qc = useQueryClient()
  const toast = useToast()
  return useCallback(async (start, { started, done } = {}) => {
    try {
      const { job_id: id, ai_mode: mode } = await start()
      toast(...[].concat(started ?? 'Started'), )
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 800))
        const job = await api(`/jobs/${id}`)
        if (job.status === 'succeeded') { qc.invalidateQueries(); toast(...[].concat(done ? done(job.result) : 'Done')); return job }
        if (job.status === 'failed') { toast('AI job failed', job.error ?? 'The result was rejected.'); return job }
      }
      toast('Still running', `Job ${id} (${mode} mode) is taking longer than expected.`)
    } catch (err) {
      toast('Could not start', err.message)
    }
  }, [qc, toast])
}
