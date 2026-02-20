import { embedBatch, buildDiffContextualText, buildSpecContextualText } from './embeddings'
import { chunkSpecs } from './spec-chunker'
import { matchChunksDetailed } from './semantic-matcher'
import {
  Neo4jRepository,
  makeSpecChunkId,
  createNeo4jDriver,
  getNeo4jConfig,
} from './neo4j'
import type { ASTChunk, PRMetadata, SpecFile, AnalyzeResult } from './types'

export interface PersistOptions {
  orgName: string
  repoFullName: string
  prMetadata: PRMetadata
  astChunks: ASTChunk[]
  specFiles: SpecFile[]
  rawMarkdown: string
  predictions: AnalyzeResult[]
  model: string
  temperature: number
  analysisStartedAt: number
  llmDurationMs: number
}

/**
 * Orquesta la persistencia completa de un AnalysisRun en Neo4j.
 *
 * Flujo:
 * 1. Merge Org → Repo → PullRequest
 * 2. Crear AnalysisRun (inmutable, no MERGE)
 * 3. Generar embeddings de ASTChunks + SpecChunks
 * 4. Merge ASTChunks + SpecChunks (content-addressable)
 * 5. Crear relaciones MATCHED con cosine + BM25 + RRF
 * 6. Crear JSXChange nodes
 * 7. Crear LLMPrediction + TestPrediction nodes
 */
export async function persistAnalysisRun(
  repo: Neo4jRepository,
  opts: PersistOptions
): Promise<{ runId: string; predictionId: string }> {
  const {
    orgName,
    repoFullName,
    prMetadata,
    astChunks,
    specFiles,
    rawMarkdown,
    predictions,
    model,
    temperature,
    analysisStartedAt,
    llmDurationMs,
  } = opts

  const specChunks = chunkSpecs(specFiles)

  // 1. Merge infrastructure nodes
  const orgId = await repo.mergeOrg(orgName)
  const repoId = await repo.mergeRepo(orgId, orgName, repoFullName)
  const prId = await repo.mergePullRequest(repoId, prMetadata)

  // 2. Generate embeddings in parallel (avoid re-embedding in matcher)
  const [astEmbeddings, specEmbeddings] = await Promise.all([
    astChunks.length > 0 ? embedBatch(astChunks.map(buildDiffContextualText)) : Promise.resolve([]),
    specChunks.length > 0 ? embedBatch(specChunks.map(buildSpecContextualText)) : Promise.resolve([]),
  ])

  // Build a map for quick lookup: specContent → embedding
  const specEmbeddingMap = new Map<string, number[]>()
  specChunks.forEach((chunk, i) => {
    specEmbeddingMap.set(makeSpecChunkId(chunk.content), specEmbeddings[i])
  })

  // 3. Semantic matching with detailed scores
  const matches =
    astChunks.length > 0 && specChunks.length > 0
      ? await matchChunksDetailed(astChunks, specChunks)
      : []

  const durationMs = Date.now() - analysisStartedAt

  // 4. Create AnalysisRun node
  const runId = await repo.createAnalysisRun(prId, {
    model,
    temperature,
    durationMs,
    astChunkCount: astChunks.length,
    specChunkCount: specChunks.length,
  })

  // 5. Merge ASTChunks + SpecChunks + relationships
  await Promise.all(
    astChunks.map(async (chunk, i) => {
      const astId = await repo.mergeASTChunk(runId, i, chunk, astEmbeddings[i] ?? [])

      // Persist JSXChange nodes
      for (const jsxChange of chunk.jsxChanges) {
        await repo.mergeJSXChange(astId, jsxChange)
      }

      // Persist relevant spec matches
      const match = matches.find((m) => m.diffChunk === chunk)
      if (match) {
        await Promise.all(
          match.relevantSpecs.map(async (scored) => {
            const specEmbedding = specEmbeddingMap.get(makeSpecChunkId(scored.chunk.content)) ?? []
            const specId = await repo.mergeSpecChunk(scored.chunk, specEmbedding)
            await repo.createMatchRelationship(astId, specId, {
              cosineScore: scored.cosineScore,
              bm25Score: scored.bm25Score,
              rrfScore: scored.rrfScore,
              rank: scored.rank,
            })
          })
        )
      }
    })
  )

  // 6. Also persist SpecChunks that weren't matched (for completeness)
  const matchedSpecContents = new Set(
    matches.flatMap((m) => m.relevantSpecs.map((s) => s.chunk.content))
  )
  const unmatchedSpecs = specChunks.filter((s) => !matchedSpecContents.has(s.content))
  await Promise.all(
    unmatchedSpecs.map(async (chunk) => {
      const embedding = specEmbeddingMap.get(makeSpecChunkId(chunk.content)) ?? []
      await repo.mergeSpecChunk(chunk, embedding)
    })
  )

  // 7. Create LLMPrediction
  const brokenCount = predictions.filter((p) => p.status === 'broken').length
  const riskCount = predictions.filter((p) => p.status === 'risk').length
  const okCount = predictions.filter((p) => p.status === 'ok').length

  const predictionId = await repo.createLLMPrediction(runId, {
    rawMarkdown,
    brokenCount,
    riskCount,
    okCount,
    model,
    durationMs: llmDurationMs,
  })

  // 8. Create TestPrediction nodes
  await Promise.all(
    predictions.map(async (result) => {
      // Try to find the matching SpecChunk id for REFERS_TO relationship
      const matchingSpec = specChunks.find(
        (s) => s.testName === result.test || s.filename === result.file
      )
      const specId = matchingSpec ? makeSpecChunkId(matchingSpec.content) : null
      await repo.createTestPrediction(predictionId, specId, result)
    })
  )

  return { runId, predictionId }
}

/**
 * Factory para crear GraphPersister con el driver de Neo4j configurado.
 * Retorna null si NEO4J_URI no está configurado (persistencia opcional).
 */
export function createGraphPersister(): Neo4jRepository | null {
  const uri = process.env.NEO4J_URI
  if (!uri) return null

  const config = getNeo4jConfig()
  const driver = createNeo4jDriver(config)
  return new Neo4jRepository(driver)
}
