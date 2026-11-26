// Interviewer questions with DeepSeek (OpenAI-compatible chat completions API), or with
// Claude when DeepSeek is unavailable (claude.ts).
// Scoring (scoring.ts) uses the same chat() call in JSON mode.
import type { Difficulty, Speaker } from '@deepdive/shared'
import { requireEnv } from '../env.ts'
import { claudeChat, claudeConfigured } from './claude.ts'
import { UpstreamError, isRetryableStatus, withRetry } from './retry.ts'

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'
const MODEL = 'deepseek-chat'
const TIMEOUT_MS = 20_000
const CLAUDE_TIMEOUT_MS = 30_000 // Claude thinks before answering, so it gets longer
// After DeepSeek fails, calls go straight to Claude for this long; the next call after it
// tries DeepSeek again, so the interview goes back to DeepSeek once it recovers.
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

// What each difficulty asks the interviewer to do.
const DIFFICULTY_GUIDE: Record<Difficulty, string> = {
  EASY: 'Be friendly. Ask open questions about what they built and how it works.',
  MEDIUM: 'Ask why they made key decisions, which alternatives they considered, and how they checked the result.',
  HARD: 'Probe deeply: push on trade-offs, failure cases, numbers and what they did themselves. Challenge claims that have no evidence.',
}

// The first question is always the same, so the interview starts without waiting for the LLM.
export function openingQuestion(): string {
  return 'Hi, thanks for joining. To start, tell me about one project you worked on: what problem it solved, and what you built yourself.'
}

// Writes the interviewer's next question from the transcript so far.
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
  json?: boolean // reply is one JSON object (the prompt must mention JSON)
  timeoutMs?: number
}

// One LLM call. DeepSeek answers by default; if it fails, or failed in the last minute,
// Claude answers with the same prompts. Without an Anthropic key,
// DeepSeek's error is thrown as before.
export async function chat(system: string, user: string, options: ChatOptions): Promise<string> {
  if (deepseekConfigured() && Date.now() >= deepseekDownUntil) {
    try {
      return await deepseekChat(system, user, options)
    } catch (err) {
      if (!claudeConfigured()) throw err
      markDeepSeekDown((err as Error).message)
    }
  } else if (!claudeConfigured()) {
    return deepseekChat(system, user, options) // nothing else to try
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
            temperature: options.json ? 0.2 : 0.7, // scoring should be repeatable
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

// The question is spoken by TTS and shown as a caption: drop markdown symbols,
// a leading "Interviewer:" label and wrapping quotes the model sometimes adds.
function cleanForSpeech(text: string): string {
  const unquote = (s: string) => s.trim().replace(/^["“]+|["”]+$/g, '').trim()
  const plain = unquote(text.replace(/[*_`#]/g, '').replace(/\s+/g, ' '))
  return unquote(plain.replace(/^interviewer\s*:\s*/i, ''))
}
