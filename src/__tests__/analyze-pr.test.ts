import { describe, it, expect, vi } from 'vitest'
import { runPRAnalysis } from '../analyze-pr'
import { MockLLMClient } from '../llm'
import type { PRAnalyzerDependencies, GitHubClient } from '../types'

const mockConfig = {
  frontRepoPath: '/mock/front',
  e2eRepoPath: '/mock/e2e',
  model: 'test-model',
  maxTokens: 100,
  temperature: 0.1,
  repeatPenalty: 1.0,
}

function makeDeps(overrides: Partial<PRAnalyzerDependencies> = {}): PRAnalyzerDependencies {
  const mockGitHub: GitHubClient = {
    getPRDiff: vi.fn().mockResolvedValue('mock diff content'),
    getFileContent: vi.fn().mockResolvedValue(''),
    postComment: vi.fn().mockResolvedValue(undefined),
  }

  return {
    config: mockConfig,
    llmClient: new MockLLMClient(['analysis result']),
    specsReader: { readSpecs: () => [{ name: 'test.spec.ts', content: 'it("works")' }] },
    githubClient: mockGitHub,
    ...overrides,
  }
}

describe('runPRAnalysis', () => {
  it('should post a comment after analysis', async () => {
    const deps = makeDeps()

    await runPRAnalysis(deps, 42)

    expect(deps.githubClient.postComment).toHaveBeenCalledWith(
      42,
      expect.stringContaining('analysis result')
    )
  })

  it('should include the model name in the posted comment', async () => {
    const deps = makeDeps({ config: { ...mockConfig, model: 'llama3.2' } })

    await runPRAnalysis(deps, 5)

    expect(deps.githubClient.postComment).toHaveBeenCalledWith(
      5,
      expect.stringContaining('llama3.2')
    )
  })

  it('should not post a comment when the PR has no diff', async () => {
    const mockGitHub: GitHubClient = {
      getPRDiff: vi.fn().mockResolvedValue('   '),
      getFileContent: vi.fn().mockResolvedValue(''),
      postComment: vi.fn(),
    }
    const deps = makeDeps({ githubClient: mockGitHub })

    await runPRAnalysis(deps, 1)

    expect(mockGitHub.postComment).not.toHaveBeenCalled()
  })

  it('should call getPRDiff with the correct PR number', async () => {
    const deps = makeDeps()

    await runPRAnalysis(deps, 99)

    expect(deps.githubClient.getPRDiff).toHaveBeenCalledWith(99)
  })
})
