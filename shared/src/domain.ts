// Domain values shared by client and server.
// The string values match the enums in server/prisma/schema.prisma.

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD'

export type Voice = 'MALE' | 'FEMALE'

// Allowed interview lengths, in minutes.
export const DURATIONS_MIN = [3, 5, 10] as const
export type DurationMin = (typeof DURATIONS_MIN)[number]

// CREATED -> LIVE -> SCORING -> DONE, or FAILED if scoring cannot finish.
export type InterviewStatus = 'CREATED' | 'LIVE' | 'SCORING' | 'DONE' | 'FAILED'

export type Speaker = 'INTERVIEWER' | 'CANDIDATE'

export type Skill =
  | 'TECHNICAL_DEPTH'
  | 'TRADE_OFFS'
  | 'RESULTS_VALIDATION'
  | 'PERSONAL_CONTRIBUTION'
  | 'CLARITY'

// Rubric weights (sum to 1). The server uses them to compute the overall score;
// the report page shows them next to each skill.
export const SKILL_WEIGHTS: Record<Skill, number> = {
  TECHNICAL_DEPTH: 0.25,
  TRADE_OFFS: 0.25,
  RESULTS_VALIDATION: 0.2,
  PERSONAL_CONTRIBUTION: 0.15,
  CLARITY: 0.15,
}

// Each skill is scored 1-4.
export const MIN_SKILL_SCORE = 1
export const MAX_SKILL_SCORE = 4

// Computed by the server from the overall score, never by the LLM.
export type Verdict = 'STRONG_HIRE' | 'HIRE' | 'NO_HIRE' | 'STRONG_NO_HIRE'
