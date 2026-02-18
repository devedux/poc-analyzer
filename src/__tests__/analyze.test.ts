import { describe, it, expect } from 'vitest'
import { runAnalysis, collectStream } from '../analyze'
import { MockLLMClient } from '../llm'
import type { AnalyzerDependencies, LLMResponse } from '../types'

const mockConfig = {
  frontRepoPath: '/mock/front',
  e2eRepoPath: '/mock/e2e',
  model: 'test-model',
  maxTokens: 100,
  temperature: 0.1,
  repeatPenalty: 1.0,
}

const mockDeps: AnalyzerDependencies = {
  config: mockConfig,
  llmClient: new MockLLMClient(['test response']),
  git: { getDiff: () => 'mock diff', getDiffFromCommit: () => '' },
  specsReader: { readSpecs: () => [{ name: 'test.spec.ts', content: 'it("works")' }] },
}

describe('runAnalysis', () => {
  it('should return empty string when there is no diff', async () => {
    const deps: AnalyzerDependencies = {
      ...mockDeps,
      git: { getDiff: () => '', getDiffFromCommit: () => '' },
    }

    const result = await runAnalysis(deps)

    expect(result).toBe('')
  })

  it('should return full response when diff exists', async () => {
    const result = await runAnalysis(mockDeps)

    expect(result).toBe('test response')
  })

  it('should call onChunk with each streaming chunk', async () => {
    const chunks: string[] = []
    const deps: AnalyzerDependencies = {
      ...mockDeps,
      llmClient: new MockLLMClient(['chunk1', 'chunk2']),
    }

    await runAnalysis(deps, { onChunk: (c) => chunks.push(c) })

    expect(chunks).toEqual(['chunk1', 'chunk2'])
  })
})

describe('collectStream', () => {
  async function* makeStream(chunks: string[], doneContent: string): AsyncGenerator<LLMResponse> {
    for (const content of chunks) {
      yield { message: { role: 'assistant', content }, done: false }
    }
    yield { message: { role: 'assistant', content: doneContent }, done: true }
  }

  it('should return the content of the done chunk', async () => {
    const result = await collectStream(makeStream(['a', 'b'], 'ab'))

    expect(result).toBe('ab')
  })

  it('should call onChunk only for non-done chunks', async () => {
    const chunks: string[] = []

    await collectStream(makeStream(['x', 'y'], 'xy'), (c) => chunks.push(c))

    expect(chunks).toEqual(['x', 'y'])
  })

  it('should fall back to accumulated content when no done chunk arrives', async () => {
    async function* streamWithoutDone(): AsyncGenerator<LLMResponse> {
      yield { message: { role: 'assistant', content: 'hello' }, done: false }
      yield { message: { role: 'assistant', content: ' world' }, done: false }
    }

    const result = await collectStream(streamWithoutDone())

    expect(result).toBe('hello world')
  })
})
