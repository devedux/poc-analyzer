import {
  embed,
  embedBatch,
  cosineSimilarity,
  buildDiffContextualText,
  buildSpecContextualText,
} from './embeddings'
import { buildBM25Index, searchBM25 } from './bm25-retrieval'
import type { ASTChunk, SpecChunk, SemanticMatch, ScoredSpecChunk } from './types'

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
 */
function reciprocalRankFusion(
  denseRanked: ScoredSpecChunk[],
  bm25Ranked: Array<{ chunk: SpecChunk; score: number }>,
  specChunks: SpecChunk[],
  topK: number
): ScoredSpecChunk[] {
  const rrfScores = new Map<number, number>()

  denseRanked.forEach(({ chunk }, rank) => {
    const idx = specChunks.indexOf(chunk)
    rrfScores.set(idx, (rrfScores.get(idx) ?? 0) + 1 / (RRF_K + rank + 1))
  })

  bm25Ranked.forEach(({ chunk }, rank) => {
    const idx = specChunks.indexOf(chunk)
    rrfScores.set(idx, (rrfScores.get(idx) ?? 0) + 1 / (RRF_K + rank + 1))
  })

  return [...rrfScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([idx, score]) => ({ chunk: specChunks[idx], score }))
}

/**
 * Hybrid Retrieval: Dense Embeddings + BM25, fusionados con RRF.
 *
 * Flujo por cada diff chunk:
 * 1. Dense: embedding contextual → cosine similarity vs todos los spec chunks
 * 2. BM25:  query de keywords → coincidencias exactas en testName/content
 * 3. RRF:   fusiona ambos rankings → top-K specs con mayor relevancia combinada
 *
 * Los batch embeddings se generan en paralelo para minimizar latencia.
 */
export async function matchChunks(
  diffChunks: ASTChunk[],
  specChunks: SpecChunk[],
  topK: number = DEFAULT_TOP_K
): Promise<SemanticMatch[]> {
  if (diffChunks.length === 0 || specChunks.length === 0) return []

  const bm25Index = buildBM25Index(specChunks)

  const [diffEmbeddings, specEmbeddings] = await Promise.all([
    embedBatch(diffChunks.map(buildDiffContextualText)),
    embedBatch(specChunks.map(buildSpecContextualText)),
  ])

  return diffChunks.map((diffChunk, i) => {
    const query = buildDiffContextualText(diffChunk)

    const denseRanked: ScoredSpecChunk[] = specChunks
      .map((chunk, j) => ({ chunk, score: cosineSimilarity(diffEmbeddings[i], specEmbeddings[j]) }))
      .sort((a, b) => b.score - a.score)

    const bm25Ranked = searchBM25(bm25Index, specChunks, query)

    return {
      diffChunk,
      relevantSpecs: reciprocalRankFusion(denseRanked, bm25Ranked, specChunks, topK),
    }
  })
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

  const denseRanked: ScoredSpecChunk[] = specChunks
    .map((chunk, j) => ({ chunk, score: cosineSimilarity(diffEmbedding, specEmbeddings[j]) }))
    .sort((a, b) => b.score - a.score)

  const bm25Ranked = searchBM25(bm25Index, specChunks, query)

  return {
    diffChunk,
    relevantSpecs: reciprocalRankFusion(denseRanked, bm25Ranked, specChunks, topK),
  }
}
