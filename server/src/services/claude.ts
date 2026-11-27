// Claude: backup LLM when DeepSeek is unavailable (same prompts).
import Anthropic from '@anthropic-ai/sdk'
import { UpstreamError } from './retry.ts'

export const CLAUDE_MODEL = 'claude-opus-5-5'

// Created on first use, so no key is needed to start.
let client: Anthropic | null = null
const anthropic = () => (client ??= new Anthropic({ maxRetries: 1 }))

export function claudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim())
}

export interface ClaudeOptions {
  json: boolean // reply must be one JSON object
  timeoutMs: number
}

export async function claudeChat(system: string, user: string, { json, timeoutMs }: ClaudeOptions): Promise<string> {
  let message: Anthropic.Beta.BetaMessage
  try {
    message = await anthropic().beta.messages.create(
      {
        model: CLAUDE_MODEL,
        // Thinking counts toward max_tokens; the prompt limits the length.
        max_tokens: 16000,
        output_config: { effort: json ? 'medium' : 'low' },
        // Fall back to another model if a safety filter refuses.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system,
        messages: [{ role: 'user', content: user }],
      },
      { timeout: timeoutMs },
    )
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      const status = err.status ?? 0
      throw new UpstreamError('Claude', `HTTP ${status} ${err.message}`, status === 0 || status === 429 || status >= 500)
    }
    throw new UpstreamError('Claude', (err as Error).message, true)
  }
  if (message.stop_reason === 'refusal') throw new UpstreamError('Claude', 'declined the request', false)

  const text = message.content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('')
    .trim()
  if (!text) throw new UpstreamError('Claude', 'empty reply', true)
  return json ? jsonObject(text) : text
}

// Claude may wrap JSON in a fence or text; extract the outermost {...}.
function jsonObject(text: string): string {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  return start >= 0 && end > start ? text.slice(start, end + 1) : text
}
