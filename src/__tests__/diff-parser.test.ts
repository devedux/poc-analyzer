import { describe, it, expect } from 'vitest'
import { parseDiff, getChangedLineRanges, extractRemovedValues, isCodeFile } from '../diff-parser'

// Diff real del nivel fácil del POC: data-test-id renombrado + texto cambiado
const CHECKOUT_DIFF = `diff --git a/app/components/Checkout.tsx b/app/components/Checkout.tsx
index abc1234..def5678 100644
--- a/app/components/Checkout.tsx
+++ b/app/components/Checkout.tsx
@@ -5,7 +5,7 @@ export function CheckoutForm() {
   return (
     <div>
       <p>Resumen del pedido</p>
-      <button data-test-id="checkout-btn">Pagar</button>
+      <button data-test-id="checkout-button">Confirmar pago</button>
     </div>
   )
 }`

const MULTI_FILE_DIFF = `diff --git a/app/components/Checkout.tsx b/app/components/Checkout.tsx
index abc1234..def5678 100644
--- a/app/components/Checkout.tsx
+++ b/app/components/Checkout.tsx
@@ -5,4 +5,4 @@ export function CheckoutForm() {
-      <button data-test-id="checkout-btn">Pagar</button>
+      <button data-test-id="checkout-button">Confirmar pago</button>
diff --git a/app/components/Cart.tsx b/app/components/Cart.tsx
index 1111111..2222222 100644
--- a/app/components/Cart.tsx
+++ b/app/components/Cart.tsx
@@ -3,4 +3,4 @@ export function Cart() {
-  const total = items.length
+  const total = items.reduce((sum, i) => sum + i.price, 0)
`

describe('parseDiff', () => {
  it('should parse a single file diff into one DiffFile', () => {
    const files = parseDiff(CHECKOUT_DIFF)

    expect(files).toHaveLength(1)
    expect(files[0].filename).toBe('app/components/Checkout.tsx')
  })

  it('should parse multiple files from a multi-file diff', () => {
    const files = parseDiff(MULTI_FILE_DIFF)

    expect(files).toHaveLength(2)
    expect(files[0].filename).toBe('app/components/Checkout.tsx')
    expect(files[1].filename).toBe('app/components/Cart.tsx')
  })

  it('should parse hunks correctly', () => {
    const [file] = parseDiff(CHECKOUT_DIFF)

    expect(file.hunks).toHaveLength(1)
    expect(file.hunks[0].oldStart).toBe(5)
    expect(file.hunks[0].newStart).toBe(5)
  })

  it('should classify lines as added, removed, or context', () => {
    const [file] = parseDiff(CHECKOUT_DIFF)
    const lines = file.hunks[0].lines

    const added = lines.filter((l) => l.type === 'added')
    const removed = lines.filter((l) => l.type === 'removed')
    const context = lines.filter((l) => l.type === 'context')

    expect(added).toHaveLength(1)
    expect(removed).toHaveLength(1)
    expect(context.length).toBeGreaterThan(0)
  })

  it('should set newLineNumber for added lines and null for removed', () => {
    const [file] = parseDiff(CHECKOUT_DIFF)
    const lines = file.hunks[0].lines

    const added = lines.find((l) => l.type === 'added')
    const removed = lines.find((l) => l.type === 'removed')

    expect(added?.newLineNumber).toBeTypeOf('number')
    expect(added?.oldLineNumber).toBeNull()
    expect(removed?.oldLineNumber).toBeTypeOf('number')
    expect(removed?.newLineNumber).toBeNull()
  })

  it('should capture the added line content without the leading +', () => {
    const [file] = parseDiff(CHECKOUT_DIFF)
    const added = file.hunks[0].lines.find((l) => l.type === 'added')

    expect(added?.content).toContain('checkout-button')
    expect(added?.content).not.toMatch(/^\+/)
  })

  it('should return empty array for empty diff', () => {
    expect(parseDiff('')).toHaveLength(0)
  })
})

describe('getChangedLineRanges', () => {
  it('should return a range covering the added lines', () => {
    const [file] = parseDiff(CHECKOUT_DIFF)
    const ranges = getChangedLineRanges(file)

    expect(ranges).toHaveLength(1)
    expect(ranges[0].start).toBeLessThanOrEqual(ranges[0].end)
  })

  it('should return empty array when no lines were added', () => {
    const onlyRemovalDiff = `diff --git a/app/foo.ts b/app/foo.ts
index 000..111 100644
--- a/app/foo.ts
+++ b/app/foo.ts
@@ -1,3 +1,2 @@
 const x = 1
-const y = 2
 const z = 3`

    const [file] = parseDiff(onlyRemovalDiff)
    const ranges = getChangedLineRanges(file)

    expect(ranges).toHaveLength(0)
  })
})

describe('extractRemovedValues', () => {
  it('should extract the old value of a changed attribute', () => {
    const [file] = parseDiff(CHECKOUT_DIFF)
    const removed = extractRemovedValues(file, 'data-test-id')

    expect(removed).toContain('checkout-btn')
  })

  it('should return empty array when attribute was not removed', () => {
    const [file] = parseDiff(CHECKOUT_DIFF)
    const removed = extractRemovedValues(file, 'aria-label')

    expect(removed).toHaveLength(0)
  })
})

describe('isCodeFile', () => {
  it.each([
    ['app/components/Button.tsx', true],
    ['src/utils.ts', true],
    ['pages/index.js', true],
    ['components/Form.jsx', true],
    ['styles/main.css', false],
    ['README.md', false],
    ['package.json', false],
  ])('%s → %s', (filename, expected) => {
    expect(isCodeFile(filename)).toBe(expected)
  })
})
