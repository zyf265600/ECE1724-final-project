import type { InterviewDetail, ReportDto } from '@deepdive/shared'
import { describe, expect, it } from 'vitest'
import { reportMarkdown } from './reportMarkdown'

const interview: InterviewDetail = {
  id: 'interview-1',
  role: 'Backend engineer',
  difficulty: 'MEDIUM',
  durationMin: 10,
  voice: 'FEMALE',
  status: 'DONE',
  createdAt: '2026-11-20T15:00:00.000Z',
  startedAt: '2026-11-20T15:00:05.000Z',
  endedAt: '2026-11-20T15:10:00.000Z',
  turns: [
    { id: 't0', index: 0, speaker: 'INTERVIEWER', text: 'Tell me about a project.', hasAudio: false, createdAt: '' },
    { id: 't1', index: 1, speaker: 'CANDIDATE', text: 'I built a cache.', hasAudio: true, createdAt: '' },
  ],
}

const report: ReportDto = {
  interviewId: 'interview-1',
  overallScore: 2.5,
  verdict: 'HIRE',
  summary: 'You explained the cache clearly.',
  createdAt: '2026-11-20T15:11:00.000Z',
  scores: [
    { skill: 'TECHNICAL_DEPTH', score: 3, comment: 'Explains the mechanism.', quote: 'I built a cache', turnId: 't1' },
    { skill: 'CLARITY', score: 2, comment: 'Short answers.', quote: null, turnId: null },
  ],
}

describe('reportMarkdown', () => {
  const markdown = reportMarkdown(interview, report)

  it('starts with the role, verdict and overall score', () => {
    expect(markdown).toContain('# Backend engineer: interview report')
    expect(markdown).toContain('Medium · 10 min')
    expect(markdown).toContain('**Hire**, 2.5 / 4')
  })

  it('lists each skill with its weight and score', () => {
    expect(markdown).toContain('| Technical depth | 25% | 3 / 4 |')
    expect(markdown).toContain('| Clarity | 15% | 2 / 4 |')
  })

  it('quotes only the skills that have a quote', () => {
    expect(markdown).toContain('> I built a cache')
    expect(markdown.match(/^> /gm)).toHaveLength(1)
  })

  it('ends with the transcript, naming the candidate "You"', () => {
    expect(markdown).toContain('**Interviewer:** Tell me about a project.')
    expect(markdown.trimEnd().endsWith('**You:** I built a cache.')).toBe(true)
  })
})
