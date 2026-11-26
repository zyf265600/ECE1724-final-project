import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Turn } from '../src/generated/prisma/client.ts'

// No database or DeepSeek in these tests: scoring only needs the LLM reply.
vi.mock('../src/db.ts', () => ({ prisma: {} }))
vi.mock('../src/services/llm.ts', () => ({ chat: vi.fn() }))

const { chat } = await import('../src/services/llm.ts')
const { checkQuote, scoreTranscript, verdictFor, weightedScore } = await import('../src/services/scoring.ts')

function turn(index: number, speaker: Turn['speaker'], text: string): Turn {
  return { id: `turn-${index}`, interviewId: 'interview-1', index, speaker, text, audioKey: null, createdAt: new Date(0) }
}

const turns = [
  turn(0, 'INTERVIEWER', 'Tell me about one project you worked on.'),
  turn(1, 'CANDIDATE', 'I built a cache for our search service. It cut p95 latency from 300 ms to 80 ms.'),
  turn(2, 'INTERVIEWER', 'Why Redis and not Memcached?'),
  turn(3, 'CANDIDATE', 'We needed sorted sets for the ranking, so I chose Redis.'),
]

describe('checkQuote', () => {
  it('keeps a quote found in its linked candidate turn, ignoring case and punctuation', () => {
    expect(checkQuote('It cut P95 latency from 300 ms to 80 ms', 1, turns)?.id).toBe('turn-1')
  })

  it('drops a quote from an interviewer turn', () => {
    expect(checkQuote('Why Redis and not Memcached?', 2, turns)).toBeNull()
  })

  it('drops a quote linked to a different answer', () => {
    expect(checkQuote('so I chose Redis', 1, turns)).toBeNull()
  })

  it('matches whole words only', () => {
    expect(checkQuote('ache', 1, turns)).toBeNull() // inside "cache"
  })

  it('drops a quote without a turn number', () => {
    expect(checkQuote('so I chose Redis', null, turns)).toBeNull()
  })
})

describe('weighted score and verdict', () => {
  it('weights the five skills and rounds to one decimal', () => {
    const scores = [
      { skill: 'TECHNICAL_DEPTH', score: 4 },
      { skill: 'TRADE_OFFS', score: 3 },
      { skill: 'RESULTS_VALIDATION', score: 2 },
      { skill: 'PERSONAL_CONTRIBUTION', score: 2 },
      { skill: 'CLARITY', score: 3 },
    ] as const
    expect(weightedScore([...scores])).toBe(2.9) // 1.0 + 0.75 + 0.4 + 0.3 + 0.45
  })

  it.each([
    [3.3, 'STRONG_HIRE'],
    [3.2, 'HIRE'],
    [2.5, 'HIRE'],
    [2.4, 'NO_HIRE'],
    [1.8, 'NO_HIRE'],
    [1.7, 'STRONG_NO_HIRE'],
  ])('%s -> %s', (score, verdict) => {
    expect(verdictFor(score)).toBe(verdict)
  })
})

// A valid LLM reply: every skill scored 3; the CLARITY quote comes from the interviewer.
function sheet(skills = ['TECHNICAL_DEPTH', 'TRADE_OFFS', 'RESULTS_VALIDATION', 'PERSONAL_CONTRIBUTION', 'CLARITY']) {
  return JSON.stringify({
    summary: 'You explained the cache clearly. Compare more alternatives.',
    scores: skills.map((skill) => ({
      skill,
      score: 3,
      comment: `Comment for ${skill}.`,
      quote: skill === 'CLARITY' ? 'Why Redis and not Memcached' : 'It cut p95 latency',
      turnIndex: skill === 'CLARITY' ? 2 : 1,
    })),
  })
}

describe('scoreTranscript', () => {
  const mockChat = vi.mocked(chat)
  beforeEach(() => mockChat.mockReset())

  it('scores a valid reply and drops the quote that fails the turn check', async () => {
    mockChat.mockResolvedValueOnce(sheet())
    const result = await scoreTranscript('Backend engineer', turns)

    expect(result.overallScore).toBe(3)
    expect(result.verdict).toBe('HIRE')
    expect(result.scores).toHaveLength(5)
    expect(result.scores.find((s) => s.skill === 'TECHNICAL_DEPTH')).toMatchObject({
      quote: 'It cut p95 latency',
      turnId: 'turn-1',
    })
    expect(result.scores.find((s) => s.skill === 'CLARITY')).toMatchObject({ quote: null, turnId: null })
    expect(result.droppedQuotes).toEqual([{ skill: 'CLARITY', quote: 'Why Redis and not Memcached', turnIndex: 2 }])
  })

  it('asks once more when a skill is missing', async () => {
    mockChat.mockResolvedValueOnce(sheet(['TECHNICAL_DEPTH'])).mockResolvedValueOnce(sheet())
    const result = await scoreTranscript('Backend engineer', turns)
    expect(mockChat).toHaveBeenCalledTimes(2)
    expect(result.scores).toHaveLength(5)
  })

  it('fails after two invalid replies', async () => {
    mockChat.mockResolvedValue('not json')
    await expect(scoreTranscript('Backend engineer', turns)).rejects.toThrow()
    expect(mockChat).toHaveBeenCalledTimes(2)
  })

  it('gives every skill 1 without calling the LLM when there are no answers', async () => {
    const result = await scoreTranscript('Backend engineer', [turns[0]!])
    expect(mockChat).not.toHaveBeenCalled()
    expect(result.verdict).toBe('STRONG_NO_HIRE')
    expect(result.scores.every((s) => s.score === 1)).toBe(true)
  })
})
