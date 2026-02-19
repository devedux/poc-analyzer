import { describe, it, expect } from 'vitest'
import { buildBM25Index, searchBM25 } from '../bm25-retrieval'
import type { SpecChunk } from '../types'

const SPEC_CHUNKS: SpecChunk[] = [
  {
    testName: 'el botón de pago tiene el texto correcto',
    filename: 'checkout.spec.ts',
    content: "test('...', async ({ page }) => { await page.getByTestId('checkout-btn').toHaveText('Pagar') })",
  },
  {
    testName: 'muestra el resumen del pedido',
    filename: 'checkout.spec.ts',
    content: "test('...', async ({ page }) => { await page.getByText('Resumen del pedido') })",
  },
  {
    testName: 'el botón cancelar aparece tras confirmar',
    filename: 'checkout.spec.ts',
    content: "test('...', async ({ page }) => { await page.getByTestId('cancel-btn') })",
  },
]

describe('buildBM25Index', () => {
  it('should build an index without throwing', () => {
    expect(() => buildBM25Index(SPEC_CHUNKS)).not.toThrow()
  })

  it('should build an index from empty array', () => {
    expect(() => buildBM25Index([])).not.toThrow()
  })
})

describe('searchBM25', () => {
  it('should return results for a matching query', () => {
    const index = buildBM25Index(SPEC_CHUNKS)
    const results = searchBM25(index, SPEC_CHUNKS, 'checkout-btn pago')
    expect(results.length).toBeGreaterThan(0)
  })

  it('should return empty array for a query with no matches', () => {
    const index = buildBM25Index(SPEC_CHUNKS)
    const results = searchBM25(index, SPEC_CHUNKS, 'xyznotfound123')
    expect(results).toHaveLength(0)
  })

  it('should return results sorted by score descending', () => {
    const index = buildBM25Index(SPEC_CHUNKS)
    const results = searchBM25(index, SPEC_CHUNKS, 'checkout pago botón')
    const scores = results.map((r) => r.score)
    for (let i = 0; i < scores.length - 1; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i + 1])
    }
  })

  it('should rank the chunk whose testName matches the query highest', () => {
    const index = buildBM25Index(SPEC_CHUNKS)
    const results = searchBM25(index, SPEC_CHUNKS, 'botón pago texto correcto')
    expect(results[0].chunk.testName).toBe('el botón de pago tiene el texto correcto')
  })

  it('should return chunk references matching the original array', () => {
    const index = buildBM25Index(SPEC_CHUNKS)
    const results = searchBM25(index, SPEC_CHUNKS, 'cancelar')
    expect(SPEC_CHUNKS).toContain(results[0].chunk)
  })

  it('should return empty array when index is empty', () => {
    const index = buildBM25Index([])
    const results = searchBM25(index, [], 'checkout')
    expect(results).toHaveLength(0)
  })
})
