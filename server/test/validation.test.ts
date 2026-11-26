import { describe, expect, it } from 'vitest'
import { HttpError } from '../src/http/errors.ts'
import { parseCreateInterview } from '../src/validation.ts'

const valid = { role: '  Backend engineer  ', difficulty: 'MEDIUM', durationMin: 10, voice: 'FEMALE' }

// Returns the HttpError that parseCreateInterview throws for this body.
function rejection(body: unknown): HttpError {
  try {
    parseCreateInterview(body)
  } catch (err) {
    if (err instanceof HttpError) return err
    throw err
  }
  throw new Error('expected the body to be rejected')
}

describe('parseCreateInterview', () => {
  it('accepts a valid body and trims the role', () => {
    expect(parseCreateInterview(valid)).toEqual({ ...valid, role: 'Backend engineer' })
  })

  it.each([
    ['a non-object body', []],
    ['a missing role', { ...valid, role: '   ' }],
    ['a role over 100 characters', { ...valid, role: 'x'.repeat(101) }],
    ['an unknown difficulty', { ...valid, difficulty: 'EXTREME' }],
    ['a duration that is not offered', { ...valid, durationMin: 7 }],
    ['an unknown voice', { ...valid, voice: 'ROBOT' }],
  ])('rejects %s with 400 VALIDATION_ERROR', (_case, body) => {
    const err = rejection(body)
    expect(err.status).toBe(400)
    expect(err.code).toBe('VALIDATION_ERROR')
  })
})
