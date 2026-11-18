import { DURATIONS_MIN, type CreateInterviewRequest, type Difficulty, type Voice } from '@deepdive/shared'
import { HttpError } from './http/errors.ts'

// Records (not arrays) so the compiler fails if a value is added to the type but not here.
const DIFFICULTIES: Record<Difficulty, true> = { EASY: true, MEDIUM: true, HARD: true }
const VOICES: Record<Voice, true> = { MALE: true, FEMALE: true }
const ROLE_MAX_LENGTH = 100

const invalid = (message: string) => new HttpError(400, 'VALIDATION_ERROR', message)

// Checks the POST /api/interviews body and returns it with the role trimmed.
export function parseCreateInterview(body: unknown): CreateInterviewRequest {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw invalid('Body must be a JSON object')
  const { role, difficulty, durationMin, voice } = body as Record<string, unknown>

  if (typeof role !== 'string' || role.trim() === '') throw invalid('role is required')
  if (role.trim().length > ROLE_MAX_LENGTH) throw invalid(`role must be at most ${ROLE_MAX_LENGTH} characters`)
  if (typeof difficulty !== 'string' || !Object.hasOwn(DIFFICULTIES, difficulty)) {
    throw invalid(`difficulty must be one of ${Object.keys(DIFFICULTIES).join(', ')}`)
  }
  if (!DURATIONS_MIN.includes(durationMin as never)) {
    throw invalid(`durationMin must be one of ${DURATIONS_MIN.join(', ')}`)
  }
  if (typeof voice !== 'string' || !Object.hasOwn(VOICES, voice)) {
    throw invalid(`voice must be one of ${Object.keys(VOICES).join(', ')}`)
  }

  return {
    role: role.trim(),
    difficulty: difficulty as Difficulty,
    durationMin: durationMin as CreateInterviewRequest['durationMin'],
    voice: voice as Voice,
  }
}
