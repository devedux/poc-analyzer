import neo4j, { Driver, Session, Transaction } from 'neo4j-driver'
import { createHash, randomUUID } from 'crypto'
import type {
  ASTChunk,
  SpecChunk,
  JSXChange,
  PRMetadata,
  ScoredSpecChunkDetailed,
  AnalyzeResult,
} from './types'

// ─── Content-addressable ID helpers ───────────────────────

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 40)
}

export function makeOrgId(name: string): string {
  return sha256(`org:${name}`)
}

export function makeRepoId(orgName: string, repoName: string): string {
  return sha256(`repo:${orgName}/${repoName}`)
}

export function makePRId(repoId: string, prNumber: number): string {
  return sha256(`pr:${repoId}:${prNumber}`)
}

export function makeASTChunkId(filename: string, rawDiff: string): string {
  return sha256(`ast:${filename}:${rawDiff}`)
}

export function makeSpecChunkId(content: string): string {
  return sha256(`spec:${content}`)
}

export function makeJSXChangeId(change: JSXChange): string {
  return sha256(
    `jsx:${change.element}:${change.attribute}:${change.addedValue ?? ''}:${change.removedValue ?? ''}`
  )
}

export function makeComponentId(repoFullName: string, componentName: string): string {
  return sha256(`component:${repoFullName}:${componentName}`)
}

// ─── Driver factory ────────────────────────────────────────

export interface Neo4jConfig {
  uri: string
  user: string
  password: string
}

export function createNeo4jDriver(config: Neo4jConfig): Driver {
  return neo4j.driver(config.uri, neo4j.auth.basic(config.user, config.password), {
    maxConnectionPoolSize: 10,
    connectionAcquisitionTimeout: 10_000,
  })
}

export function getNeo4jConfig(): Neo4jConfig {
  const uri = process.env.NEO4J_URI
  const user = process.env.NEO4J_USER
  const password = process.env.NEO4J_PASSWORD

  if (!uri || !user || !password) {
    throw new Error('NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD are required')
  }

  return { uri, user, password }
}

// ─── AnalysisRunInput — datos necesarios para persistir un run ─

export interface AnalysisRunInput {
  prMetadata: PRMetadata
  orgName: string
  repoFullName: string
  model: string
  temperature: number
  durationMs: number
  astChunks: ASTChunk[]
  astEmbeddings: number[][]
  specMatches: Array<{
    astChunk: ASTChunk
    specChunkEmbeddings: Map<string, number[]>
    relevantSpecs: ScoredSpecChunkDetailed[]
  }>
  specChunks: SpecChunk[]
  specEmbeddings: Map<string, number[]>
  predictions: AnalyzeResult[]
  rawMarkdown: string
  llmDurationMs: number
}

// ─── Neo4j operations ─────────────────────────────────────

export class Neo4jRepository {
  constructor(private readonly driver: Driver) {}

  private async runInSession<T>(fn: (session: Session) => Promise<T>): Promise<T> {
    const session = this.driver.session()
    try {
      return await fn(session)
    } finally {
      await session.close()
    }
  }

  private async runInTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.runInSession((session) => session.writeTransaction(fn))
  }

  async mergeOrg(name: string, platform: 'github' | 'gitlab' | 'bitbucket' = 'github'): Promise<string> {
    const id = makeOrgId(name)
    await this.runInTransaction(async (tx) => {
      await tx.run(
        `MERGE (n:Org {id: $id})
         ON CREATE SET n.name = $name, n.platform = $platform`,
        { id, name, platform }
      )
    })
    return id
  }

  async mergeRepo(orgId: string, orgName: string, repoFullName: string, language = 'typescript'): Promise<string> {
    const parts = repoFullName.split('/')
    const repoName = parts[parts.length - 1] ?? repoFullName
    const id = makeRepoId(orgName, repoName)
    await this.runInTransaction(async (tx) => {
      await tx.run(
        `MERGE (n:Repo {id: $id})
         ON CREATE SET n.name = $name, n.fullName = $fullName,
                       n.language = $language, n.createdAt = datetime()`,
        { id, name: repoName, fullName: repoFullName, language }
      )
      await tx.run(
        `MATCH (org:Org {id: $orgId}), (repo:Repo {id: $repoId})
         MERGE (org)-[:OWNS]->(repo)`,
        { orgId, repoId: id }
      )
    })
    return id
  }

  async mergePullRequest(repoId: string, meta: PRMetadata): Promise<string> {
    const id = makePRId(repoId, meta.prNumber)
    await this.runInTransaction(async (tx) => {
      await tx.run(
        `MERGE (n:PullRequest {id: $id})
         ON CREATE SET n.prNumber = $prNumber, n.title = $title,
                       n.description = $description, n.author = $author,
                       n.branch = $branch, n.commitSha = $commitSha,
                       n.baseSha = $baseSha,
                       n.createdAt = datetime($createdAt),
                       n.mergedAt = CASE WHEN $mergedAt IS NOT NULL THEN datetime($mergedAt) ELSE null END`,
        {
          id,
          prNumber: neo4j.int(meta.prNumber),
          title: meta.title,
          description: meta.description,
          author: meta.author,
          branch: meta.branch,
          commitSha: meta.commitSha,
          baseSha: meta.baseSha,
          createdAt: meta.createdAt,
          mergedAt: meta.mergedAt,
        }
      )
      await tx.run(
        `MATCH (repo:Repo {id: $repoId}), (pr:PullRequest {id: $prId})
         MERGE (repo)-[:HAS_PR]->(pr)`,
        { repoId, prId: id }
      )
    })
    return id
  }

  async createAnalysisRun(
    prId: string,
    opts: { model: string; temperature: number; durationMs: number; astChunkCount: number; specChunkCount: number }
  ): Promise<string> {
    const id = randomUUID()
    await this.runInTransaction(async (tx) => {
      await tx.run(
        `CREATE (n:AnalysisRun {
           id: $id, model: $model, temperature: $temperature,
           durationMs: $durationMs, astChunkCount: $astChunkCount,
           specChunkCount: $specChunkCount, createdAt: datetime()
         })`,
        {
          id,
          model: opts.model,
          temperature: opts.temperature,
          durationMs: neo4j.int(opts.durationMs),
          astChunkCount: neo4j.int(opts.astChunkCount),
          specChunkCount: neo4j.int(opts.specChunkCount),
        }
      )
      await tx.run(
        `MATCH (pr:PullRequest {id: $prId}), (run:AnalysisRun {id: $runId})
         MERGE (pr)-[:ANALYZED_BY]->(run)`,
        { prId, runId: id }
      )
    })
    return id
  }

  async mergeASTChunk(
    runId: string,
    order: number,
    chunk: ASTChunk,
    embedding: number[]
  ): Promise<string> {
    const id = makeASTChunkId(chunk.filename, chunk.rawDiff)
    await this.runInTransaction(async (tx) => {
      await tx.run(
        `MERGE (n:ASTChunk {id: $id})
         ON CREATE SET n.filename = $filename, n.rawDiff = $rawDiff,
                       n.summary = $summary, n.components = $components,
                       n.functions = $functions, n.testIds = $testIds,
                       n.hunkCount = $hunkCount, n.linesAdded = $linesAdded,
                       n.linesRemoved = $linesRemoved,
                       n.embedding = $embedding,
                       n.embeddingInputHash = $embeddingInputHash,
                       n.createdAt = datetime()`,
        {
          id,
          filename: chunk.filename,
          rawDiff: chunk.rawDiff,
          summary: chunk.summary,
          components: chunk.components,
          functions: chunk.functions,
          testIds: chunk.testIds,
          hunkCount: neo4j.int(chunk.hunks.length),
          linesAdded: neo4j.int(
            chunk.hunks.flatMap((h) => h.lines).filter((l) => l.type === 'added').length
          ),
          linesRemoved: neo4j.int(
            chunk.hunks.flatMap((h) => h.lines).filter((l) => l.type === 'removed').length
          ),
          embedding,
          embeddingInputHash: sha256(chunk.filename + chunk.rawDiff),
          createdAt: new Date().toISOString(),
        }
      )
      await tx.run(
        `MATCH (run:AnalysisRun {id: $runId}), (ast:ASTChunk {id: $astId})
         MERGE (run)-[r:INCLUDES {order: $order}]->(ast)`,
        { runId, astId: id, order: neo4j.int(order) }
      )
    })
    return id
  }

  async mergeSpecChunk(chunk: SpecChunk, embedding: number[]): Promise<string> {
    const id = makeSpecChunkId(chunk.content)
    await this.runInTransaction(async (tx) => {
      await tx.run(
        `MERGE (n:SpecChunk {id: $id})
         ON CREATE SET n.testName = $testName, n.filename = $filename,
                       n.content = $content, n.type = $type,
                       n.framework = $framework, n.embedding = $embedding,
                       n.embeddingInputHash = $embeddingInputHash,
                       n.createdAt = datetime()`,
        {
          id,
          testName: chunk.testName,
          filename: chunk.filename,
          content: chunk.content,
          type: 'e2e',
          framework: 'playwright',
          embedding,
          embeddingInputHash: sha256(chunk.content),
        }
      )
    })
    return id
  }

  async mergeJSXChange(astId: string, change: JSXChange): Promise<string> {
    const id = makeJSXChangeId(change)
    await this.runInTransaction(async (tx) => {
      await tx.run(
        `MERGE (n:JSXChange {id: $id})
         ON CREATE SET n.element = $element, n.attribute = $attribute,
                       n.addedValue = $addedValue, n.removedValue = $removedValue`,
        {
          id,
          element: change.element,
          attribute: change.attribute,
          addedValue: change.addedValue ?? null,
          removedValue: change.removedValue ?? null,
        }
      )
      await tx.run(
        `MATCH (ast:ASTChunk {id: $astId}), (jsx:JSXChange {id: $jsxId})
         MERGE (ast)-[:HAS_JSX_CHANGE]->(jsx)`,
        { astId, jsxId: id }
      )
    })
    return id
  }

  async createMatchRelationship(
    astId: string,
    specId: string,
    scores: { cosineScore: number; bm25Score: number; rrfScore: number; rank: number }
  ): Promise<void> {
    await this.runInTransaction(async (tx) => {
      await tx.run(
        `MATCH (ast:ASTChunk {id: $astId}), (spec:SpecChunk {id: $specId})
         MERGE (ast)-[r:MATCHED]->(spec)
         SET r.cosineScore = $cosineScore, r.bm25Score = $bm25Score,
             r.rrfScore = $rrfScore, r.rank = $rank`,
        {
          astId,
          specId,
          cosineScore: scores.cosineScore,
          bm25Score: scores.bm25Score,
          rrfScore: scores.rrfScore,
          rank: neo4j.int(scores.rank),
        }
      )
    })
  }

  async createLLMPrediction(
    runId: string,
    opts: {
      rawMarkdown: string
      brokenCount: number
      riskCount: number
      okCount: number
      model: string
      durationMs: number
    }
  ): Promise<string> {
    const id = randomUUID()
    await this.runInTransaction(async (tx) => {
      await tx.run(
        `CREATE (n:LLMPrediction {
           id: $id, rawMarkdown: $rawMarkdown,
           brokenCount: $brokenCount, riskCount: $riskCount, okCount: $okCount,
           model: $model, durationMs: $durationMs, createdAt: datetime()
         })`,
        {
          id,
          rawMarkdown: opts.rawMarkdown,
          brokenCount: neo4j.int(opts.brokenCount),
          riskCount: neo4j.int(opts.riskCount),
          okCount: neo4j.int(opts.okCount),
          model: opts.model,
          durationMs: neo4j.int(opts.durationMs),
        }
      )
      await tx.run(
        `MATCH (run:AnalysisRun {id: $runId}), (pred:LLMPrediction {id: $predId})
         MERGE (run)-[:PRODUCED]->(pred)`,
        { runId, predId: id }
      )
    })
    return id
  }

  async createTestPrediction(
    predictionId: string,
    specId: string | null,
    result: AnalyzeResult
  ): Promise<string> {
    const id = randomUUID()
    await this.runInTransaction(async (tx) => {
      await tx.run(
        `CREATE (n:TestPrediction {
           id: $id, testName: $testName, file: $file, line: $line,
           status: $status, reason: $reason, confidence: $confidence,
           createdAt: datetime()
         })`,
        {
          id,
          testName: result.test,
          file: result.file,
          line: neo4j.int(result.line),
          status: result.status,
          reason: result.reason,
          confidence: 1.0, // placeholder — Step 7 (fine-tuning)
        }
      )
      await tx.run(
        `MATCH (llm:LLMPrediction {id: $predId}), (tp:TestPrediction {id: $tpId})
         MERGE (llm)-[:CONTAINS]->(tp)`,
        { predId: predictionId, tpId: id }
      )
      if (specId) {
        await tx.run(
          `MATCH (tp:TestPrediction {id: $tpId}), (spec:SpecChunk {id: $specId})
           MERGE (tp)-[:REFERS_TO]->(spec)`,
          { tpId: id, specId }
        )
      }
    })
    return id
  }

  /**
   * Ejecuta una query Cypher arbitraria en una sesión de escritura.
   * Útil para migrations, cleanup en tests, y queries one-off.
   */
  async runCypher(query: string, params: Record<string, unknown> = {}): Promise<import('neo4j-driver').Record[]> {
    return this.runInSession(async (session) => {
      const result = await session.run(query, params)
      return result.records
    })
  }

  async verifyConnectivity(): Promise<void> {
    await this.driver.verifyConnectivity()
  }

  async close(): Promise<void> {
    await this.driver.close()
  }
}
