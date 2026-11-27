// REST API calls (docs/api.md).
import type {
  ApiError,
  AudioUrlResponse,
  CreateInterviewRequest,
  InterviewDetail,
  InterviewDto,
  InterviewListItem,
  ReportDto,
} from '@deepdive/shared'

// Error for a non-2xx response.
export class ApiRequestError extends Error {
  readonly status: number
  readonly code: ApiError['error']['code'] | 'NETWORK'

  constructor(status: number, code: ApiRequestError['code'], message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
    })
  } catch {
    throw new ApiRequestError(0, 'NETWORK', 'Cannot reach the server. Is it running?')
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null
    throw new ApiRequestError(res.status, body?.error.code ?? 'INTERNAL', body?.error.message ?? `HTTP ${res.status}`)
  }
  // 202 and 204 have no body.
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

export const api = {
  listInterviews: () => request<InterviewListItem[]>('/interviews'),
  getInterview: (id: string) => request<InterviewDetail>(`/interviews/${id}`),
  createInterview: (body: CreateInterviewRequest) =>
    request<InterviewDto>('/interviews', { method: 'POST', body: JSON.stringify(body) }),
  deleteInterview: (id: string) => request<void>(`/interviews/${id}`, { method: 'DELETE' }),
  getReport: (id: string) => request<ReportDto>(`/interviews/${id}/report`),
  scoreAgain: (id: string) => request<void>(`/interviews/${id}/report`, { method: 'POST' }),
  getAudioUrl: (turnId: string) => request<AudioUrlResponse>(`/turns/${turnId}/audio`),
}

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong')
