// Interviewer questions and scoring calls: DeepSeek, with Claude as backup.
import type { Difficulty, Speaker } from '@deepdive/shared'
import { requireEnv } from '../env.ts'
import { claudeChat, claudeConfigured } from './claude.ts'
import { UpstreamError, isRetryableStatus, withRetry } from './retry.ts'

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'
const MODEL = 'deepseek-chat'
const TIMEOUT_MS = 20_000
const CLAUDE_TIMEOUT_MS = 30_000 // longer: Claude thinks before answering
// After a DeepSeek failure, use Claude for this long, then try DeepSeek again.
const COOLDOWN_MS = 60_000

let deepseekDownUntil = 0

export function deepseekConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY?.trim())
}

export function markDeepSeekDown(reason: string): void {
  if (Date.now() >= deepseekDownUntil) {
    console.warn(`LLM: DeepSeek unavailable (${reason}); using Claude for the next ${COOLDOWN_MS / 1000} s`)
  }
  deepseekDownUntil = Date.now() + COOLDOWN_MS
}

export interface TranscriptLine {
  speaker: Speaker
  text: string
}

const DIFFICULTY_GUIDE: Record<Difficulty, string> = {
  EASY: 'Be friendly. Ask open questions about what they built and how it works.',
  MEDIUM: 'Ask why they made key decisions, which alternatives they considered, and how they checked the result.',
  HARD: 'Probe deeply: push on trade-offs, failure cases, numbers and what they did themselves. Challenge claims that have no evidence.',
}

// Fixed opening, so the interview starts without an LLM call.
export function openingQuestion(): string {
  return 'Hi, thanks for joining. To start, tell me about one project you worked on: what problem it solved, and what you built yourself.'
}

export async function nextQuestion(role: string, difficulty: Difficulty, transcript: TranscriptLine[]): Promise<string> {
  const system = [
    `You are interviewing a candidate for a ${role} position. The candidate is explaining a project they worked on.`,
    `Difficulty: ${DIFFICULTY_GUIDE[difficulty]}`,
    'Write the next thing the interviewer says: exactly one follow-up question about their project, based on what they just said.',
    'Rules:',
    '- Refer to something specific from their answers.',
    '- One question, at most two short sentences, in a natural spoken style. It will be read aloud.',
    '- No markdown, no lists, no quotation marks, and no praise or feedback such as "Great answer".',
    '- Never answer for the candidate or give hints.',
    '- If the last answer was vague, off-topic or empty, ask them to be specific.',
  ].join('\n')
  const lines = transcript.map((t) => `${t.speaker === 'INTERVIEWER' ? 'Interviewer' : 'Candidate'}: ${t.text}`)
  const user = `Transcript so far:\n${lines.join('\n')}\n\nWrite the interviewer's next question.`

  const text = await chat(system, user, { maxTokens: 150 })
  return cleanForSpeech(text)
}

interface ChatOptions {
  maxTokens: number
  json?: boolean // reply is one JSON object
  timeoutMs?: number
}

// DeepSeek first; Claude if it fails or failed within COOLDOWN_MS (when a key is set).
export async function chat(system: string, user: string, options: ChatOptions): Promise<string> {
  if (deepseekConfigured() && Date.now() >= deepseekDownUntil) {
    try {
      return await deepseekChat(system, user, options)
    } catch (err) {
      if (!claudeConfigured()) throw err
      markDeepSeekDown((err as Error).message)
    }
  } else if (!claudeConfigured()) {
    return deepseekChat(system, user, options) // no backup configured
  }
  return claudeChat(system, user, { json: options.json ?? false, timeoutMs: options.timeoutMs ?? CLAUDE_TIMEOUT_MS })
}

async function deepseekChat(system: string, user: string, options: ChatOptions): Promise<string> {
  const apiKey = requireEnv('DEEPSEEK_API_KEY')
  return withRetry(
    async (signal) => {
      let res: Response
      try {
        res = await fetch(DEEPSEEK_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            temperature: options.json ? 0.2 : 0.7, // lower temperature for consistent scoring
            max_tokens: options.maxTokens,
            ...(options.json && { response_format: { type: 'json_object' } }),
          }),
          signal,
        })
      } catch (err) {
        throw new UpstreamError('LLM', (err as Error).message, true)
      }
      if (!res.ok) {
        throw new UpstreamError('LLM', `HTTP ${res.status} ${await res.text()}`, isRetryableStatus(res.status))
      }
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] }
      const content = body.choices?.[0]?.message?.content?.trim()
      if (!content) throw new UpstreamError('LLM', 'empty reply', true)
      return content
    },
    { attempts: 2, timeoutMs: options.timeoutMs ?? TIMEOUT_MS },
  )
}

// Strip markdown, an "Interviewer:" label and wrapping quotes.
function cleanForSpeech(text: string): string {
  const unquote = (s: string) => s.trim().replace(/^["“]+|["”]+$/g, '').trim()
  const plain = unquote(text.replace(/[*_`#]/g, '').replace(/\s+/g, ' '))
  return unquote(plain.replace(/^interviewer\s*:\s*/i, ''))
}
