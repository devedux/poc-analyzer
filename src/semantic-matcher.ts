import {
  embed,
  embedBatch,
  cosineSimilarity,
  buildDiffContextualText,
  buildSpecContextualText,
} from './embeddings'
import { buildBM25Index, searchBM25 } from './bm25-retrieval'
import type {
  ASTChunk,
  SpecChunk,
  SemanticMatch,
  ScoredSpecChunk,
  SemanticMatchDetailed,
  ScoredSpecChunkDetailed,
} from './types'

const DEFAULT_TOP_K = 3

/**
 * Constante estándar de Reciprocal Rank Fusion.
 * k=60 reduce el impacto de diferencias entre posiciones altas del ranking,
 * haciendo la fusión más robusta ante scores inconsistentes entre listas.
 */
const RRF_K = 60

/**
 * Reciprocal Rank Fusion: combina dos listas de rankings sin necesitar
 * normalizar sus scores (BM25 y cosine similarity están en escalas distintas).
 *
 * Fórmula: RRF(d) = Σ 1 / (k + rank(d))
 *
 * Un chunk que aparece en el top de AMBAS listas (semántico + keywords)
 * recibe un score RRF más alto que uno que solo lidera en una.
 *
 * Retorna ScoredSpecChunkDetailed preservando las 3 señales por separado.
 */
function reciprocalRankFusionDetailed(
  denseRanked: Array<{ chunk: SpecChunk; cosineScore: number }>,
  bm25Ranked: Array<{ chunk: SpecChunk; bm25Score: number }>,
  specChunks: SpecChunk[],
  topK: number
): ScoredSpecChunkDetailed[] {
  const rrfScores = new Map<number, number>()
  const cosineScores = new Map<number, number>()
  const bm25Scores = new Map<number, number>()

  denseRanked.forEach(({ chunk, cosineScore }, rank) => {
    const idx = specChunks.indexOf(chunk)
    rrfScores.set(idx, (rrfScores.get(idx) ?? 0) + 1 / (RRF_K + rank + 1))
    cosineScores.set(idx, cosineScore)
  })

  bm25Ranked.forEach(({ chunk, bm25Score }, rank) => {
    const idx = specChunks.indexOf(chunk)
    rrfScores.set(idx, (rrfScores.get(idx) ?? 0) + 1 / (RRF_K + rank + 1))
    bm25Scores.set(idx, bm25Score)
  })

  return [...rrfScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([idx, rrfScore], position) => ({
      chunk: specChunks[idx],
      cosineScore: cosineScores.get(idx) ?? 0,
      bm25Score: bm25Scores.get(idx) ?? 0,
      rrfScore,
      rank: position + 1,
    }))
}

/**
 * Hybrid Retrieval con scores detallados: Dense Embeddings + BM25, fusionados con RRF.
 * Preserva cosine, BM25 y RRF por separado — base para training y feedback loop.
 *
 * Flujo por cada diff chunk:
 * 1. Dense: embedding contextual → cosine similarity vs todos los spec chunks
 * 2. BM25:  query de keywords → coincidencias exactas en testName/content
 * 3. RRF:   fusiona ambos rankings → top-K specs con mayor relevancia combinada
 */
export async function matchChunksDetailed(
  diffChunks: ASTChunk[],
  specChunks: SpecChunk[],
  topK: number = DEFAULT_TOP_K
): Promise<SemanticMatchDetailed[]> {
  if (diffChunks.length === 0 || specChunks.length === 0) return []

  const bm25Index = buildBM25Index(specChunks)

  const [diffEmbeddings, specEmbeddings] = await Promise.all([
    embedBatch(diffChunks.map(buildDiffContextualText)),
    embedBatch(specChunks.map(buildSpecContextualText)),
  ])

  return diffChunks.map((diffChunk, i) => {
    const query = buildDiffContextualText(diffChunk)

    const denseRanked = specChunks
      .map((chunk, j) => ({
        chunk,
        cosineScore: cosineSimilarity(diffEmbeddings[i], specEmbeddings[j]),
      }))
      .sort((a, b) => b.cosineScore - a.cosineScore)

    const bm25Results = searchBM25(bm25Index, specChunks, query)
    const bm25Ranked = bm25Results.map((r) => ({ chunk: r.chunk, bm25Score: r.score }))

    return {
      diffChunk,
      relevantSpecs: reciprocalRankFusionDetailed(denseRanked, bm25Ranked, specChunks, topK),
    }
  })
}

/**
 * Hybrid Retrieval: Dense Embeddings + BM25, fusionados con RRF.
 * Wrapper de matchChunksDetailed para compatibilidad con el código existente.
 */
export async function matchChunks(
  diffChunks: ASTChunk[],
  specChunks: SpecChunk[],
  topK: number = DEFAULT_TOP_K
): Promise<SemanticMatch[]> {
  const detailed = await matchChunksDetailed(diffChunks, specChunks, topK)
  return detailed.map(({ diffChunk, relevantSpecs }) => ({
    diffChunk,
    relevantSpecs: relevantSpecs.map(
      ({ chunk, rrfScore }): ScoredSpecChunk => ({ chunk, score: rrfScore })
    ),
  }))
}

/**
 * Versión sin batch para cuando hay un solo diff chunk.
 */
export async function matchSingleChunk(
  diffChunk: ASTChunk,
  specChunks: SpecChunk[],
  topK: number = DEFAULT_TOP_K
): Promise<SemanticMatch> {
  if (specChunks.length === 0) return { diffChunk, relevantSpecs: [] }

  const bm25Index = buildBM25Index(specChunks)
  const query = buildDiffContextualText(diffChunk)

  const [diffEmbedding, specEmbeddings] = await Promise.all([
    embed(query),
    embedBatch(specChunks.map(buildSpecContextualText)),
  ])

  const denseRanked = specChunks
    .map((chunk, j) => ({
      chunk,
      cosineScore: cosineSimilarity(diffEmbedding, specEmbeddings[j]),
    }))
    .sort((a, b) => b.cosineScore - a.cosineScore)

  const bm25Results = searchBM25(bm25Index, specChunks, query)
  const bm25Ranked = bm25Results.map((r) => ({ chunk: r.chunk, bm25Score: r.score }))

  const relevantSpecs = reciprocalRankFusionDetailed(
    denseRanked,
    bm25Ranked,
    specChunks,
    topK
  ).map(({ chunk, rrfScore }): ScoredSpecChunk => ({ chunk, score: rrfScore }))

  return { diffChunk, relevantSpecs }
}
