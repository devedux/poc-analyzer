import {
  embed,
  embedBatch,
  cosineSimilarity,
  buildDiffContextualText,
  buildSpecContextualText,
} from './embeddings'
import type { ASTChunk, SpecChunk, SemanticMatch, ScoredSpecChunk } from './types'

const DEFAULT_TOP_K = 3

/**
 * Núcleo del semantic chunking:
 * Para cada diff chunk, encuentra los TOP_K spec chunks más relevantes
 * usando similitud semántica entre sus embeddings contextuales.
 *
 * Flujo:
 * 1. Genera texto contextual para cada chunk (diff y spec)
 * 2. Embede en batch para minimizar llamadas a Ollama
 * 3. Calcula similitud coseno entre cada par (diff, spec)
 * 4. Retorna los top-K specs por cada diff chunk
 */
export async function matchChunks(
  diffChunks: ASTChunk[],
  specChunks: SpecChunk[],
  topK: number = DEFAULT_TOP_K
): Promise<SemanticMatch[]> {
  if (diffChunks.length === 0 || specChunks.length === 0) return []

  // Textos contextuales (el "Contextual" de Contextual Embeddings)
  const diffTexts = diffChunks.map(buildDiffContextualText)
  const specTexts = specChunks.map(buildSpecContextualText)

  // Batch embed: una sola llamada por grupo
  const [diffEmbeddings, specEmbeddings] = await Promise.all([
    embedBatch(diffTexts),
    embedBatch(specTexts),
  ])

  // Para cada diff chunk, rankear todos los spec chunks por similitud
  return diffChunks.map((diffChunk, i) => {
    const diffVec = diffEmbeddings[i]

    const scored: ScoredSpecChunk[] = specChunks.map((chunk, j) => ({
      chunk,
      score: cosineSimilarity(diffVec, specEmbeddings[j]),
    }))

    const relevantSpecs = scored.sort((a, b) => b.score - a.score).slice(0, topK)

    return { diffChunk, relevantSpecs }
  })
}

/**
 * Versión sin batch para cuando hay un solo diff chunk.
 * Útil para testing o análisis incremental.
 */
export async function matchSingleChunk(
  diffChunk: ASTChunk,
  specChunks: SpecChunk[],
  topK: number = DEFAULT_TOP_K
): Promise<SemanticMatch> {
  const diffVec = await embed(buildDiffContextualText(diffChunk))
  const specTexts = specChunks.map(buildSpecContextualText)
  const specEmbeddings = await embedBatch(specTexts)

  const scored: ScoredSpecChunk[] = specChunks.map((chunk, i) => ({
    chunk,
    score: cosineSimilarity(diffVec, specEmbeddings[i]),
  }))

  return {
    diffChunk,
    relevantSpecs: scored.sort((a, b) => b.score - a.score).slice(0, topK),
  }
}
