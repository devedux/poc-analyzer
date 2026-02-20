import { describe, it, expect, vi, beforeEach } from 'vitest'
import { persistAnalysisRun } from '../graph-persister'
import type { PersistOptions } from '../graph-persister'
import type { ASTChunk, SpecFile, AnalyzeResult, PRMetadata } from '../types'

// ─── Mocks ────────────────────────────────────────────────

vi.mock('../embeddings', () => ({
  embedBatch: vi.fn().mockResolvedValue([new Array(768).fill(0.1)]),
  buildDiffContextualText: vi.fn().mockReturnValue('diff contextual text'),
  buildSpecContextualText: vi.fn().mockReturnValue('spec contextual text'),
}))

vi.mock('../spec-chunker', () => ({
  chunkSpecs: vi.fn().mockReturnValue([
    {
      testName: 'should show checkout button',
      filename: 'checkout.spec.ts',
      content: 'test("should show checkout button", () => {})',
    },
  ]),
}))

vi.mock('../semantic-matcher', () => ({
  matchChunksDetailed: vi.fn().mockResolvedValue([]),
}))

// ─── Fixtures ─────────────────────────────────────────────

const mockPRMetadata: PRMetadata = {
  prNumber: 42,
  title: 'feat: add checkout button',
  description: 'Added new checkout button component',
  author: 'alice',
  branch: 'feat/checkout',
  commitSha: 'abc123def456',
  baseSha: 'base789xyz',
  createdAt: '2024-01-01T00:00:00Z',
  mergedAt: null,
}

const mockASTChunk: ASTChunk = {
  filename: 'src/Button.tsx',
  rawDiff: '+export const Button = () => <button data-test-id="checkout-btn">Pay</button>',
  hunks: [],
  components: ['Button'],
  functions: [],
  jsxChanges: [
    { element: 'button', attribute: 'data-test-id', addedValue: 'checkout-btn' },
  ],
  testIds: ['checkout-btn'],
  summary: 'Added Button component with checkout-btn test ID',
}

const mockSpecFiles: SpecFile[] = [
  {
    name: 'checkout.spec.ts',
    content: 'test("should show checkout button", () => {})',
  },
]

const mockPredictions: AnalyzeResult[] = [
  {
    test: 'should show checkout button',
    file: 'checkout.spec.ts',
    line: 0,
    status: 'broken',
    reason: 'The test ID changed',
  },
]

function makeMockRepo() {
  return {
    mergeOrg: vi.fn().mockResolvedValue('org-id'),
    mergeRepo: vi.fn().mockResolvedValue('repo-id'),
    mergePullRequest: vi.fn().mockResolvedValue('pr-id'),
    createAnalysisRun: vi.fn().mockResolvedValue('run-uuid-123'),
    mergeASTChunk: vi.fn().mockResolvedValue('ast-chunk-id'),
    mergeSpecChunk: vi.fn().mockResolvedValue('spec-chunk-id'),
    mergeJSXChange: vi.fn().mockResolvedValue('jsx-change-id'),
    createMatchRelationship: vi.fn().mockResolvedValue(undefined),
    createLLMPrediction: vi.fn().mockResolvedValue('prediction-uuid-456'),
    createTestPrediction: vi.fn().mockResolvedValue('test-prediction-id'),
    verifyConnectivity: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }
}

// ─── Tests ────────────────────────────────────────────────

describe('persistAnalysisRun', () => {
  let mockRepo: ReturnType<typeof makeMockRepo>

  beforeEach(() => {
    mockRepo = makeMockRepo()
    vi.clearAllMocks()
  })

  function makeOpts(overrides: Partial<PersistOptions> = {}): PersistOptions {
    return {
      orgName: 'devedux',
      repoFullName: 'devedux/poc-front-app',
      prMetadata: mockPRMetadata,
      astChunks: [mockASTChunk],
      specFiles: mockSpecFiles,
      rawMarkdown: '## 🔴 Tests que fallarán\n#### `should show checkout button` — `checkout.spec.ts`\n**Por qué falla:** test ID changed',
      predictions: mockPredictions,
      model: 'llama3.2',
      temperature: 0.1,
      analysisStartedAt: Date.now() - 5000,
      llmDurationMs: 3000,
      ...overrides,
    }
  }

  it('creates infrastructure nodes in order: Org → Repo → PR', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await persistAnalysisRun(mockRepo as any, makeOpts())

    expect(mockRepo.mergeOrg).toHaveBeenCalledWith('devedux')
    expect(mockRepo.mergeRepo).toHaveBeenCalledWith('org-id', 'devedux', 'devedux/poc-front-app')
    expect(mockRepo.mergePullRequest).toHaveBeenCalledWith('repo-id', mockPRMetadata)
  })

  it('creates AnalysisRun node', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await persistAnalysisRun(mockRepo as any, makeOpts())

    expect(mockRepo.createAnalysisRun).toHaveBeenCalledWith(
      'pr-id',
      expect.objectContaining({
        model: 'llama3.2',
        temperature: 0.1,
        astChunkCount: 1,
        specChunkCount: 1,
      })
    )
  })

  it('returns runId and predictionId', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await persistAnalysisRun(mockRepo as any, makeOpts())

    expect(result.runId).toBe('run-uuid-123')
    expect(result.predictionId).toBe('prediction-uuid-456')
  })

  it('merges ASTChunk with embedding', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await persistAnalysisRun(mockRepo as any, makeOpts())

    expect(mockRepo.mergeASTChunk).toHaveBeenCalledWith(
      'run-uuid-123',
      0,
      mockASTChunk,
      expect.arrayContaining([expect.any(Number)])
    )
  })

  it('persists JSXChange nodes from ASTChunk', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await persistAnalysisRun(mockRepo as any, makeOpts())

    expect(mockRepo.mergeJSXChange).toHaveBeenCalledWith(
      'ast-chunk-id',
      { element: 'button', attribute: 'data-test-id', addedValue: 'checkout-btn' }
    )
  })

  it('merges SpecChunk with embedding', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await persistAnalysisRun(mockRepo as any, makeOpts())

    expect(mockRepo.mergeSpecChunk).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'checkout.spec.ts' }),
      expect.any(Array)
    )
  })

  it('creates LLMPrediction with broken/risk/ok counts', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await persistAnalysisRun(mockRepo as any, makeOpts())

    expect(mockRepo.createLLMPrediction).toHaveBeenCalledWith(
      'run-uuid-123',
      expect.objectContaining({
        brokenCount: 1,
        riskCount: 0,
        okCount: 0,
        model: 'llama3.2',
        durationMs: 3000,
      })
    )
  })

  it('creates TestPrediction for each prediction', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await persistAnalysisRun(mockRepo as any, makeOpts())

    expect(mockRepo.createTestPrediction).toHaveBeenCalledTimes(1)
    expect(mockRepo.createTestPrediction).toHaveBeenCalledWith(
      'prediction-uuid-456',
      expect.anything(), // specId (puede ser string o null)
      mockPredictions[0]
    )
  })

  it('resolves empty file from matching SpecChunk when LLM omits filename (Bug 2)', async () => {
    const predictionWithNoFile: typeof mockPredictions[0] = {
      test: 'should show checkout button', // matches mocked chunkSpecs testName
      file: '', // LLM omitted the filename
      line: 0,
      status: 'broken',
      reason: 'selector renamed',
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await persistAnalysisRun(mockRepo as any, makeOpts({ predictions: [predictionWithNoFile] }))

    // The persister should resolve file from the matching SpecChunk (checkout.spec.ts)
    expect(mockRepo.createTestPrediction).toHaveBeenCalledWith(
      'prediction-uuid-456',
      expect.anything(),
      expect.objectContaining({ file: 'checkout.spec.ts' })
    )
  })

  it('keeps file as-is when LLM provides it (no override)', async () => {
    const predictionWithFile: typeof mockPredictions[0] = {
      test: 'should show checkout button',
      file: 'explicit-file.spec.ts', // LLM provided a filename
      line: 0,
      status: 'broken',
      reason: 'selector renamed',
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await persistAnalysisRun(mockRepo as any, makeOpts({ predictions: [predictionWithFile] }))

    expect(mockRepo.createTestPrediction).toHaveBeenCalledWith(
      'prediction-uuid-456',
      expect.anything(),
      expect.objectContaining({ file: 'explicit-file.spec.ts' })
    )
  })

  it('handles empty astChunks gracefully', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await persistAnalysisRun(mockRepo as any, makeOpts({ astChunks: [] }))

    expect(result.runId).toBe('run-uuid-123')
    expect(mockRepo.mergeASTChunk).not.toHaveBeenCalled()
  })

  it('handles empty predictions gracefully', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await persistAnalysisRun(mockRepo as any, makeOpts({ predictions: [] }))

    expect(mockRepo.createTestPrediction).not.toHaveBeenCalled()
    expect(mockRepo.createLLMPrediction).toHaveBeenCalledWith(
      'run-uuid-123',
      expect.objectContaining({ brokenCount: 0, riskCount: 0, okCount: 0 })
    )
  })
})
