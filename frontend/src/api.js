export const PROJECT_ID = 'default'

async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const body = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.message ?? `Request failed (${res.status})`)
  return body
}

export const api = {
  getInstallUrl: () => request(`/github/install-url?projectId=${PROJECT_ID}`),
  listGrantedRepos: (installationId) =>
    request(`/github/installations/${installationId}/repos?projectId=${PROJECT_ID}`),
  listConnectedRepos: () => request(`/projects/${PROJECT_ID}/repositories`),
  saveRepos: (installationId, repositoryIds) =>
    request(`/projects/${PROJECT_ID}/repositories`, {
      method: 'POST',
      body: JSON.stringify({ installationId, repositoryIds }),
    }),
  disconnectRepo: (repoId) =>
    request(`/projects/${PROJECT_ID}/repositories/${repoId}`, { method: 'DELETE' }),
}
