export const PROJECT_ID = 'default'

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message ?? `Request failed (${status})`)
    this.status = status
    this.code = body?.error
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/v1${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data)
  return data
}

export const p = (path) => `/projects/${PROJECT_ID}${path}`
