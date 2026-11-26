import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

// DeepSeek is a stubbed fetch; Claude is mocked. No real API is called.
vi.mock('../src/services/claude.ts', () => ({
  CLAUDE_MODEL: 'claude-test',
  claudeChat: vi.fn(async () => 'from Claude'),
  claudeConfigured: vi.fn(() => true),
}))
process.env.DEEPSEEK_API_KEY = 'test-key' // set before dotenv runs, so server/.env does not replace it

const { claudeChat, claudeConfigured } = await import('../src/services/claude.ts')
const { chat } = await import('../src/services/llm.ts')

const deepseekReply = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
const fetchMock = vi.fn<typeof fetch>()

describe('chat: DeepSeek first, Claude as the backup', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.mocked(claudeChat).mockClear()
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers({ toFake: ['Date'] })
  })
  afterAll(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('without an Anthropic key, throws the DeepSeek error as before', async () => {
    vi.mocked(claudeConfigured).mockReturnValueOnce(false)
    fetchMock.mockResolvedValueOnce(new Response('bad key', { status: 401 }))
    await expect(chat('system', 'user', { maxTokens: 10 })).rejects.toThrow('HTTP 401')
    expect(claudeChat).not.toHaveBeenCalled()
  })

  it('sends the same prompts to Claude when DeepSeek fails', async () => {
    fetchMock.mockResolvedValueOnce(new Response('bad key', { status: 401 }))
    expect(await chat('system', 'user', { maxTokens: 10, json: true })).toBe('from Claude')
    expect(claudeChat).toHaveBeenCalledWith('system', 'user', { json: true, timeoutMs: 30_000 })
  })

  it('skips DeepSeek for a minute after it failed', async () => {
    expect(await chat('system', 'user', { maxTokens: 10 })).toBe('from Claude')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('tries DeepSeek again after the minute', async () => {
    vi.setSystemTime(Date.now() + 61_000)
    fetchMock.mockResolvedValueOnce(deepseekReply('from DeepSeek'))
    expect(await chat('system', 'user', { maxTokens: 10 })).toBe('from DeepSeek')
    expect(claudeChat).not.toHaveBeenCalled()
  })
})
