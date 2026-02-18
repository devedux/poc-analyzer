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

  it('should call getFileContent for each code file in the diff', async () => {
    const multiFileDiff = [
      'diff --git a/app/components/Checkout.tsx b/app/components/Checkout.tsx',
      'index 000..111 100644',
      '--- a/app/components/Checkout.tsx',
      '+++ b/app/components/Checkout.tsx',
      '@@ -1,3 +1,3 @@',
      '-const x = 1',
      '+const x = 2',
      ' const y = 3',
      'diff --git a/app/components/Cart.tsx b/app/components/Cart.tsx',
      'index 000..222 100644',
      '--- a/app/components/Cart.tsx',
      '+++ b/app/components/Cart.tsx',
      '@@ -1,3 +1,3 @@',
      '-const a = 1',
      '+const a = 2',
      ' const b = 3',
    ].join('\n')

    const mockGitHub: GitHubClient = {
      getPRDiff: vi.fn().mockResolvedValue(multiFileDiff),
      getFileContent: vi.fn().mockResolvedValue('export const x = 2'),
      postComment: vi.fn().mockResolvedValue(undefined),
    }
    const deps = makeDeps({ githubClient: mockGitHub })

    await runPRAnalysis(deps, 7)

    expect(mockGitHub.getFileContent).toHaveBeenCalledWith(
      'app/components/Checkout.tsx',
      'refs/pull/7/head'
    )
    expect(mockGitHub.getFileContent).toHaveBeenCalledWith(
      'app/components/Cart.tsx',
      'refs/pull/7/head'
    )
    expect(mockGitHub.getFileContent).toHaveBeenCalledTimes(2)
  })

  it('should still post a comment if one file fails to fetch', async () => {
    const multiFileDiff = [
      'diff --git a/app/components/Checkout.tsx b/app/components/Checkout.tsx',
      'index 000..111 100644',
      '--- a/app/components/Checkout.tsx',
      '+++ b/app/components/Checkout.tsx',
      '@@ -1,3 +1,3 @@',
      '-const x = 1',
      '+const x = 2',
      ' const y = 3',
      'diff --git a/app/components/Cart.tsx b/app/components/Cart.tsx',
      'index 000..222 100644',
      '--- a/app/components/Cart.tsx',
      '+++ b/app/components/Cart.tsx',
      '@@ -1,3 +1,3 @@',
      '-const a = 1',
      '+const a = 2',
      ' const b = 3',
    ].join('\n')

    const mockGitHub: GitHubClient = {
      getPRDiff: vi.fn().mockResolvedValue(multiFileDiff),
      getFileContent: vi.fn()
        .mockResolvedValueOnce('export const x = 2')
        .mockRejectedValueOnce(new Error('404 Not Found')),
      postComment: vi.fn().mockResolvedValue(undefined),
    }
    const deps = makeDeps({ githubClient: mockGitHub })

    await runPRAnalysis(deps, 8)

    expect(mockGitHub.postComment).toHaveBeenCalledTimes(1)
  })
})
