// REST request and response bodies. All timestamps are ISO 8601 strings.
import type {
  Difficulty,
  DurationMin,
  InterviewStatus,
  Skill,
  Speaker,
  Verdict,
  Voice,
} from './domain.ts'

export interface HealthResponse {
  status: 'ok'
  time: string // ISO 8601 timestamp from the server
}

export interface InterviewDto {
  id: string
  role: string // e.g. "Backend engineer intern"
  difficulty: Difficulty
  durationMin: DurationMin
  voice: Voice
  status: InterviewStatus
  createdAt: string
  startedAt: string | null // set when the interview goes LIVE; the room timer counts from here
  endedAt: string | null
}

export interface TurnDto {
  id: string
  index: number // 0, 1, 2, ... in speaking order
  speaker: Speaker
  text: string
  hasAudio: boolean // true when a recording exists; fetch it with GET /api/turns/:id/audio
  createdAt: string
}

export interface ScoreDto {
  skill: Skill
  score: number // 1-4
  comment: string
  quote: string | null // the candidate's own words; null if the quote is not in the linked candidate turn
  turnId: string | null // a CANDIDATE turn of this interview whose text contains the quote; null when quote is null
}

export interface ReportDto {
  interviewId: string
  overallScore: number // weighted average of the five scores, 1-4
  verdict: Verdict
  summary: string
  scores: ScoreDto[] // one per skill
  createdAt: string
}

// POST /api/interviews -> 201 InterviewDto
export interface CreateInterviewRequest {
  role: string
  difficulty: Difficulty
  durationMin: DurationMin
  voice: Voice
}

// GET /api/interviews -> 200 InterviewListItem[] (newest first)
export interface InterviewListItem extends InterviewDto {
  overallScore: number | null // null until the report is ready
  verdict: Verdict | null
}

// GET /api/interviews/:id -> 200 InterviewDetail
export interface InterviewDetail extends InterviewDto {
  turns: TurnDto[]
}

// GET /api/interviews/:id/report -> 200 ReportDto
// 404 if the interview does not exist; 409 while it is not DONE yet.

// GET /api/turns/:id/audio -> 200 AudioUrlResponse
// 404 if the turn has no recording.
export interface AudioUrlResponse {
  url: string // presigned S3 URL, valid for 5 minutes
  expiresAt: string
}

// DELETE /api/interviews/:id -> 204, no body.

// Body of every 4xx/5xx response.
export interface ApiError {
  error: {
    code: 'VALIDATION_ERROR' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL'
    message: string
  }
}
