// Scores a finished interview against the fixed rubric (docs/design.md, C5).
//
//   transcript (numbered turns with speakers) + rubric -> DeepSeek (JSON) -> validate
//   -> keep only quotes found in their linked CANDIDATE turn -> weighted score and verdict
//   -> save Report and Scores -> status DONE (or FAILED)
import {
  MAX_SKILL_SCORE,
  MIN_SKILL_SCORE,
  SKILL_WEIGHTS,
  type Skill,
  type Verdict,
} from '@deepdive/shared'
import { prisma } from '../db.ts'
import type { Turn } from '../generated/prisma/client.ts'
import { chat } from './llm.ts'

const SKILLS = Object.keys(SKILL_WEIGHTS) as Skill[]

// Same rubric for every interview, so scores are comparable across sessions.
const RUBRIC = `TECHNICAL_DEPTH: how well they explain how their system works.
  1 = only names technologies; 2 = high-level description; 3 = explains the key mechanisms correctly; 4 = explains mechanisms, their limits and why.
TRADE_OFFS: the choices they made and the alternatives.
  1 = no alternatives; 2 = names alternatives without comparing; 3 = compares alternatives with reasons; 4 = compares with concrete costs and says when the choice would change.
RESULTS_VALIDATION: what the project achieved and how they know.
  1 = no results; 2 = vague claims such as "it was faster"; 3 = concrete numbers or tests; 4 = numbers plus how they were measured and against what baseline.
PERSONAL_CONTRIBUTION: what they did themselves.
  1 = unclear; 2 = mostly "we"; 3 = clear about their own part; 4 = clear about their own decisions and their effect.
CLARITY: how easy the answers are to follow.
  1 = hard to follow; 2 = understandable with effort; 3 = clear and structured; 4 = clear, concise and well structured.`

// Verdict from the weighted score (1-4, one decimal, as shown on the report).
// Computed here, never by the LLM.
const VERDICTS: [min: number, verdict: Verdict][] = [
  [3.3, 'STRONG_HIRE'],
  [2.5, 'HIRE'],
  [1.8, 'NO_HIRE'],
  [MIN_SKILL_SCORE, 'STRONG_NO_HIRE'],
]

export interface ScoredSkill {
  skill: Skill
  score: number
  comment: string
  quote: string | null
  turnId: string | null
}

export interface ScoringResult {
  overallScore: number
  verdict: Verdict
  summary: string
  scores: ScoredSkill[]
  droppedQuotes: { skill: Skill; quote: string; turnIndex: number | null }[] // failed the turn check
}

// One scoring run per interview at a time; a second caller shares the first run.
const running = new Map<string, Promise<boolean>>()

// Scores the interview and saves the report. Resolves true when the interview is DONE,
// false when it ended up FAILED. Never throws.
export function scoreInterview(interviewId: string): Promise<boolean> {
  let run = running.get(interviewId)
  if (!run) {
    run = runScoring(interviewId).finally(() => running.delete(interviewId))
    running.set(interviewId, run)
  }
  return run
}

// "Score again" for a FAILED interview: back to SCORING, then score in the background.
// Returns false when the interview is not FAILED.
export async function rescore(interviewId: string): Promise<boolean> {
  const { count } = await prisma.interview.updateMany({
    where: { id: interviewId, status: 'FAILED' },
    data: { status: 'SCORING' },
  })
  if (count === 0) return false
  void scoreInterview(interviewId)
  return true
}

// After a server restart, finish the interviews that were being scored.
export async function resumeScoring(): Promise<void> {
  const waiting = await prisma.interview.findMany({ where: { status: 'SCORING' }, select: { id: true } })
  for (const { id } of waiting) await scoreInterview(id)
}

async function runScoring(interviewId: string): Promise<boolean> {
  try {
    const interview = await prisma.interview.findUniqueOrThrow({
      where: { id: interviewId },
      include: { turns: { orderBy: { index: 'asc' } } },
    })
    const result = await scoreTranscript(interview.role, interview.turns)
    for (const d of result.droppedQuotes) {
      console.log(`scoring ${interviewId}: dropped ${d.skill} quote (turn ${d.turnIndex}): "${d.quote}"`)
    }
    await prisma.$transaction([
      prisma.report.create({
        data: {
          interviewId,
          overallScore: result.overallScore,
          verdict: result.verdict,
          summary: result.summary,
          scores: { create: result.scores },
        },
      }),
      prisma.interview.update({ where: { id: interviewId }, data: { status: 'DONE' } }),
    ])
    return true
  } catch (err) {
    console.error(`scoring ${interviewId} failed:`, err)
    await prisma.interview.update({ where: { id: interviewId }, data: { status: 'FAILED' } }).catch(() => {})
    return false
  }
}

// Asks the LLM up to twice for a valid score sheet, then checks quotes and computes the verdict.
export async function scoreTranscript(role: string, turns: Turn[]): Promise<ScoringResult> {
  if (!turns.some((t) => t.speaker === 'CANDIDATE')) return noAnswers()

  const system = [
    `You score a mock interview for a ${role} position. The candidate explains a project they worked on.`,
    'Score only what the candidate said, using this rubric. Each skill is scored 1, 2, 3 or 4.',
    RUBRIC,
    'Reply with one JSON object and nothing else:',
    '{"summary": "2-3 sentences to the candidate (use \\"you\\"): main strength and what to improve",',
    ' "scores": [{"skill": "TECHNICAL_DEPTH", "score": 3, "comment": "1-2 sentences explaining the score",',
    '             "quote": "the candidate\'s exact words that best support the score", "turnIndex": 3}, ...]}',
    'Rules:',
    `- Exactly one entry per skill: ${SKILLS.join(', ')}.`,
    '- quote: copy at most 25 consecutive words, character for character, from ONE Candidate turn.',
    '  turnIndex is the number of that turn. Never quote the Interviewer. Never join words from different turns.',
    '- If no candidate words support the score, use null for both quote and turnIndex.',
    '- Credit only what the candidate said. A fact stated by the interviewer that the candidate merely agrees with does not count, also in the summary.',
    '- One or two short sentences in total cannot show structure: CLARITY is then at most 2.',
  ].join('\n')
  const transcript = turns
    .map((t) => `[${t.index}] ${t.speaker === 'INTERVIEWER' ? 'Interviewer' : 'Candidate'}: ${t.text}`)
    .join('\n')
  const user = `Transcript (numbered turns):\n${transcript}\n\nScore the candidate. Reply in JSON.`

  let lastError: unknown
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const reply = await chat(system, user, { maxTokens: 1500, json: true, timeoutMs: 60_000 })
      return applyChecks(parseSheet(reply), turns)
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}

interface SheetEntry {
  skill: Skill
  score: number
  comment: string
  quote: string | null
  turnIndex: number | null
}

// Throws unless the reply has a summary and exactly one valid entry per skill.
function parseSheet(reply: string): { summary: string; entries: SheetEntry[] } {
  const data = JSON.parse(reply) as { summary?: unknown; scores?: unknown }
  const summary = typeof data.summary === 'string' ? data.summary.trim() : ''
  if (!summary) throw new Error('scoring reply has no summary')
  if (!Array.isArray(data.scores)) throw new Error('scoring reply has no scores')

  const entries: SheetEntry[] = []
  for (const skill of SKILLS) {
    const found = (data.scores as Record<string, unknown>[]).filter((s) => s.skill === skill)
    if (found.length !== 1) throw new Error(`scoring reply has ${found.length} entries for ${skill}`)
    const { score, comment, quote, turnIndex } = found[0]!
    if (!Number.isInteger(score) || (score as number) < MIN_SKILL_SCORE || (score as number) > MAX_SKILL_SCORE) {
      throw new Error(`scoring reply has an invalid score for ${skill}: ${String(score)}`)
    }
    if (typeof comment !== 'string' || !comment.trim()) throw new Error(`scoring reply has no comment for ${skill}`)
    entries.push({
      skill,
      score: score as number,
      comment: comment.trim(),
      quote: typeof quote === 'string' && quote.trim() ? quote.trim() : null,
      turnIndex: Number.isInteger(turnIndex) ? (turnIndex as number) : null,
    })
  }
  return { summary, entries }
}

function applyChecks(sheet: { summary: string; entries: SheetEntry[] }, turns: Turn[]): ScoringResult {
  const droppedQuotes: ScoringResult['droppedQuotes'] = []
  const scores = sheet.entries.map((entry): ScoredSkill => {
    const turn = checkQuote(entry.quote, entry.turnIndex, turns)
    if (entry.quote && !turn) droppedQuotes.push({ skill: entry.skill, quote: entry.quote, turnIndex: entry.turnIndex })
    return {
      skill: entry.skill,
      score: entry.score,
      comment: entry.comment,
      quote: turn ? entry.quote : null,
      turnId: turn?.id ?? null,
    }
  })
  const overallScore = weightedScore(scores)
  return { overallScore, verdict: verdictFor(overallScore), summary: sheet.summary, scores, droppedQuotes }
}

// The quote is kept only if the linked turn is a CANDIDATE turn of this interview whose
// text contains it as whole words (after normalizing). It is never moved to a different turn.
export function checkQuote(quote: string | null, turnIndex: number | null, turns: Turn[]): Turn | null {
  if (!quote || turnIndex === null) return null
  const turn = turns.find((t) => t.index === turnIndex)
  if (!turn || turn.speaker !== 'CANDIDATE') return null
  const needle = normalize(quote)
  // Spaces on both sides: "ache" must not match inside "cache".
  return needle && ` ${normalize(turn.text)} `.includes(` ${needle} `) ? turn : null
}

// Lower case, straight quotes, no punctuation, single spaces.
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Rounded to one decimal, the precision the report shows, so the verdict never
// disagrees with the number next to it.
export function weightedScore(scores: { skill: Skill; score: number }[]): number {
  const total = scores.reduce((sum, s) => sum + s.score * SKILL_WEIGHTS[s.skill], 0)
  return Math.round(total * 10) / 10
}

export function verdictFor(overallScore: number): Verdict {
  return VERDICTS.find(([min]) => overallScore >= min)![1]
}

// An interview ended before any answer: nothing to send to the LLM.
function noAnswers(): ScoringResult {
  const scores = SKILLS.map((skill) => ({
    skill,
    score: MIN_SKILL_SCORE,
    comment: 'No answer to assess.',
    quote: null,
    turnId: null,
  }))
  return {
    overallScore: MIN_SKILL_SCORE,
    verdict: 'STRONG_NO_HIRE',
    summary: 'The interview ended before you answered any question, so there was nothing to score.',
    scores,
    droppedQuotes: [],
  }
}
