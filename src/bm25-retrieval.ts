import MiniSearch from 'minisearch'
import type { SpecChunk } from './types'

type IndexedChunk = SpecChunk & { id: number }
export type BM25Index = MiniSearch<IndexedChunk>

/**
 * Construye un índice BM25 sobre los spec chunks.
 *
 * BM25 (Okapi BM25) complementa a los embeddings densos:
 * - Dense → captura significado semántico aunque no coincidan palabras
 * - BM25  → captura coincidencias exactas de keywords (testIds, nombres de componentes)
 *
 * Ejemplo: si el diff cambia `data-test-id="checkout-btn"`, BM25 lo
 * encuentra directo en el spec que usa `getByTestId('checkout-btn')`.
 */
export function buildBM25Index(chunks: SpecChunk[]): BM25Index {
  const index = new MiniSearch<IndexedChunk>({
    idField: 'id',
    fields: ['testName', 'content'],
    storeFields: ['id'],
    searchOptions: {
      boost: { testName: 2 }, // el nombre del test tiene más peso semántico
      fuzzy: 0.2,             // tolera typos leves (checkout-btn vs checkoutBtn)
    },
  })

  index.addAll(chunks.map((chunk, id) => ({ id, ...chunk })))
  return index
}

/**
 * Busca spec chunks por keywords usando BM25.
 * Retorna resultados ordenados por score descendente (MiniSearch ya los ordena).
 */
export function searchBM25(
  index: BM25Index,
  chunks: SpecChunk[],
  query: string
): Array<{ chunk: SpecChunk; score: number }> {
  const results = index.search(query)
  return results.map((r) => ({
    chunk: chunks[r.id as number],
    score: r.score,
  }))
}
