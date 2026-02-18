import { describe, it, expect, vi } from 'vitest'
import { matchChunks, matchSingleChunk } from '../semantic-matcher'
import type { ASTChunk, SpecChunk } from '../types'

// Mock embeddings para no depender de Ollama en tests
vi.mock('../embeddings', () => ({
  embedBatch: vi.fn(),
  embed: vi.fn(),
  buildDiffContextualText: vi.fn((chunk: ASTChunk) => `diff context: ${chunk.filename}`),
  buildSpecContextualText: vi.fn((chunk: SpecChunk) => `spec context: ${chunk.testName}`),
  cosineSimilarity: vi.fn((a: number[], b: number[]) => {
    // Similitud real para que el ranking sea determinístico en los tests
    let dot = 0, magA = 0, magB = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      magA += a[i] * a[i]
      magB += b[i] * b[i]
    }
    const mag = Math.sqrt(magA) * Math.sqrt(magB)
    return mag === 0 ? 0 : dot / mag
  }),
}))

import { embedBatch, embed } from '../embeddings'

const DIFF_CHUNK: ASTChunk = {
  filename: 'app/components/Checkout.tsx',
  rawDiff: '',
  hunks: [],
  components: ['CheckoutForm'],
  functions: [],
  jsxChanges: [{ element: 'button', attribute: 'data-test-id', addedValue: 'checkout-button' }],
  testIds: ['checkout-button'],
  summary: 'Componentes: CheckoutForm',
}

const SPEC_CHUNKS: SpecChunk[] = [
  {
    testName: 'el botón de pago tiene el texto correcto',
    filename: 'checkout.spec.ts',
    content: "test('el botón...', async ({ page }) => { await page.getByTestId('checkout-btn') })",
  },
  {
    testName: 'muestra el resumen del pedido',
    filename: 'checkout.spec.ts',
    content: "test('muestra el resumen...', async ({ page }) => { await page.getByText('Resumen') })",
  },
  {
    testName: 'el botón cancelar aparece tras confirmar',
    filename: 'checkout.spec.ts',
    content: "test('el botón cancelar...', async ({ page }) => { await page.getByTestId('cancel-btn') })",
  },
]

// Embeddings simulados: el primer spec chunk tiene mayor similitud con el diff chunk
const DIFF_EMBEDDING = [1.0, 0.0, 0.0]
const SPEC_EMBEDDINGS = [
  [0.9, 0.1, 0.0], // muy similar al diff
  [0.3, 0.8, 0.1], // poca similitud
  [0.1, 0.1, 0.9], // poca similitud
]

describe('matchChunks', () => {
  it('should return one match per diff chunk', async () => {
    vi.mocked(embedBatch)
      .mockResolvedValueOnce([DIFF_EMBEDDING])
      .mockResolvedValueOnce(SPEC_EMBEDDINGS)

    const matches = await matchChunks([DIFF_CHUNK], SPEC_CHUNKS)

    expect(matches).toHaveLength(1)
    expect(matches[0].diffChunk).toBe(DIFF_CHUNK)
  })

  it('should return top-K spec chunks sorted by score descending', async () => {
    vi.mocked(embedBatch)
      .mockResolvedValueOnce([DIFF_EMBEDDING])
      .mockResolvedValueOnce(SPEC_EMBEDDINGS)

    const matches = await matchChunks([DIFF_CHUNK], SPEC_CHUNKS, 2)

    const scores = matches[0].relevantSpecs.map((s) => s.score)
    expect(scores[0]).toBeGreaterThanOrEqual(scores[1])
    expect(matches[0].relevantSpecs).toHaveLength(2)
  })

  it('should rank the most similar spec first', async () => {
    vi.mocked(embedBatch)
      .mockResolvedValueOnce([DIFF_EMBEDDING])
      .mockResolvedValueOnce(SPEC_EMBEDDINGS)

    const matches = await matchChunks([DIFF_CHUNK], SPEC_CHUNKS)
    const topSpec = matches[0].relevantSpecs[0].chunk

    expect(topSpec.testName).toBe('el botón de pago tiene el texto correcto')
  })

  it('should not return more specs than available', async () => {
    vi.mocked(embedBatch)
      .mockResolvedValueOnce([DIFF_EMBEDDING])
      .mockResolvedValueOnce(SPEC_EMBEDDINGS)

    const matches = await matchChunks([DIFF_CHUNK], SPEC_CHUNKS, 10)

    expect(matches[0].relevantSpecs.length).toBeLessThanOrEqual(SPEC_CHUNKS.length)
  })

  it('should return empty array when there are no diff chunks', async () => {
    const matches = await matchChunks([], SPEC_CHUNKS)
    expect(matches).toHaveLength(0)
  })

  it('should return empty array when there are no spec chunks', async () => {
    const matches = await matchChunks([DIFF_CHUNK], [])
    expect(matches).toHaveLength(0)
  })

  it('should include the similarity score on each result', async () => {
    vi.mocked(embedBatch)
      .mockResolvedValueOnce([DIFF_EMBEDDING])
      .mockResolvedValueOnce(SPEC_EMBEDDINGS)

    const matches = await matchChunks([DIFF_CHUNK], SPEC_CHUNKS)

    for (const { score } of matches[0].relevantSpecs) {
      expect(typeof score).toBe('number')
      expect(score).toBeGreaterThanOrEqual(-1)
      expect(score).toBeLessThanOrEqual(1)
    }
  })
})

describe('matchSingleChunk', () => {
  it('should return a match for the given diff chunk', async () => {
    vi.mocked(embed).mockResolvedValueOnce(DIFF_EMBEDDING)
    vi.mocked(embedBatch).mockResolvedValueOnce(SPEC_EMBEDDINGS)

    const match = await matchSingleChunk(DIFF_CHUNK, SPEC_CHUNKS)

    expect(match.diffChunk).toBe(DIFF_CHUNK)
    expect(match.relevantSpecs.length).toBeGreaterThan(0)
  })
})
