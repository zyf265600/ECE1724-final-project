// Database rows -> shared/src/rest.ts shapes. S3 keys stay on the server.
import type { DurationMin, InterviewDto, ReportDto, ScoreDto, Skill, TurnDto } from '@deepdive/shared'
import { SKILL_WEIGHTS } from '@deepdive/shared'
import type { Interview, Report, Score, Turn } from './generated/prisma/client.ts'

const iso = (date: Date | null) => (date ? date.toISOString() : null)

export function toInterviewDto(row: Interview): InterviewDto {
  return {
    id: row.id,
    role: row.role,
    difficulty: row.difficulty,
    durationMin: row.durationMin as DurationMin,
    voice: row.voice,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    startedAt: iso(row.startedAt),
    endedAt: iso(row.endedAt),
  }
}

export function toTurnDto(row: Turn): TurnDto {
  return {
    id: row.id,
    index: row.index,
    speaker: row.speaker,
    text: row.text,
    hasAudio: row.audioKey !== null,
    createdAt: row.createdAt.toISOString(),
  }
}

// Skills in rubric order.
const SKILL_ORDER = Object.keys(SKILL_WEIGHTS) as Skill[]

export function toReportDto(row: Report & { scores: Score[] }): ReportDto {
  const scores: ScoreDto[] = [...row.scores]
    .sort((a, b) => SKILL_ORDER.indexOf(a.skill) - SKILL_ORDER.indexOf(b.skill))
    .map((s) => ({ skill: s.skill, score: s.score, comment: s.comment, quote: s.quote, turnId: s.turnId }))
  return {
    interviewId: row.interviewId,
    overallScore: row.overallScore,
    verdict: row.verdict,
    summary: row.summary,
    scores,
    createdAt: row.createdAt.toISOString(),
  }
}
