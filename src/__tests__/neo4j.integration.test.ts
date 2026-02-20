/**
 * Tests de integración con Neo4j real.
 *
 * Comportamiento:
 *  - Si NEO4J_URI no está seteado → todos los tests se saltean (skip)
 *  - Si NEO4J_URI está seteado pero Neo4j no responde → skip con warning (no FAIL)
 *  - Si Neo4j está disponible → corren todos los tests y limpian al final
 *
 * Para correrlos localmente:
 *   docker compose up -d
 *   # esperar ~30s a que Neo4j arranque, luego:
 *   NEO4J_URI=bolt://localhost:7687 NEO4J_USER=neo4j NEO4J_PASSWORD=password npm test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import neo4j from 'neo4j-driver'
import {
  Neo4jRepository,
  createNeo4jDriver,
  makeOrgId,
  makeRepoId,
  makePRId,
  makeASTChunkId,
  makeSpecChunkId,
  makeJSXChangeId,
} from '../neo4j'
import { persistAnalysisRun } from '../graph-persister'
import {
  PR_AUTH_REFACTOR,
  AUTH_CONTEXT_CHUNK,
  USE_AUTH_HOOK_CHUNK,
  PRIVATE_ROUTE_HOC_CHUNK,
  AUTH_SPEC_FILES,
  AUTH_PREDICTIONS,
  PR_PAYMENT_MIGRATION,
  PAYMENT_SERVICE_CHUNK,
  WITH_PAYMENT_HOF_CHUNK,
  PAYMENT_FORM_CHUNK,
  PAYMENT_SPEC_FILES,
  PAYMENT_PREDICTIONS,
  PR_API_CONFIG,
  API_CONFIG_CHUNK,
  USE_FETCH_HOOK_CHUNK,
  USER_LIST_CHUNK,
  API_SPEC_FILES,
  API_PREDICTIONS,
  PR_TANSTACK_QUERY,
  QUERY_KEYS_CHUNK,
  USE_PRODUCT_QUERY_CHUNK,
  PRODUCT_CARD_CHUNK,
  TANSTACK_SPEC_FILES,
  TANSTACK_PREDICTIONS,
  PR_STYLED_COMPONENTS,
  THEME_TOKENS_CHUNK,
  STYLED_BUTTON_CHUNK,
  ALERT_BANNER_CHUNK,
  STYLED_SPEC_FILES,
  STYLED_PREDICTIONS,
  PR_RADIX_DIALOG,
  RADIX_DIALOG_CHUNK,
  CONFIRMATION_MODAL_CHUNK,
  RADIX_SPEC_FILES,
  RADIX_PREDICTIONS,
  PR_MONOREPO,
  UI_PKG_BUTTON_CHUNK,
  DASHBOARD_CHECKOUT_CHUNK,
  ADMIN_ORDERS_CHUNK,
  MONOREPO_SPEC_FILES,
  MONOREPO_PREDICTIONS,
} from './fixtures/react-pr-scenarios'

// ─── Configuración de conexión ─────────────────────────────

const NEO4J_URI = process.env.NEO4J_URI
const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j'
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? 'password'

const TEST_ORG = 'test-devedux-integration'
const TEST_REPO = 'test-devedux-integration/poc-front-app'

// ─── Estado compartido entre suites ───────────────────────

let repo: Neo4jRepository
let isConnected = false

// ─── Helpers ──────────────────────────────────────────────

/**
 * Reintenta verifyConnectivity con backoff exponencial.
 * Neo4j 5.x tarda ~30s en arrancar desde docker.
 */
async function waitForNeo4j(
  r: Neo4jRepository,
  maxAttempts = 15,
  initialDelayMs = 2000
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await r.verifyConnectivity()
      return
    } catch {
      if (attempt === maxAttempts - 1) {
        throw new Error(`Neo4j not ready after ${maxAttempts} attempts (${(maxAttempts * initialDelayMs) / 1000}s)`)
      }
      const delay = initialDelayMs * Math.min(2 ** attempt, 8) // cap en 8x
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

/**
 * Elimina todos los nodos de test (Org → grafo completo) en una sola query.
 */
async function deleteTestNodes(): Promise<void> {
  const orgId = makeOrgId(TEST_ORG)
  // Primero desconectar y borrar los nodos hoja para evitar violaciones de constraint
  await repo.runCypher(
    `MATCH (o:Org {id: $orgId})
     OPTIONAL MATCH (o)-[:OWNS|HAS_PR|ANALYZED_BY|PRODUCED|CONTAINS|INCLUDES|HAS_JSX_CHANGE|MATCHED|REFERS_TO*1..10]->(n)
     WITH o, collect(DISTINCT n) AS connected
     FOREACH (node IN connected | DETACH DELETE node)
     DETACH DELETE o`,
    { orgId }
  )
}

/**
 * Helper de test que salta si Neo4j no está disponible.
 * Recibe el test context de Vitest para llamar ctx.skip().
 */
function neo4jIt(name: string, fn: () => Promise<void>, timeoutMs = 15_000) {
  return it(name, async (ctx) => {
    if (!isConnected) return ctx.skip()
    await fn()
  }, timeoutMs)
}

/**
 * Ejecuta una query Cypher y retorna los records.
 */
async function cypher(query: string, params: Record<string, unknown> = {}) {
  return repo.runCypher(query, params)
}

// ─── Setup / Teardown global ───────────────────────────────

/**
 * Aplica los constraints de unicidad necesarios para que MERGE sea verdaderamente
 * idempotente en writes paralelos (Promise.all en graph-persister).
 * Equivalente a ejecutar migrations/001_initial_schema.cypher.
 */
async function applyConstraints(): Promise<void> {
  const constraints = [
    'CREATE CONSTRAINT org_id IF NOT EXISTS FOR (n:Org) REQUIRE n.id IS UNIQUE',
    'CREATE CONSTRAINT repo_id IF NOT EXISTS FOR (n:Repo) REQUIRE n.id IS UNIQUE',
    'CREATE CONSTRAINT pr_id IF NOT EXISTS FOR (n:PullRequest) REQUIRE n.id IS UNIQUE',
    'CREATE CONSTRAINT ast_chunk_id IF NOT EXISTS FOR (n:ASTChunk) REQUIRE n.id IS UNIQUE',
    'CREATE CONSTRAINT spec_chunk_id IF NOT EXISTS FOR (n:SpecChunk) REQUIRE n.id IS UNIQUE',
    'CREATE CONSTRAINT jsx_change_id IF NOT EXISTS FOR (n:JSXChange) REQUIRE n.id IS UNIQUE',
    'CREATE CONSTRAINT component_id IF NOT EXISTS FOR (n:Component) REQUIRE n.id IS UNIQUE',
  ]
  for (const stmt of constraints) {
    await repo.runCypher(stmt)
  }
}

beforeAll(async () => {
  if (!NEO4J_URI) {
    console.warn('  ⚠  NEO4J_URI not set — integration tests skipped')
    return
  }

  try {
    const driver = createNeo4jDriver({ uri: NEO4J_URI, user: NEO4J_USER, password: NEO4J_PASSWORD })
    repo = new Neo4jRepository(driver)

    console.log('  ⏳ Waiting for Neo4j to be ready...')
    await waitForNeo4j(repo)
    console.log('  ✓ Neo4j connected')

    // Constraints necesarios para que MERGE paralelo sea idempotente
    await applyConstraints()
    await deleteTestNodes()
    isConnected = true
  } catch (err) {
    console.warn(`  ⚠  Neo4j unavailable: ${(err as Error).message}`)
    console.warn('  ⚠  Integration tests will be skipped')
    isConnected = false
  }
}, 60_000) // 60s — Neo4j puede tardar en arrancar

afterAll(async () => {
  if (!isConnected) return
  try {
    await deleteTestNodes()
    await repo.close()
  } catch {
    // Ignorar errores en cleanup
  }
}, 30_000)

// ═══════════════════════════════════════════════════════════
// Suite 1 — Operaciones atómicas del repositorio
// ═══════════════════════════════════════════════════════════

describe('Neo4jRepository — atomic operations', () => {
  neo4jIt('mergeOrg crea el nodo y es idempotente (MERGE)', async () => {
    const id = await repo.mergeOrg(TEST_ORG)
    const id2 = await repo.mergeOrg(TEST_ORG)

    expect(id).toBe(makeOrgId(TEST_ORG))
    expect(id2).toBe(id)

    const records = await cypher('MATCH (o:Org {id: $id}) RETURN o', { id })
    expect(records).toHaveLength(1)
    expect(records[0].get('o').properties.name).toBe(TEST_ORG)
    expect(records[0].get('o').properties.platform).toBe('github')
  })

  neo4jIt('mergeRepo crea nodo + relación OWNS', async () => {
    const orgId = await repo.mergeOrg(TEST_ORG)
    const repoId = await repo.mergeRepo(orgId, TEST_ORG, TEST_REPO)

    expect(repoId).toBe(makeRepoId(TEST_ORG, 'poc-front-app'))

    const records = await cypher(
      'MATCH (o:Org {id: $orgId})-[:OWNS]->(r:Repo {id: $repoId}) RETURN r',
      { orgId, repoId }
    )
    expect(records).toHaveLength(1)
    expect(records[0].get('r').properties.fullName).toBe(TEST_REPO)
  })

  neo4jIt('mergePullRequest crea PR + relación HAS_PR', async () => {
    const orgId = await repo.mergeOrg(TEST_ORG)
    const repoId = await repo.mergeRepo(orgId, TEST_ORG, TEST_REPO)
    const prId = await repo.mergePullRequest(repoId, PR_AUTH_REFACTOR)

    const expectedId = makePRId(repoId, PR_AUTH_REFACTOR.prNumber)
    expect(prId).toBe(expectedId)

    const records = await cypher(
      `MATCH (r:Repo {id: $repoId})-[:HAS_PR]->(pr:PullRequest {id: $prId}) RETURN pr`,
      { repoId, prId }
    )
    expect(records).toHaveLength(1)
    const pr = records[0].get('pr').properties
    expect(pr.author).toBe('alice')
    expect(pr.branch).toBe('refactor/auth-context-reducer')
    expect(pr.commitSha).toBe(PR_AUTH_REFACTOR.commitSha)
    // Neo4j elimina propiedades seteadas a null → driver retorna undefined
    expect(pr.mergedAt ?? null).toBeNull()
  })

  neo4jIt('mergePullRequest con mergedAt no null persiste el datetime', async () => {
    const orgId = await repo.mergeOrg(TEST_ORG)
    const repoId = await repo.mergeRepo(orgId, TEST_ORG, TEST_REPO)
    await repo.mergePullRequest(repoId, { ...PR_API_CONFIG, prNumber: 9999 })

    const prId = makePRId(repoId, 9999)
    const records = await cypher('MATCH (pr:PullRequest {id: $prId}) RETURN pr', { prId })
    expect(records[0].get('pr').properties.mergedAt).not.toBeNull()
  })

  neo4jIt('mergeASTChunk con embedding persiste en Neo4j', async () => {
    const orgId = await repo.mergeOrg(TEST_ORG)
    const repoId = await repo.mergeRepo(orgId, TEST_ORG, TEST_REPO)
    const prId = await repo.mergePullRequest(repoId, { ...PR_AUTH_REFACTOR, prNumber: 9001 })
    const runId = await repo.createAnalysisRun(prId, {
      model: 'llama3.2', temperature: 0.1, durationMs: 1000, astChunkCount: 1, specChunkCount: 0,
    })

    const embedding = Array.from({ length: 768 }, (_, i) => Math.sin(i) * 0.5)
    const astId = await repo.mergeASTChunk(runId, 0, AUTH_CONTEXT_CHUNK, embedding)

    expect(astId).toBe(makeASTChunkId(AUTH_CONTEXT_CHUNK.filename, AUTH_CONTEXT_CHUNK.rawDiff))

    const records = await cypher('MATCH (a:ASTChunk {id: $id}) RETURN a', { id: astId })
    const ast = records[0].get('a').properties
    expect(ast.filename).toBe('src/contexts/AuthContext.tsx')
    expect(ast.components).toContain('AuthContext')
    expect(ast.testIds).toContain('auth-logout-btn')
    expect(Array.isArray(ast.embedding)).toBe(true)
    expect(ast.embedding).toHaveLength(768)
  })

  neo4jIt('mergeASTChunk es idempotente — mismo diff no crea duplicado', async () => {
    const orgId = await repo.mergeOrg(TEST_ORG)
    const repoId = await repo.mergeRepo(orgId, TEST_ORG, TEST_REPO)
    const prId = await repo.mergePullRequest(repoId, { ...PR_AUTH_REFACTOR, prNumber: 9002 })
    const runId = await repo.createAnalysisRun(prId, {
      model: 'llama3.2', temperature: 0.1, durationMs: 500, astChunkCount: 1, specChunkCount: 0,
    })
    const embedding = new Array(768).fill(0.1)
    const astId = makeASTChunkId(USE_AUTH_HOOK_CHUNK.filename, USE_AUTH_HOOK_CHUNK.rawDiff)

    await repo.mergeASTChunk(runId, 0, USE_AUTH_HOOK_CHUNK, embedding)
    await repo.mergeASTChunk(runId, 0, USE_AUTH_HOOK_CHUNK, embedding) // idempotente

    const records = await cypher('MATCH (a:ASTChunk {id: $id}) RETURN count(a) AS c', { id: astId })
    expect(records[0].get('c').toNumber()).toBe(1)
  })

  neo4jIt('mergeSpecChunk con embedding y type=e2e framework=playwright', async () => {
    const content = AUTH_SPEC_FILES[0].content
    const specId = await repo.mergeSpecChunk(
      { testName: 'auth-test', filename: 'auth-flow.spec.ts', content },
      new Array(768).fill(0.2)
    )

    expect(specId).toBe(makeSpecChunkId(content))
    const records = await cypher('MATCH (s:SpecChunk {id: $id}) RETURN s', { id: specId })
    const spec = records[0].get('s').properties
    expect(spec.type).toBe('e2e')
    expect(spec.framework).toBe('playwright')
    expect(spec.embedding).toHaveLength(768)
  })

  neo4jIt('mergeJSXChange crea nodo + relación HAS_JSX_CHANGE', async () => {
    const orgId = await repo.mergeOrg(TEST_ORG)
    const repoId = await repo.mergeRepo(orgId, TEST_ORG, TEST_REPO)
    const prId = await repo.mergePullRequest(repoId, { ...PR_PAYMENT_MIGRATION, prNumber: 9003 })
    const runId = await repo.createAnalysisRun(prId, {
      model: 'llama3.2', temperature: 0.1, durationMs: 500, astChunkCount: 1, specChunkCount: 0,
    })
    const astId = await repo.mergeASTChunk(runId, 0, PAYMENT_FORM_CHUNK, new Array(768).fill(0.3))

    const jsxChange = PAYMENT_FORM_CHUNK.jsxChanges[0]
    const jsxId = await repo.mergeJSXChange(astId, jsxChange)

    expect(jsxId).toBe(makeJSXChangeId(jsxChange))

    const records = await cypher(
      'MATCH (a:ASTChunk {id: $astId})-[:HAS_JSX_CHANGE]->(j:JSXChange {id: $jsxId}) RETURN j',
      { astId, jsxId }
    )
    expect(records).toHaveLength(1)
    const jsx = records[0].get('j').properties
    expect(jsx.element).toBe('button')
    expect(jsx.addedValue).toBe('payment-submit-btn')
    expect(jsx.removedValue).toBe('submit-payment')
  })

  neo4jIt('createMatchRelationship persiste cosine + BM25 + RRF scores', async () => {
    const orgId = await repo.mergeOrg(TEST_ORG)
    const repoId = await repo.mergeRepo(orgId, TEST_ORG, TEST_REPO)
    const prId = await repo.mergePullRequest(repoId, { ...PR_AUTH_REFACTOR, prNumber: 9004 })
    const runId = await repo.createAnalysisRun(prId, {
      model: 'llama3.2', temperature: 0.1, durationMs: 500, astChunkCount: 1, specChunkCount: 1,
    })
    const astId = await repo.mergeASTChunk(runId, 0, PRIVATE_ROUTE_HOC_CHUNK, new Array(768).fill(0.1))
    const specId = await repo.mergeSpecChunk(
      { testName: 'spinner test', filename: 'auth-flow.spec.ts', content: 'test spinner unique content' },
      new Array(768).fill(0.2)
    )

    await repo.createMatchRelationship(astId, specId, {
      cosineScore: 0.923,
      bm25Score: 12.45,
      rrfScore: 0.0312,
      rank: 1,
    })

    const records = await cypher(
      `MATCH (a:ASTChunk {id: $astId})-[r:MATCHED]->(s:SpecChunk {id: $specId}) RETURN r`,
      { astId, specId }
    )
    expect(records).toHaveLength(1)
    const rel = records[0].get('r').properties
    expect(rel.cosineScore).toBeCloseTo(0.923, 3)
    expect(rel.bm25Score).toBeCloseTo(12.45, 2)
    expect(rel.rrfScore).toBeCloseTo(0.0312, 4)
    expect(rel.rank.toNumber()).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════
// Suite 2 — PR #101: AuthContext + useAuth hook + PrivateRoute HOC
// ═══════════════════════════════════════════════════════════

describe('Integration — PR #101: AuthContext + useAuth hook + PrivateRoute HOC', () => {
  let runId = ''
  let predictionId = ''

  beforeAll(async () => {
    if (!isConnected) return
    const result = await persistAnalysisRun(repo, {
      orgName: TEST_ORG,
      repoFullName: TEST_REPO,
      prMetadata: PR_AUTH_REFACTOR,
      astChunks: [AUTH_CONTEXT_CHUNK, USE_AUTH_HOOK_CHUNK, PRIVATE_ROUTE_HOC_CHUNK],
      specFiles: AUTH_SPEC_FILES,
      rawMarkdown:
        '## 🔴 Tests que fallarán\n' +
        '#### `should NOT find logout-button (old selector)` — `auth-flow.spec.ts`\n' +
        '**Por qué falla:** data-test-id "logout-button" renombrado a "auth-logout-btn"\n' +
        '## 🟡 Tests en riesgo\n' +
        '#### `should preserve redirect location after login` — `protected-routes.spec.ts`\n' +
        '**Por qué es riesgo:** PrivateRoute ahora pasa location state — URL puede tener params extra\n' +
        '## ✅ Tests no afectados\n' +
        '- `should show loading spinner during auth check` — auth-loading-spinner ahora existe\n' +
        '- `should display error message on login failure` — auth-error-msg agregado',
      predictions: AUTH_PREDICTIONS,
      model: 'llama3.2',
      temperature: 0.1,
      analysisStartedAt: Date.now() - 8000,
      llmDurationMs: 4200,
    })
    runId = result.runId
    predictionId = result.predictionId
  }, 30_000)

  neo4jIt('persiste el grafo completo: Org → Repo → PR → AnalysisRun', async () => {
    const records = await cypher(
      `MATCH (o:Org {name: $org})-[:OWNS]->(r:Repo)-[:HAS_PR]->(pr:PullRequest {prNumber: $prNum})
             -[:ANALYZED_BY]->(run:AnalysisRun {id: $runId})
       RETURN o, r, pr, run`,
      { org: TEST_ORG, prNum: neo4j.int(101), runId }
    )
    expect(records).toHaveLength(1)
    const run = records[0].get('run').properties
    expect(run.model).toBe('llama3.2')
    expect(run.astChunkCount.toNumber()).toBe(3)
    expect(run.specChunkCount.toNumber()).toBeGreaterThan(0)
  })

  neo4jIt('persiste los 3 ASTChunks (Context + Hook + HOC) en orden INCLUDES', async () => {
    const records = await cypher(
      `MATCH (run:AnalysisRun {id: $runId})-[inc:INCLUDES]->(ast:ASTChunk)
       RETURN ast.filename, inc.order ORDER BY inc.order`,
      { runId }
    )
    expect(records).toHaveLength(3)
    expect(records[0].get('ast.filename')).toBe('src/contexts/AuthContext.tsx')
    expect(records[1].get('ast.filename')).toBe('src/hooks/useAuth.ts')
    expect(records[2].get('ast.filename')).toBe('src/components/PrivateRoute.tsx')
  })

  neo4jIt('AuthContext chunk tiene los components, functions y testIds correctos', async () => {
    const astId = makeASTChunkId(AUTH_CONTEXT_CHUNK.filename, AUTH_CONTEXT_CHUNK.rawDiff)
    const records = await cypher('MATCH (a:ASTChunk {id: $id}) RETURN a', { id: astId })
    const ast = records[0].get('a').properties

    expect(ast.components).toContain('AuthContext')
    expect(ast.components).toContain('AuthProvider')
    expect(ast.functions).toContain('authReducer')
    expect(ast.testIds).toContain('auth-logout-btn')
    expect(ast.testIds).toContain('logout-button')
    expect(ast.summary).toContain('reducer')
  })

  neo4jIt('useAuth hook chunk — no tiene JSXChanges (es un hook puro)', async () => {
    const astId = makeASTChunkId(USE_AUTH_HOOK_CHUNK.filename, USE_AUTH_HOOK_CHUNK.rawDiff)
    const records = await cypher(
      'MATCH (a:ASTChunk {id: $id})-[:HAS_JSX_CHANGE]->() RETURN count(*) AS c',
      { id: astId }
    )
    expect(records[0].get('c').toNumber()).toBe(0)
  })

  neo4jIt('PrivateRoute HOC chunk tiene el JSXChange del auth-loading-spinner', async () => {
    const astId = makeASTChunkId(PRIVATE_ROUTE_HOC_CHUNK.filename, PRIVATE_ROUTE_HOC_CHUNK.rawDiff)
    const records = await cypher(
      'MATCH (a:ASTChunk {id: $id})-[:HAS_JSX_CHANGE]->(j:JSXChange) RETURN j',
      { id: astId }
    )
    expect(records).toHaveLength(1)
    expect(records[0].get('j').properties.addedValue).toBe('auth-loading-spinner')
  })

  neo4jIt('LLMPrediction tiene 1 broken + 2 ok + 1 risk', async () => {
    const records = await cypher(
      'MATCH (run:AnalysisRun {id: $runId})-[:PRODUCED]->(p:LLMPrediction) RETURN p',
      { runId }
    )
    expect(records).toHaveLength(1)
    const p = records[0].get('p').properties
    expect(p.brokenCount.toNumber()).toBe(1)
    expect(p.riskCount.toNumber()).toBe(1)
    expect(p.okCount.toNumber()).toBe(2)
  })

  neo4jIt('TestPrediction broken apunta al spec correcto vía REFERS_TO', async () => {
    const records = await cypher(
      `MATCH (run:AnalysisRun {id: $runId})-[:PRODUCED]->(llm:LLMPrediction)
             -[:CONTAINS]->(tp:TestPrediction {status: 'broken'})
       OPTIONAL MATCH (tp)-[:REFERS_TO]->(s:SpecChunk)
       RETURN tp.testName AS testName, tp.file AS file, tp.reason AS reason, s.filename AS specFile`,
      { runId }
    )
    expect(records).toHaveLength(1)
    expect(records[0].get('testName')).toContain('logout-button')
    expect(records[0].get('file')).toBe('auth-flow.spec.ts')
    expect(records[0].get('reason')).toContain('auth-logout-btn')
  })

  neo4jIt('SpecChunks de auth-flow.spec.ts están persistidos con embedding', async () => {
    const records = await cypher(
      `MATCH (s:SpecChunk) WHERE s.filename = 'auth-flow.spec.ts'
       RETURN count(s) AS c, s.embedding IS NOT NULL AS hasEmbedding LIMIT 1`
    )
    expect(records[0].get('c').toNumber()).toBeGreaterThan(0)
    expect(records[0].get('hasEmbedding')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════
// Suite 3 — PR #102: Class → Functional + HOF withPayment + Singleton
// ═══════════════════════════════════════════════════════════

describe('Integration — PR #102: PaymentForm class migration + withPayment HOF + PaymentService Singleton', () => {
  let runId = ''

  beforeAll(async () => {
    if (!isConnected) return
    const result = await persistAnalysisRun(repo, {
      orgName: TEST_ORG,
      repoFullName: TEST_REPO,
      prMetadata: PR_PAYMENT_MIGRATION,
      astChunks: [PAYMENT_SERVICE_CHUNK, WITH_PAYMENT_HOF_CHUNK, PAYMENT_FORM_CHUNK],
      specFiles: PAYMENT_SPEC_FILES,
      rawMarkdown:
        '## 🔴 Tests que fallarán\n' +
        '#### `should fail with old submit-payment selector` — `checkout-flow.spec.ts`\n' +
        '**Por qué falla:** "submit-payment" renombrado a "payment-submit-btn"\n' +
        '#### `should NOT find payment-error (old selector)` — `payment-confirmation.spec.ts`\n' +
        '**Por qué falla:** "payment-error" renombrado a "payment-error-banner"\n' +
        '## 🟡 Tests en riesgo\n' +
        '#### `should disable submit button while processing` — `checkout-flow.spec.ts`\n' +
        '**Por qué es riesgo:** Depende de paymentState.isProcessing del singleton — timing variable\n' +
        '## ✅ Tests no afectados\n' +
        '- `should complete a full USD payment` — payment-submit-btn es el nuevo selector correcto\n' +
        '- `should select EUR currency` — currency-select es un elemento nuevo',
      predictions: PAYMENT_PREDICTIONS,
      model: 'llama3.2',
      temperature: 0.1,
      analysisStartedAt: Date.now() - 12000,
      llmDurationMs: 6800,
    })
    runId = result.runId
  }, 30_000)

  neo4jIt('PaymentService singleton chunk persiste las funciones del Singleton pattern', async () => {
    const astId = makeASTChunkId(PAYMENT_SERVICE_CHUNK.filename, PAYMENT_SERVICE_CHUNK.rawDiff)
    const records = await cypher('MATCH (a:ASTChunk {id: $id}) RETURN a', { id: astId })
    const ast = records[0].get('a').properties

    expect(ast.filename).toBe('src/services/PaymentService.ts')
    expect(ast.functions).toContain('getInstance')
    expect(ast.functions).toContain('subscribe')
    expect(ast.functions).toContain('getSnapshot')
    expect(ast.summary).toContain('Singleton')
  })

  neo4jIt('PaymentService chunk NO tiene JSXChanges (es un servicio puro)', async () => {
    const astId = makeASTChunkId(PAYMENT_SERVICE_CHUNK.filename, PAYMENT_SERVICE_CHUNK.rawDiff)
    const records = await cypher(
      'MATCH (a:ASTChunk {id: $id})-[:HAS_JSX_CHANGE]->() RETURN count(*) AS c',
      { id: astId }
    )
    expect(records[0].get('c').toNumber()).toBe(0)
  })

  neo4jIt('withPayment HOF chunk persiste con useSyncExternalStore', async () => {
    const astId = makeASTChunkId(WITH_PAYMENT_HOF_CHUNK.filename, WITH_PAYMENT_HOF_CHUNK.rawDiff)
    const records = await cypher('MATCH (a:ASTChunk {id: $id}) RETURN a', { id: astId })
    const ast = records[0].get('a').properties

    expect(ast.functions).toContain('withPayment')
    expect(ast.functions).toContain('useSyncExternalStore')
    expect(ast.summary).toContain('HOF')
  })

  neo4jIt('PaymentForm tiene los 3 JSXChanges (button + div + select)', async () => {
    const astId = makeASTChunkId(PAYMENT_FORM_CHUNK.filename, PAYMENT_FORM_CHUNK.rawDiff)
    const records = await cypher(
      `MATCH (a:ASTChunk {id: $id})-[:HAS_JSX_CHANGE]->(j:JSXChange)
       RETURN j.element AS el, j.addedValue AS added, j.removedValue AS removed
       ORDER BY j.addedValue`,
      { id: astId }
    )
    expect(records).toHaveLength(3)
    const added = records.map((r) => r.get('added'))
    expect(added).toContain('payment-submit-btn')
    expect(added).toContain('payment-error-banner')
    expect(added).toContain('currency-select')

    const removed = records.map((r) => r.get('removed')).filter(Boolean)
    expect(removed).toContain('submit-payment')
    expect(removed).toContain('payment-error')
  })

  neo4jIt('2 TestPredictions broken detectan los 2 selectores renombrados', async () => {
    const records = await cypher(
      `MATCH (run:AnalysisRun {id: $runId})-[:PRODUCED]->(llm:LLMPrediction)
             -[:CONTAINS]->(tp:TestPrediction {status: 'broken'})
       RETURN tp.testName AS name ORDER BY tp.testName`,
      { runId }
    )
    expect(records).toHaveLength(2)
    const names: string[] = records.map((r) => r.get('name'))
    expect(names.some((n) => n.includes('submit-payment'))).toBe(true)
    expect(names.some((n) => n.includes('payment-error'))).toBe(true)
  })

  neo4jIt('1 TestPrediction risk por timing del Singleton', async () => {
    const records = await cypher(
      `MATCH (run:AnalysisRun {id: $runId})-[:PRODUCED]->(llm:LLMPrediction)
             -[:CONTAINS]->(tp:TestPrediction {status: 'risk'})
       RETURN tp.testName AS name, tp.reason AS reason`,
      { runId }
    )
    expect(records).toHaveLength(1)
    expect(records[0].get('reason')).toContain('singleton')
  })
})

// ═══════════════════════════════════════════════════════════
// Suite 4 — PR #103: ApiConfig Singleton + useFetch hook + UserList
// ═══════════════════════════════════════════════════════════

describe('Integration — PR #103: ApiConfig singleton + useFetch hook + UserList component', () => {
  let runId = ''

  beforeAll(async () => {
    if (!isConnected) return
    const result = await persistAnalysisRun(repo, {
      orgName: TEST_ORG,
      repoFullName: TEST_REPO,
      prMetadata: PR_API_CONFIG,
      astChunks: [API_CONFIG_CHUNK, USE_FETCH_HOOK_CHUNK, USER_LIST_CHUNK],
      specFiles: API_SPEC_FILES,
      rawMarkdown:
        '## ✅ Tests no afectados\n' +
        '- `should show retry button on error` — retry-fetch-btn es nuevo\n' +
        '- `should include X-API-Version header in requests` — X-API-Version agregado\n' +
        '## 🟡 Tests en riesgo\n' +
        '#### `should retry on button click` — `user-list.spec.ts`\n' +
        '**Por qué es riesgo:** Depende de retry() del useFetch — timing async\n' +
        '#### `should load user via versioned API URL` — `user-detail.spec.ts`\n' +
        '**Por qué es riesgo:** URL cambió de /users/1 a /v1/users/1',
      predictions: API_PREDICTIONS,
      model: 'llama3.2',
      temperature: 0.1,
      analysisStartedAt: Date.now() - 6000,
      llmDurationMs: 3100,
    })
    runId = result.runId
  }, 30_000)

  neo4jIt('PR #103 ya está mergeado — mergedAt no es null', async () => {
    const repoId = makeRepoId(TEST_ORG, 'poc-front-app')
    const prId = makePRId(repoId, 103)
    const records = await cypher(
      'MATCH (pr:PullRequest {id: $prId}) RETURN pr.mergedAt AS mergedAt',
      { prId }
    )
    expect(records[0].get('mergedAt')).not.toBeNull()
  })

  neo4jIt('ApiConfig chunk persiste las funciones del Singleton con versioning', async () => {
    const astId = makeASTChunkId(API_CONFIG_CHUNK.filename, API_CONFIG_CHUNK.rawDiff)
    const records = await cypher('MATCH (a:ASTChunk {id: $id}) RETURN a', { id: astId })
    const ast = records[0].get('a').properties

    expect(ast.functions).toContain('getHeaders')
    expect(ast.functions).toContain('buildUrl')
    expect(ast.summary).toContain('versioning')
  })

  neo4jIt('useFetch hook chunk NO tiene JSXChanges (hook puro)', async () => {
    const astId = makeASTChunkId(USE_FETCH_HOOK_CHUNK.filename, USE_FETCH_HOOK_CHUNK.rawDiff)
    const records = await cypher(
      'MATCH (a:ASTChunk {id: $id})-[:HAS_JSX_CHANGE]->() RETURN count(*) AS c',
      { id: astId }
    )
    expect(records[0].get('c').toNumber()).toBe(0)
  })

  neo4jIt('UserList chunk tiene el JSXChange del retry-fetch-btn (nuevo elemento)', async () => {
    const astId = makeASTChunkId(USER_LIST_CHUNK.filename, USER_LIST_CHUNK.rawDiff)
    const records = await cypher(
      'MATCH (a:ASTChunk {id: $id})-[:HAS_JSX_CHANGE]->(j:JSXChange) RETURN j',
      { id: astId }
    )
    expect(records).toHaveLength(1)
    const jsx = records[0].get('j').properties
    expect(jsx.addedValue).toBe('retry-fetch-btn')
    // Neo4j no almacena propiedades null → driver retorna undefined
    expect(jsx.removedValue ?? null).toBeNull()
  })

  neo4jIt('LLMPrediction: 0 broken, 2 risk, 2 ok para PR de ApiConfig', async () => {
    const records = await cypher(
      'MATCH (run:AnalysisRun {id: $runId})-[:PRODUCED]->(p:LLMPrediction) RETURN p',
      { runId }
    )
    const p = records[0].get('p').properties
    expect(p.brokenCount.toNumber()).toBe(0)
    expect(p.riskCount.toNumber()).toBe(2)
    expect(p.okCount.toNumber()).toBe(2)
  })

  neo4jIt('TestPrediction risk de URL versioning tiene el motivo correcto', async () => {
    const records = await cypher(
      `MATCH (run:AnalysisRun {id: $runId})-[:PRODUCED]->(llm:LLMPrediction)
             -[:CONTAINS]->(tp:TestPrediction {status: 'risk'})
       WHERE tp.testName CONTAINS 'versioned API URL'
       RETURN tp.reason AS reason`,
      { runId }
    )
    expect(records).toHaveLength(1)
    expect(records[0].get('reason')).toContain('/v1/')
  })
})

// ═══════════════════════════════════════════════════════════
// Suite 5 — Queries cross-PR (historial en el grafo)
// ═══════════════════════════════════════════════════════════

describe('Integration — Cross-PR graph queries (historial)', () => {
  neo4jIt('el mismo repo tiene los 3 PRs enlazados (101, 102, 103)', async () => {
    const repoId = makeRepoId(TEST_ORG, 'poc-front-app')
    const records = await cypher(
      `MATCH (r:Repo {id: $repoId})-[:HAS_PR]->(pr:PullRequest)
       WHERE pr.prNumber IN [101, 102, 103]
       RETURN count(pr) AS c`,
      { repoId }
    )
    expect(records[0].get('c').toNumber()).toBe(3)
  })

  neo4jIt('consulta cross-PR: todos los broken tests del repo', async () => {
    const repoId = makeRepoId(TEST_ORG, 'poc-front-app')
    const records = await cypher(
      `MATCH (r:Repo {id: $repoId})-[:HAS_PR]->(pr:PullRequest)
             -[:ANALYZED_BY]->(run:AnalysisRun)
             -[:PRODUCED]->(llm:LLMPrediction)
             -[:CONTAINS]->(tp:TestPrediction {status: 'broken'})
       RETURN pr.prNumber AS prNum, tp.testName AS test ORDER BY pr.prNumber`,
      { repoId }
    )
    // PR 101: 1 broken, PR 102: 2 broken, PR 103: 0 broken → total 3
    expect(records).toHaveLength(3)
  })

  neo4jIt('JSXChanges de data-test-id permiten rastrear qué selector rompió qué test', async () => {
    const records = await cypher(
      `MATCH (j:JSXChange)
       WHERE j.attribute = 'data-test-id' AND j.removedValue IS NOT NULL
       RETURN j.element AS el, j.removedValue AS removed, j.addedValue AS added
       ORDER BY j.removedValue`
    )
    expect(records.length).toBeGreaterThanOrEqual(3)
    const removed: string[] = records.map((r) => r.get('removed'))
    expect(removed).toContain('logout-button')
    expect(removed).toContain('submit-payment')
    expect(removed).toContain('payment-error')
  })

  neo4jIt('todos los AnalysisRun tienen durationMs > 0', async () => {
    const records = await cypher(
      `MATCH (run:AnalysisRun)
       WHERE (run)<-[:ANALYZED_BY]-(:PullRequest)<-[:HAS_PR]-(:Repo {fullName: $repo})
       RETURN run.durationMs AS ms ORDER BY run.createdAt`,
      { repo: TEST_REPO }
    )
    expect(records.length).toBeGreaterThanOrEqual(3)
    records.forEach((r) => expect(r.get('ms').toNumber()).toBeGreaterThan(0))
  })

  neo4jIt('risk assessment: AST chunks que tocaron HOC/HOF/hook patterns', async () => {
    const records = await cypher(
      `MATCH (a:ASTChunk)
       WHERE any(f IN a.functions WHERE f IN ['withPayment', 'withAuth', 'useSyncExternalStore', 'useCallback', 'fetchWithRetry'])
          OR any(c IN a.components WHERE c IN ['PrivateRoute', 'WithPaymentComponent', 'AuthenticatedComponent'])
       RETURN a.filename AS filename ORDER BY a.filename`
    )
    const filenames: string[] = records.map((r) => r.get('filename'))
    expect(filenames).toContain('src/components/PrivateRoute.tsx')
    expect(filenames).toContain('src/hocs/withPayment.tsx')
    expect(filenames).toContain('src/hooks/useFetch.ts')
  })

  neo4jIt('content-addressable: el mismo spec chunk nunca se duplica entre PRs', async () => {
    // auth-flow.spec.ts tiene contenido idéntico en PR 101 y podría referenciarse en más
    const records = await cypher(
      `MATCH (s:SpecChunk) WHERE s.filename = 'auth-flow.spec.ts'
       RETURN count(DISTINCT s.id) AS uniqueIds, count(s) AS total`
    )
    const uniqueIds = records[0].get('uniqueIds').toNumber()
    const total = records[0].get('total').toNumber()
    expect(uniqueIds).toBe(total) // no duplicados
  })
})

// ═══════════════════════════════════════════════════════════
// Suite 6 — PR #104: TanStack Query — query key factory + optimistic cart
// ═══════════════════════════════════════════════════════════

describe('Integration — PR #104: TanStack Query v5 migration', () => {
  let runId = ''
  let predictionId = ''

  beforeAll(async () => {
    if (!isConnected) return
    const result = await persistAnalysisRun(repo, {
      orgName: TEST_ORG,
      repoFullName: TEST_REPO,
      prMetadata: PR_TANSTACK_QUERY,
      astChunks: [QUERY_KEYS_CHUNK, USE_PRODUCT_QUERY_CHUNK, PRODUCT_CARD_CHUNK],
      specFiles: TANSTACK_SPEC_FILES,
      rawMarkdown:
        '## 🔴 Tests que fallarán\n' +
        '#### `should show loading-spinner while fetching` — `product-card.spec.ts`\n' +
        '**Por qué falla:** "loading-spinner" renombrado a "product-loading-skeleton"\n' +
        '#### `should NOT find product-error div (old selector)` — `product-card.spec.ts`\n' +
        '**Por qué falla:** "product-error" renombrado a "product-error-banner"\n' +
        '## 🟡 Tests en riesgo\n' +
        '#### `should rollback cart on mutation error` — `cart-optimistic.spec.ts`\n' +
        '**Por qué es riesgo:** Depende del timing del rollback optimista de TanStack Query\n' +
        '## ✅ Tests no afectados\n' +
        '- `should show product-loading-skeleton (new skeleton UI)` — nuevo elemento correcto\n' +
        '- `should show cart-success-toast after adding product` — nuevo elemento de feedback',
      predictions: TANSTACK_PREDICTIONS,
      model: 'llama3.2',
      temperature: 0.1,
      analysisStartedAt: Date.now() - 9000,
      llmDurationMs: 5200,
    })
    runId = result.runId
    predictionId = result.predictionId
  }, 30_000)

  neo4jIt('queryKeys factory chunk persiste con satisfies guard en summary', async () => {
    const astId = makeASTChunkId(QUERY_KEYS_CHUNK.filename, QUERY_KEYS_CHUNK.rawDiff)
    const records = await cypher('MATCH (a:ASTChunk {id: $id}) RETURN a', { id: astId })
    const ast = records[0].get('a').properties

    expect(ast.filename).toBe('src/lib/queryKeys.ts')
    expect(ast.functions).toContain('queryKeys')
    expect(ast.summary).toContain('satisfies')
    expect(ast.summary).toContain('products.detail')
  })

  neo4jIt('useProductQuery chunk tiene useQueryClient y useMutation en functions', async () => {
    const astId = makeASTChunkId(USE_PRODUCT_QUERY_CHUNK.filename, USE_PRODUCT_QUERY_CHUNK.rawDiff)
    const records = await cypher('MATCH (a:ASTChunk {id: $id}) RETURN a', { id: astId })
    const ast = records[0].get('a').properties

    expect(ast.functions).toContain('useQueryClient')
    expect(ast.functions).toContain('useMutation')
    expect(ast.functions).toContain('useQuery')
    expect(ast.summary).toContain('optimistic')
  })

  neo4jIt('ProductCard chunk tiene los 4 JSXChanges (2 renombrados + 2 nuevos)', async () => {
    const astId = makeASTChunkId(PRODUCT_CARD_CHUNK.filename, PRODUCT_CARD_CHUNK.rawDiff)
    const records = await cypher(
      `MATCH (a:ASTChunk {id: $id})-[:HAS_JSX_CHANGE]->(j:JSXChange)
       RETURN j.addedValue AS added, j.removedValue AS removed ORDER BY j.addedValue`,
      { id: astId }
    )
    expect(records).toHaveLength(4)

    const added: string[] = records.map((r) => r.get('added'))
    expect(added).toContain('product-loading-skeleton')
    expect(added).toContain('product-error-banner')
    expect(added).toContain('product-error-retry')
    expect(added).toContain('cart-success-toast')

    const renamed = records.filter((r) => r.get('removed') !== null)
    expect(renamed).toHaveLength(2) // loading-spinner + product-error
  })

  neo4jIt('2 broken tests detectados: loading-spinner + product-error renombrados', async () => {
    const records = await cypher(
      `MATCH (run:AnalysisRun {id: $runId})-[:PRODUCED]->(llm:LLMPrediction)
             -[:CONTAINS]->(tp:TestPrediction {status: 'broken'})
       RETURN tp.testName AS name, tp.reason AS reason ORDER BY tp.testName`,
      { runId }
    )
    expect(records).toHaveLength(2)
    const names: string[] = records.map((r) => r.get('name'))
    expect(names.some((n) => n.includes('loading-spinner'))).toBe(true)
    expect(names.some((n) => n.includes('product-error'))).toBe(true)
  })

  neo4jIt('1 risk test por timing del optimistic update de TanStack Query', async () => {
    const records = await cypher(
      `MATCH (run:AnalysisRun {id: $runId})-[:PRODUCED]->(llm:LLMPrediction)
             -[:CONTAINS]->(tp:TestPrediction {status: 'risk'})
       RETURN tp.testName AS name, tp.reason AS reason`,
      { runId }
    )
    expect(records).toHaveLength(1)
    expect(records[0].get('reason')).toContain('TanStack Query')
  })

  neo4jIt('predictionId apunta a LLMPrediction con rawMarkdown del run', async () => {
    const records = await cypher(
      'MATCH (p:LLMPrediction {id: $predId}) RETURN p.rawMarkdown AS md',
      { predId: predictionId }
    )
    expect(records[0].get('md')).toContain('product-loading-skeleton')
  })
})

// ═══════════════════════════════════════════════════════════
// Suite 7 — PR #105: Styled Components — design tokens + AlertBanner
// ═══════════════════════════════════════════════════════════

describe('Integration — PR #105: Styled Components design token rename', () => {
  let runId = ''

  beforeAll(async () => {
    if (!isConnected) return
    const result = await persistAnalysisRun(repo, {
      orgName: TEST_ORG,
      repoFullName: TEST_REPO,
      prMetadata: PR_STYLED_COMPONENTS,
      astChunks: [THEME_TOKENS_CHUNK, STYLED_BUTTON_CHUNK, ALERT_BANNER_CHUNK],
      specFiles: STYLED_SPEC_FILES,
      rawMarkdown:
        '## 🔴 Tests que fallarán\n' +
        '#### `should close banner via alert-close (old selector)` — `alert-banner.spec.ts`\n' +
        '**Por qué falla:** "alert-close" renombrado a "banner-close-btn"\n' +
        '## 🟡 Tests en riesgo\n' +
        '#### `should apply destructive border color for error variant` — `alert-banner.spec.ts`\n' +
        '**Por qué es riesgo:** Depende del ThemeProvider con token "destructive" (antes "danger")\n' +
        '## ✅ Tests no afectados\n' +
        '- `should close banner via banner-close-btn (new selector)` — selector correcto\n' +
        '- `should show banner-icon with error variant` — nuevo elemento\n' +
        '- `should not leak $variant prop to DOM` — shouldForwardProp filtra props transientes',
      predictions: STYLED_PREDICTIONS,
      model: 'llama3.2',
      temperature: 0.1,
      analysisStartedAt: Date.now() - 7000,
      llmDurationMs: 4100,
    })
    runId = result.runId
  }, 30_000)

  neo4jIt('theme tokens chunk persiste la info del rename en summary', async () => {
    const astId = makeASTChunkId(THEME_TOKENS_CHUNK.filename, THEME_TOKENS_CHUNK.rawDiff)
    const records = await cypher('MATCH (a:ASTChunk {id: $id}) RETURN a', { id: astId })
    const ast = records[0].get('a').properties

    expect(ast.filename).toBe('src/styles/theme.ts')
    expect(ast.summary).toContain('brand')
    expect(ast.summary).toContain('destructive')
    // No tiene JSXChanges — es solo un cambio de tokens CSS-in-JS
    expect(ast.components).toHaveLength(0)
  })

  neo4jIt('theme chunk NO tiene JSXChanges (cambio de tokens no afecta DOM directamente)', async () => {
    const astId = makeASTChunkId(THEME_TOKENS_CHUNK.filename, THEME_TOKENS_CHUNK.rawDiff)
    const records = await cypher(
      'MATCH (a:ASTChunk {id: $id})-[:HAS_JSX_CHANGE]->() RETURN count(*) AS c',
      { id: astId }
    )
    expect(records[0].get('c').toNumber()).toBe(0)
  })

  neo4jIt('StyledButton chunk persiste shouldForwardProp en functions', async () => {
    const astId = makeASTChunkId(STYLED_BUTTON_CHUNK.filename, STYLED_BUTTON_CHUNK.rawDiff)
    const records = await cypher('MATCH (a:ASTChunk {id: $id}) RETURN a', { id: astId })
    const ast = records[0].get('a').properties

    expect(ast.functions).toContain('shouldForwardProp')
    expect(ast.functions).toContain('withConfig')
    expect(ast.summary).toContain('shouldForwardProp')
    // No tiene JSXChanges propios — los cambios son solo de CSS-in-JS props
  })

  neo4jIt('AlertBanner chunk tiene los 4 JSXChanges (1 renombrado + 3 nuevos)', async () => {
    const astId = makeASTChunkId(ALERT_BANNER_CHUNK.filename, ALERT_BANNER_CHUNK.rawDiff)
    const records = await cypher(
      `MATCH (a:ASTChunk {id: $id})-[:HAS_JSX_CHANGE]->(j:JSXChange)
       RETURN j.addedValue AS added, j.removedValue AS removed ORDER BY j.addedValue`,
      { id: astId }
    )
    expect(records).toHaveLength(4)

    const added: string[] = records.map((r) => r.get('added'))
    expect(added).toContain('banner-close-btn')
    expect(added).toContain('banner-icon')
    expect(added).toContain('banner-title')
    expect(added).toContain('banner-message')

    // solo banner-close-btn tiene removedValue
    const withRemoved = records.filter((r) => r.get('removed') !== null && r.get('removed') !== undefined)
    expect(withRemoved).toHaveLength(1)
    expect(withRemoved[0].get('removed')).toBe('alert-close')
  })

  neo4jIt('1 broken test: alert-close renombrado a banner-close-btn', async () => {
    const records = await cypher(
      `MATCH (run:AnalysisRun {id: $runId})-[:PRODUCED]->(llm:LLMPrediction)
             -[:CONTAINS]->(tp:TestPrediction {status: 'broken'})
       RETURN tp.testName AS name, tp.reason AS reason`,
      { runId }
    )
    expect(records).toHaveLength(1)
    expect(records[0].get('name')).toContain('alert-close')
    expect(records[0].get('reason')).toContain('banner-close-btn')
  })

  neo4jIt('1 risk test por dependencia de ThemeProvider con tokens renombrados', async () => {
    const records = await cypher(
      `MATCH (run:AnalysisRun {id: $runId})-[:PRODUCED]->(llm:LLMPrediction)
             -[:CONTAINS]->(tp:TestPrediction {status: 'risk'})
       RETURN tp.reason AS reason`,
      { runId }
    )
    expect(records).toHaveLength(1)
    expect(records[0].get('reason')).toContain('ThemeProvider')
  })
})

// ═══════════════════════════════════════════════════════════
// Suite 8 — PR #106: TailwindCSS + Radix UI Dialog (shadcn/ui)
// ═══════════════════════════════════════════════════════════

describe('Integration — PR #106: Radix UI Dialog migration (shadcn/ui + Tailwind)', () => {
  let runId = ''

  beforeAll(async () => {
    if (!isConnected) return
    const result = await persistAnalysisRun(repo, {
      orgName: TEST_ORG,
      repoFullName: TEST_REPO,
      prMetadata: PR_RADIX_DIALOG,
      astChunks: [RADIX_DIALOG_CHUNK, CONFIRMATION_MODAL_CHUNK],
      specFiles: RADIX_SPEC_FILES,
      rawMarkdown:
        '## 🔴 Tests que fallarán\n' +
        '#### `should close modal via modal-close (old selector)` — `dialog.spec.ts`\n' +
        '**Por qué falla:** "modal-close" renombrado a "dialog-close-btn" en Radix Dialog\n' +
        '#### `should cancel via confirm-cancel-btn (old selector)` — `confirmation-modal.spec.ts`\n' +
        '**Por qué falla:** "confirm-cancel-btn" renombrado a "confirmation-cancel-btn"\n' +
        '## 🟡 Tests en riesgo\n' +
        '#### `should apply destructive style when data-destructive is set` — `confirmation-modal.spec.ts`\n' +
        '**Por qué es riesgo:** Depende de Tailwind bg-destructive en tailwind.config\n' +
        '## ✅ Tests no afectados\n' +
        '- `should close dialog via dialog-close-btn` — nuevo selector correcto\n' +
        '- `should have data-state=open on overlay` — Radix gestiona data-state nativamente\n' +
        '- `should close dialog via Escape key` — Radix maneja keyboard natively',
      predictions: RADIX_PREDICTIONS,
      model: 'llama3.2',
      temperature: 0.1,
      analysisStartedAt: Date.now() - 5500,
      llmDurationMs: 3300,
    })
    runId = result.runId
  }, 30_000)

  neo4jIt('Dialog chunk persiste forwardRef y cn en functions (shadcn pattern)', async () => {
    const astId = makeASTChunkId(RADIX_DIALOG_CHUNK.filename, RADIX_DIALOG_CHUNK.rawDiff)
    const records = await cypher('MATCH (a:ASTChunk {id: $id}) RETURN a', { id: astId })
    const ast = records[0].get('a').properties

    expect(ast.filename).toBe('src/components/ui/Dialog.tsx')
    expect(ast.functions).toContain('forwardRef')
    expect(ast.functions).toContain('cn')
    expect(ast.components).toContain('DialogOverlay')
    expect(ast.components).toContain('DialogContent')
  })

  neo4jIt('Dialog chunk tiene los 3 JSXChanges de modal-* a dialog-*', async () => {
    const astId = makeASTChunkId(RADIX_DIALOG_CHUNK.filename, RADIX_DIALOG_CHUNK.rawDiff)
    const records = await cypher(
      `MATCH (a:ASTChunk {id: $id})-[:HAS_JSX_CHANGE]->(j:JSXChange)
       RETURN j.addedValue AS added, j.removedValue AS removed ORDER BY j.addedValue`,
      { id: astId }
    )
    expect(records).toHaveLength(3)

    const pairs = records.map((r) => ({ added: r.get('added'), removed: r.get('removed') }))
    expect(pairs).toContainEqual({ added: 'dialog-close-btn', removed: 'modal-close' })
    expect(pairs).toContainEqual({ added: 'dialog-content', removed: 'modal-content' })
    expect(pairs).toContainEqual({ added: 'dialog-overlay', removed: 'modal-overlay' })
  })

  neo4jIt('ConfirmationModal chunk persiste la migración a Radix compound component', async () => {
    const astId = makeASTChunkId(CONFIRMATION_MODAL_CHUNK.filename, CONFIRMATION_MODAL_CHUNK.rawDiff)
    const records = await cypher('MATCH (a:ASTChunk {id: $id}) RETURN a', { id: astId })
    const ast = records[0].get('a').properties

    expect(ast.summary).toContain('Radix Dialog')
    expect(ast.summary).toContain('destructive')
    expect(ast.testIds).toContain('confirmation-cancel-btn')
    expect(ast.testIds).toContain('confirm-cancel-btn') // old selector en testIds
  })

  neo4jIt('2 broken tests: los 2 rename de modal-* y confirm-* detectados', async () => {
    const records = await cypher(
      `MATCH (run:AnalysisRun {id: $runId})-[:PRODUCED]->(llm:LLMPrediction)
             -[:CONTAINS]->(tp:TestPrediction {status: 'broken'})
       RETURN tp.file AS file, tp.testName AS name ORDER BY tp.file`,
      { runId }
    )
    expect(records).toHaveLength(2)
    const files: string[] = records.map((r) => r.get('file'))
    expect(files).toContain('dialog.spec.ts')
    expect(files).toContain('confirmation-modal.spec.ts')
  })

  neo4jIt('3 ok tests: Radix maneja close, Escape y data-state nativamente', async () => {
    const records = await cypher(
      `MATCH (run:AnalysisRun {id: $runId})-[:PRODUCED]->(llm:LLMPrediction)
             -[:CONTAINS]->(tp:TestPrediction {status: 'ok'})
       RETURN count(tp) AS c`,
      { runId }
    )
    expect(records[0].get('c').toNumber()).toBe(3)
  })
})

// ═══════════════════════════════════════════════════════════
// Suite 9 — PR #107: Monorepo — shared @company/ui package
// ═══════════════════════════════════════════════════════════

describe('Integration — PR #107: Monorepo shared @company/ui Button API change', () => {
  let runId = ''

  beforeAll(async () => {
    if (!isConnected) return
    const result = await persistAnalysisRun(repo, {
      orgName: TEST_ORG,
      repoFullName: TEST_REPO,
      prMetadata: PR_MONOREPO,
      astChunks: [UI_PKG_BUTTON_CHUNK, DASHBOARD_CHECKOUT_CHUNK, ADMIN_ORDERS_CHUNK],
      specFiles: MONOREPO_SPEC_FILES,
      rawMarkdown:
        '## 🟡 Tests en riesgo\n' +
        '#### `should approve order via approve-order-btn` — `apps/admin/orders.spec.ts`\n' +
        '**Por qué es riesgo:** approveOrder ahora recibe selectedOrder?.id — puede ser undefined\n' +
        '#### `should reject order via reject-order-btn` — `apps/admin/orders.spec.ts`\n' +
        '**Por qué es riesgo:** rejectOrder ahora requiere selección previa de fila\n' +
        '## ✅ Tests no afectados\n' +
        '- `should show btn-loading-spinner while submitting` — nuevo elemento en shared Button\n' +
        '- `should display orders-table` — DataTable es nuevo, no rompe nada\n' +
        '- `should show btn-icon on approve button` — nuevo elemento de icono',
      predictions: MONOREPO_PREDICTIONS,
      model: 'llama3.2',
      temperature: 0.1,
      analysisStartedAt: Date.now() - 10000,
      llmDurationMs: 5900,
    })
    runId = result.runId
  }, 30_000)

  neo4jIt('shared Button chunk tiene rutas packages/ (cross-package)', async () => {
    const astId = makeASTChunkId(UI_PKG_BUTTON_CHUNK.filename, UI_PKG_BUTTON_CHUNK.rawDiff)
    const records = await cypher('MATCH (a:ASTChunk {id: $id}) RETURN a', { id: astId })
    const ast = records[0].get('a').properties

    expect(ast.filename).toMatch(/^packages\//)
    expect(ast.summary).toContain('onPress')
    expect(ast.summary).toContain('cross-platform')
    expect(ast.functions).toContain('forwardRef')
  })

  neo4jIt('los 3 ASTChunks tienen rutas de packages/ y apps/ distintos', async () => {
    const records = await cypher(
      `MATCH (run:AnalysisRun {id: $runId})-[:INCLUDES]->(ast:ASTChunk)
       RETURN ast.filename AS filename ORDER BY ast.filename`,
      { runId }
    )
    expect(records).toHaveLength(3)
    const filenames: string[] = records.map((r) => r.get('filename'))

    const hasPackages = filenames.some((f) => f.startsWith('packages/'))
    const hasDashboard = filenames.some((f) => f.startsWith('apps/dashboard/'))
    const hasAdmin = filenames.some((f) => f.startsWith('apps/admin/'))

    expect(hasPackages).toBe(true)
    expect(hasDashboard).toBe(true)
    expect(hasAdmin).toBe(true)
  })

  neo4jIt('shared Button chunk tiene btn-loading-spinner y btn-icon como JSXChanges nuevos', async () => {
    const astId = makeASTChunkId(UI_PKG_BUTTON_CHUNK.filename, UI_PKG_BUTTON_CHUNK.rawDiff)
    const records = await cypher(
      `MATCH (a:ASTChunk {id: $id})-[:HAS_JSX_CHANGE]->(j:JSXChange)
       RETURN j.addedValue AS added ORDER BY j.addedValue`,
      { id: astId }
    )
    const added: string[] = records.map((r) => r.get('added'))
    expect(added).toContain('btn-loading-spinner')
    expect(added).toContain('btn-icon')
  })

  neo4jIt('apps/admin chunk tiene orders-table como JSXChange nuevo', async () => {
    const astId = makeASTChunkId(ADMIN_ORDERS_CHUNK.filename, ADMIN_ORDERS_CHUNK.rawDiff)
    const records = await cypher(
      `MATCH (a:ASTChunk {id: $id})-[:HAS_JSX_CHANGE]->(j:JSXChange)
       RETURN j.addedValue AS added`,
      { id: astId }
    )
    expect(records).toHaveLength(1)
    expect(records[0].get('added')).toBe('orders-table')
  })

  neo4jIt('spec files de monorepo tienen rutas apps/dashboard y apps/admin', async () => {
    const records = await cypher(
      `MATCH (run:AnalysisRun {id: $runId})-[:INCLUDES]->(ast:ASTChunk)-[:MATCHED]->(spec:SpecChunk)
       RETURN DISTINCT spec.filename AS fname ORDER BY spec.filename`,
      { runId }
    )
    const filenames: string[] = records.map((r) => r.get('fname'))
    const hasMultiAppSpec = filenames.some((f) => f.includes('dashboard') || f.includes('admin'))
    // SpecChunks de ambas apps deben estar en el grafo
    expect(hasMultiAppSpec).toBe(true)
  })

  neo4jIt('0 broken tests — el cambio de API es backward-compat en test IDs', async () => {
    const records = await cypher(
      `MATCH (run:AnalysisRun {id: $runId})-[:PRODUCED]->(llm:LLMPrediction)
       RETURN llm.brokenCount AS broken, llm.riskCount AS risk, llm.okCount AS ok`,
      { runId }
    )
    const p = records[0]
    expect(p.get('broken').toNumber()).toBe(0)
    expect(p.get('risk').toNumber()).toBe(2)
    expect(p.get('ok').toNumber()).toBe(3)
  })
})

// ═══════════════════════════════════════════════════════════
// Suite 10 — Cross-library queries (PRs 104-107)
// ═══════════════════════════════════════════════════════════

describe('Integration — Cross-library graph queries (PRs 104-107)', () => {
  neo4jIt('el repo tiene los 7 PRs analizados en total (101-107)', async () => {
    const repoId = makeRepoId(TEST_ORG, 'poc-front-app')
    const records = await cypher(
      `MATCH (r:Repo {id: $repoId})-[:HAS_PR]->(pr:PullRequest)
       WHERE pr.prNumber IN [101, 102, 103, 104, 105, 106, 107]
       RETURN count(pr) AS c`,
      { repoId }
    )
    expect(records[0].get('c').toNumber()).toBe(7)
  })

  neo4jIt('todos los broken tests del repo cross-library (PRs 101-106)', async () => {
    const repoId = makeRepoId(TEST_ORG, 'poc-front-app')
    const records = await cypher(
      `MATCH (r:Repo {id: $repoId})-[:HAS_PR]->(pr:PullRequest)
             -[:ANALYZED_BY]->(run:AnalysisRun)
             -[:PRODUCED]->(llm:LLMPrediction)
             -[:CONTAINS]->(tp:TestPrediction {status: 'broken'})
       WHERE pr.prNumber IN [101, 102, 103, 104, 105, 106]
       RETURN pr.prNumber AS prNum, count(tp) AS brokenCount
       ORDER BY pr.prNumber`,
      { repoId }
    )
    // PR 101: 1, PR 102: 2, PR 103: 0, PR 104: 2, PR 105: 1, PR 106: 2
    const byPr: Record<number, number> = {}
    records.forEach((r) => {
      byPr[r.get('prNum').toNumber()] = r.get('brokenCount').toNumber()
    })
    expect(byPr[101]).toBe(1)
    expect(byPr[102]).toBe(2)
    expect(byPr[104]).toBe(2)
    expect(byPr[105]).toBe(1)
    expect(byPr[106]).toBe(2)
  })

  neo4jIt('ASTChunks de la shared UI package identificables por path packages/', async () => {
    const records = await cypher(
      `MATCH (a:ASTChunk)
       WHERE a.filename STARTS WITH 'packages/'
       RETURN a.filename AS filename ORDER BY a.filename`
    )
    expect(records.length).toBeGreaterThanOrEqual(1)
    expect(records[0].get('filename')).toContain('packages/ui')
  })

  neo4jIt('Radix Dialog crea más JSXChanges que el Modal custom (forwardRef pattern)', async () => {
    const dialogAstId = makeASTChunkId(RADIX_DIALOG_CHUNK.filename, RADIX_DIALOG_CHUNK.rawDiff)
    const records = await cypher(
      `MATCH (a:ASTChunk {id: $id})-[:HAS_JSX_CHANGE]->(j:JSXChange)
       RETURN count(j) AS c`,
      { id: dialogAstId }
    )
    // Dialog.tsx tiene 3 JSXChanges (overlay + content + close)
    expect(records[0].get('c').toNumber()).toBe(3)
  })

  neo4jIt('query cross-library: todos los chunks que usan librerías externas por su summary', async () => {
    const records = await cypher(
      `MATCH (a:ASTChunk)
       WHERE a.summary CONTAINS 'Radix' OR
             a.summary CONTAINS 'styled-components' OR a.summary CONTAINS 'shouldForwardProp' OR
             a.summary CONTAINS 'Singleton' OR a.summary CONTAINS 'HOF' OR
             a.summary CONTAINS 'cross-platform' OR a.summary CONTAINS 'optimistic'
       RETURN a.filename AS filename ORDER BY a.filename`
    )
    // Al menos los chunks de PR 104-107 más algunos de 101-103
    expect(records.length).toBeGreaterThanOrEqual(6)

    const filenames: string[] = records.map((r) => r.get('filename'))
    expect(filenames.some((f) => f.includes('Dialog'))).toBe(true)
    expect(filenames.some((f) => f.includes('Button.styled'))).toBe(true)
    // useProductQuery.ts — summary contiene "optimistic"
    expect(filenames.some((f) => f.includes('useProductQuery'))).toBe(true)
    expect(filenames.some((f) => f.includes('packages/'))).toBe(true)
  })

  neo4jIt('hooks puros (sin JSXChanges) identificados por 0 HAS_JSX_CHANGE', async () => {
    const records = await cypher(
      `MATCH (a:ASTChunk)
       WHERE (a.filename CONTAINS 'hook' OR a.filename CONTAINS 'Hook' OR a.filename CONTAINS 'use')
         AND NOT (a)-[:HAS_JSX_CHANGE]->()
       RETURN a.filename AS filename ORDER BY a.filename`
    )
    const filenames: string[] = records.map((r) => r.get('filename'))
    // useAuth, useFetch, useProductQuery, useAuth — todos hooks puros sin JSX
    expect(filenames.some((f) => f.includes('useFetch'))).toBe(true)
    expect(filenames.some((f) => f.includes('useProductQuery'))).toBe(true)
  })

  neo4jIt('content-addressable: spec chunks de librerías no se duplican cross-PR', async () => {
    const records = await cypher(
      `MATCH (s:SpecChunk)
       RETURN count(DISTINCT s.id) AS uniqueIds, count(s) AS total`
    )
    const uniqueIds = records[0].get('uniqueIds').toNumber()
    const total = records[0].get('total').toNumber()
    // No puede haber duplicados si UNIQUE constraint está activo
    expect(uniqueIds).toBe(total)
  })
})
