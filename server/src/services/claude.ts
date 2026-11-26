// Claude (Anthropic Messages API): the backup LLM when DeepSeek is unavailable.
// It gets exactly the same system and user prompts as DeepSeek (see llm.ts chat()).
import Anthropic from '@anthropic-ai/sdk'
import { UpstreamError } from './retry.ts'

export const CLAUDE_MODEL = 'claude-opus-5-5'

// Created on first use, so the server starts without an Anthropic key.
let client: Anthropic | null = null
const anthropic = () => (client ??= new Anthropic({ maxRetries: 1 }))

export function claudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim())
}

export interface ClaudeOptions {
  json: boolean // the reply must be one JSON object (the prompt already asks for it)
  timeoutMs: number
}

export async function claudeChat(system: string, user: string, { json, timeoutMs }: ClaudeOptions): Promise<string> {
  let message: Anthropic.Beta.BetaMessage
  try {
    message = await anthropic().beta.messages.create(
      {
        model: CLAUDE_MODEL,
        // Thinking is always on for this model and counts towards max_tokens, so the
        // DeepSeek limits (150 tokens for a question) would cut it off; length is set by the prompt.
        max_tokens: 16000,
        // A short spoken question needs little thinking; scoring keeps the model's default.
        output_config: { effort: json ? 'medium' : 'low' },
        // If Claude declines on a safety classifier, the API retries on a suitable fallback model.
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

// DeepSeek's JSON mode returns the bare object; Claude may wrap it in a ```json fence
// or a sentence. Keep only the outermost {...} so scoring parses it the same way.
function jsonObject(text: string): string {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  return start >= 0 && end > start ? text.slice(start, end + 1) : text
}
