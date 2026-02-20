import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  sha256,
  makeOrgId,
  makeRepoId,
  makePRId,
  makeASTChunkId,
  makeSpecChunkId,
  makeJSXChangeId,
  makeComponentId,
  Neo4jRepository,
} from '../neo4j'
import type { JSXChange } from '../types'

// ─── Helpers: SHA256 IDs ──────────────────────────────────

describe('Content-addressable ID helpers', () => {
  it('sha256 returns deterministic 40-char hex', () => {
    const id = sha256('hello')
    expect(id).toHaveLength(40)
    expect(id).toMatch(/^[0-9a-f]+$/)
    expect(sha256('hello')).toBe(id) // deterministic
  })

  it('same inputs produce same org ID', () => {
    expect(makeOrgId('devedux')).toBe(makeOrgId('devedux'))
  })

  it('different inputs produce different org IDs', () => {
    expect(makeOrgId('devedux')).not.toBe(makeOrgId('other-org'))
  })

  it('makeRepoId includes org name', () => {
    const r1 = makeRepoId('devedux', 'poc-front-app')
    const r2 = makeRepoId('other-org', 'poc-front-app')
    expect(r1).not.toBe(r2)
  })

  it('makePRId is deterministic', () => {
    const repoId = makeRepoId('devedux', 'poc-front-app')
    expect(makePRId(repoId, 42)).toBe(makePRId(repoId, 42))
    expect(makePRId(repoId, 42)).not.toBe(makePRId(repoId, 43))
  })

  it('makeASTChunkId uses filename and rawDiff', () => {
    const id1 = makeASTChunkId('src/Button.tsx', '+const x = 1')
    const id2 = makeASTChunkId('src/Button.tsx', '+const x = 2')
    expect(id1).not.toBe(id2)
  })

  it('makeSpecChunkId is content-addressable', () => {
    const content = 'test("should render", () => {})'
    expect(makeSpecChunkId(content)).toBe(makeSpecChunkId(content))
  })

  it('makeJSXChangeId is content-addressable', () => {
    const change: JSXChange = {
      element: 'Button',
      attribute: 'data-test-id',
      addedValue: 'checkout-button',
      removedValue: 'checkout-btn',
    }
    const id1 = makeJSXChangeId(change)
    const id2 = makeJSXChangeId({ ...change })
    expect(id1).toBe(id2)
  })

  it('makeJSXChangeId differs when values differ', () => {
    const base: JSXChange = { element: 'Btn', attribute: 'data-test-id', addedValue: 'a' }
    const changed: JSXChange = { element: 'Btn', attribute: 'data-test-id', addedValue: 'b' }
    expect(makeJSXChangeId(base)).not.toBe(makeJSXChangeId(changed))
  })

  it('makeComponentId includes repo name for scoping', () => {
    const c1 = makeComponentId('devedux/poc-front-app', 'Button')
    const c2 = makeComponentId('other-org/other-repo', 'Button')
    expect(c1).not.toBe(c2)
  })
})

// ─── Neo4jRepository: unit tests with mock driver ─────────

function makeMockTransaction() {
  const calls: { query: string; params: Record<string, unknown> }[] = []
  const tx = {
    run: vi.fn().mockImplementation((query: string, params: Record<string, unknown>) => {
      calls.push({ query, params })
      return Promise.resolve({ records: [] })
    }),
    _calls: calls,
  }
  return tx
}

function makeMockDriver(tx: ReturnType<typeof makeMockTransaction>) {
  const session = {
    writeTransaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
      fn(tx)
    ),
    close: vi.fn().mockResolvedValue(undefined),
  }

  return {
    session: vi.fn().mockReturnValue(session),
    verifyConnectivity: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    _session: session,
  }
}

describe('Neo4jRepository', () => {
  let tx: ReturnType<typeof makeMockTransaction>
  let driver: ReturnType<typeof makeMockDriver>
  let repo: Neo4jRepository

  beforeEach(() => {
    tx = makeMockTransaction()
    driver = makeMockDriver(tx)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repo = new Neo4jRepository(driver as any)
  })

  describe('mergeOrg', () => {
    it('returns deterministic SHA256 id', async () => {
      const id = await repo.mergeOrg('devedux')
      expect(id).toBe(makeOrgId('devedux'))
    })

    it('runs MERGE with correct params', async () => {
      await repo.mergeOrg('devedux')
      const call = tx.run.mock.calls[0]
      expect(call[0]).toContain('MERGE (n:Org {id: $id})')
      expect(call[1]).toMatchObject({ id: makeOrgId('devedux'), name: 'devedux', platform: 'github' })
    })
  })

  describe('mergeRepo', () => {
    it('creates repo and OWNS relationship', async () => {
      const orgId = makeOrgId('devedux')
      const repoId = await repo.mergeRepo(orgId, 'devedux', 'devedux/poc-front-app')

      expect(repoId).toBe(makeRepoId('devedux', 'poc-front-app'))
      // Should have run 2 queries: MERGE repo + MERGE relationship
      expect(tx.run).toHaveBeenCalledTimes(2)
    })

    it('extracts repo name from fullName', async () => {
      const orgId = makeOrgId('devedux')
      await repo.mergeRepo(orgId, 'devedux', 'devedux/poc-front-app')
      const repoCall = tx.run.mock.calls[0]
      expect(repoCall[1]).toMatchObject({ name: 'poc-front-app', fullName: 'devedux/poc-front-app' })
    })
  })

  describe('mergePullRequest', () => {
    it('creates PR with all metadata', async () => {
      const repoId = makeRepoId('devedux', 'poc-front-app')
      const meta = {
        prNumber: 42,
        title: 'feat: add checkout button',
        description: 'Added new button',
        author: 'alice',
        branch: 'feat/checkout',
        commitSha: 'abc123',
        baseSha: 'def456',
        createdAt: '2024-01-01T00:00:00Z',
        mergedAt: null,
      }

      const prId = await repo.mergePullRequest(repoId, meta)
      expect(prId).toBe(makePRId(repoId, 42))
      expect(tx.run).toHaveBeenCalledTimes(2) // MERGE PR + MERGE relationship
    })
  })

  describe('mergeASTChunk', () => {
    it('creates ASTChunk with embedding and INCLUDES relationship', async () => {
      const chunk = {
        filename: 'src/Button.tsx',
        rawDiff: '+export const Button = () => <button>Click</button>',
        summary: 'Added Button component',
        components: ['Button'],
        functions: [],
        jsxChanges: [],
        testIds: ['checkout-btn'],
        hunks: [],
      }
      const embedding = new Array(768).fill(0.1)

      const id = await repo.mergeASTChunk('run-123', 0, chunk, embedding)
      expect(id).toBe(makeASTChunkId(chunk.filename, chunk.rawDiff))
      expect(tx.run).toHaveBeenCalledTimes(2)

      const astCall = tx.run.mock.calls[0]
      expect(astCall[1]).toMatchObject({
        filename: 'src/Button.tsx',
        components: ['Button'],
        testIds: ['checkout-btn'],
      })
      expect(astCall[1].embedding).toHaveLength(768)
    })
  })

  describe('mergeSpecChunk', () => {
    it('creates SpecChunk with e2e type by default', async () => {
      const chunk = {
        testName: 'should show checkout button',
        filename: 'checkout.spec.ts',
        content: 'test("should show checkout button", () => {})',
      }
      const embedding = new Array(768).fill(0.2)

      const id = await repo.mergeSpecChunk(chunk, embedding)
      expect(id).toBe(makeSpecChunkId(chunk.content))

      const call = tx.run.mock.calls[0]
      expect(call[1]).toMatchObject({ type: 'e2e', framework: 'playwright' })
    })
  })

  describe('createMatchRelationship', () => {
    it('sets all 3 scores on the relationship', async () => {
      await repo.createMatchRelationship('ast-id', 'spec-id', {
        cosineScore: 0.92,
        bm25Score: 14.3,
        rrfScore: 0.031,
        rank: 1,
      })

      const call = tx.run.mock.calls[0]
      expect(call[1]).toMatchObject({
        cosineScore: 0.92,
        bm25Score: 14.3,
        rrfScore: 0.031,
      })
      expect(call[0]).toContain('r.cosineScore = $cosineScore')
      expect(call[0]).toContain('r.bm25Score = $bm25Score')
      expect(call[0]).toContain('r.rrfScore = $rrfScore')
    })
  })

  describe('createLLMPrediction', () => {
    it('creates prediction with all counts', async () => {
      const id = await repo.createLLMPrediction('run-123', {
        rawMarkdown: '## broken\n- test1',
        brokenCount: 2,
        riskCount: 1,
        okCount: 5,
        model: 'llama3.2',
        durationMs: 3000,
      })

      expect(id).toMatch(/^[0-9a-f-]{36}$/) // UUID
      expect(tx.run).toHaveBeenCalledTimes(2)
    })
  })

  describe('verifyConnectivity', () => {
    it('delegates to driver', async () => {
      await repo.verifyConnectivity()
      expect(driver.verifyConnectivity).toHaveBeenCalledOnce()
    })
  })

  describe('close', () => {
    it('closes the driver', async () => {
      await repo.close()
      expect(driver.close).toHaveBeenCalledOnce()
    })
  })
})
