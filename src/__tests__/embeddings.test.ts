import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  cosineSimilarity,
  buildDiffContextualText,
  buildSpecContextualText,
  embed,
  embedBatch,
} from '../embeddings'
import type { ASTChunk, SpecChunk } from '../types'

// Mock Ollama para no necesitar el servidor corriendo en tests
vi.mock('ollama', () => ({
  Ollama: class {
    embed = vi.fn().mockResolvedValue({ embeddings: [[0.1, 0.2, 0.3]] })
  },
}))

const MOCK_AST_CHUNK: ASTChunk = {
  filename: 'app/components/Checkout.tsx',
  rawDiff: '',
  hunks: [],
  components: ['CheckoutForm'],
  functions: [],
  jsxChanges: [
    {
      element: 'button',
      attribute: 'data-test-id',
      removedValue: 'checkout-btn',
      addedValue: 'checkout-button',
    },
  ],
  testIds: ['checkout-button'],
  summary: 'Componentes: CheckoutForm | JSX: <button> data-test-id="checkout-btn" → "checkout-button"',
}

const MOCK_SPEC_CHUNK: SpecChunk = {
  testName: 'el botón de pago tiene el texto correcto',
  filename: 'checkout.spec.ts',
  content: `test('el botón de pago tiene el texto correcto', async ({ page }) => {
  await expect(page.getByTestId('checkout-btn')).toBeVisible()
})`,
}

describe('cosineSimilarity', () => {
  it('should return 1.0 for identical vectors', () => {
    const v = [1, 0, 0]
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0)
  })

  it('should return 0.0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0)
  })

  it('should return values between -1 and 1', () => {
    const a = [0.5, 0.3, 0.8]
    const b = [0.1, 0.9, 0.2]
    const score = cosineSimilarity(a, b)
    expect(score).toBeGreaterThanOrEqual(-1)
    expect(score).toBeLessThanOrEqual(1)
  })

  it('should return 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0)
  })

  it('should be symmetric', () => {
    const a = [0.3, 0.7, 0.1]
    const b = [0.9, 0.2, 0.5]
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a))
  })

  it('should throw when vectors have different dimensions', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow()
  })
})

describe('buildDiffContextualText', () => {
  it('should include the filename', () => {
    const text = buildDiffContextualText(MOCK_AST_CHUNK)
    expect(text).toContain('app/components/Checkout.tsx')
  })

  it('should include the component name', () => {
    const text = buildDiffContextualText(MOCK_AST_CHUNK)
    expect(text).toContain('CheckoutForm')
  })

  it('should include the changed attribute with old and new values', () => {
    const text = buildDiffContextualText(MOCK_AST_CHUNK)
    expect(text).toContain('data-test-id')
    expect(text).toContain('checkout-btn')
    expect(text).toContain('checkout-button')
  })

  it('should include the test selector', () => {
    const text = buildDiffContextualText(MOCK_AST_CHUNK)
    expect(text).toContain('checkout-button')
  })

  it('should handle a chunk with no components or testIds', () => {
    const minimalChunk: ASTChunk = {
      ...MOCK_AST_CHUNK,
      components: [],
      testIds: [],
      jsxChanges: [],
    }
    expect(() => buildDiffContextualText(minimalChunk)).not.toThrow()
  })
})

describe('buildSpecContextualText', () => {
  it('should include the spec filename', () => {
    const text = buildSpecContextualText(MOCK_SPEC_CHUNK)
    expect(text).toContain('checkout.spec.ts')
  })

  it('should include the test name', () => {
    const text = buildSpecContextualText(MOCK_SPEC_CHUNK)
    expect(text).toContain('el botón de pago tiene el texto correcto')
  })

  it('should include the test content', () => {
    const text = buildSpecContextualText(MOCK_SPEC_CHUNK)
    expect(text).toContain('getByTestId')
  })
})

describe('embed', () => {
  beforeEach(() => vi.clearAllMocks())

  it('should return a numeric array', async () => {
    const result = await embed('some text')
    expect(Array.isArray(result)).toBe(true)
    expect(result.every((n) => typeof n === 'number')).toBe(true)
  })
})

describe('embedBatch', () => {
  it('should return an array of embeddings', async () => {
    const result = await embedBatch(['text one', 'text two'])
    expect(Array.isArray(result)).toBe(true)
  })
})
