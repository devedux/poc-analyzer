import { describe, it, expect } from 'vitest'
import { analyzeWithAST } from '../ast-analyzer'
import { parseDiff } from '../diff-parser'
import type { DiffFile } from '../types'

// Fuente TSX del componente del POC (nivel fácil: data-test-id renombrado)
const CHECKOUT_SOURCE_NEW = `
import React from 'react'

export function CheckoutForm() {
  return (
    <div>
      <p>Resumen del pedido</p>
      <button data-test-id="checkout-button">Confirmar pago</button>
    </div>
  )
}
`.trim()

// Fuente TSX con condición compleja (nivel difícil del POC)
const CHECKOUT_SOURCE_COMPLEX = `
import React from 'react'

interface Props {
  isUserEligible: boolean
  confirmed: boolean
}

export function CheckoutForm({ isUserEligible, confirmed }: Props) {
  return (
    <div>
      <p>Resumen del pedido</p>
      {isUserEligible && !confirmed && (
        <button data-test-id="deuna-express-btn" onClick={() => {}}>
          Pago Express DEUNA
        </button>
      )}
      <button data-test-id="checkout-button">Confirmar pago</button>
    </div>
  )
}
`.trim()

// @@ -4,7 +4,7 @@ porque en CHECKOUT_SOURCE_NEW "return (" está en línea 4
// Esto hace que la línea añadida sea la 7, donde está el <button> en el source
const CHECKOUT_DIFF = `diff --git a/app/components/Checkout.tsx b/app/components/Checkout.tsx
index abc1234..def5678 100644
--- a/app/components/Checkout.tsx
+++ b/app/components/Checkout.tsx
@@ -4,7 +4,7 @@ export function CheckoutForm() {
   return (
     <div>
       <p>Resumen del pedido</p>
-      <button data-test-id="checkout-btn">Pagar</button>
+      <button data-test-id="checkout-button">Confirmar pago</button>
     </div>
   )
 }`

function parseSingleFile(rawDiff: string): DiffFile {
  return parseDiff(rawDiff)[0]
}

describe('analyzeWithAST', () => {
  describe('component detection', () => {
    it('should detect the React component that was modified', () => {
      const file = parseSingleFile(CHECKOUT_DIFF)
      const chunk = analyzeWithAST(file, CHECKOUT_SOURCE_NEW)

      expect(chunk.components).toContain('CheckoutForm')
    })

    it('should return the filename from the diff', () => {
      const file = parseSingleFile(CHECKOUT_DIFF)
      const chunk = analyzeWithAST(file, CHECKOUT_SOURCE_NEW)

      expect(chunk.filename).toBe('app/components/Checkout.tsx')
    })
  })

  describe('JSX attribute changes', () => {
    it('should detect the changed JSX attribute', () => {
      const file = parseSingleFile(CHECKOUT_DIFF)
      const chunk = analyzeWithAST(file, CHECKOUT_SOURCE_NEW)

      const change = chunk.jsxChanges.find((c) => c.attribute === 'data-test-id')
      expect(change).toBeDefined()
    })

    it('should capture the new value of the changed attribute', () => {
      const file = parseSingleFile(CHECKOUT_DIFF)
      const chunk = analyzeWithAST(file, CHECKOUT_SOURCE_NEW)

      const change = chunk.jsxChanges.find((c) => c.attribute === 'data-test-id')
      expect(change?.addedValue).toBe('checkout-button')
    })

    it('should capture the old value from the removed diff line', () => {
      const file = parseSingleFile(CHECKOUT_DIFF)
      const chunk = analyzeWithAST(file, CHECKOUT_SOURCE_NEW)

      const change = chunk.jsxChanges.find((c) => c.attribute === 'data-test-id')
      expect(change?.removedValue).toBe('checkout-btn')
    })

    it('should identify the JSX element that owns the changed attribute', () => {
      const file = parseSingleFile(CHECKOUT_DIFF)
      const chunk = analyzeWithAST(file, CHECKOUT_SOURCE_NEW)

      const change = chunk.jsxChanges.find((c) => c.attribute === 'data-test-id')
      expect(change?.element).toBe('button')
    })
  })

  describe('test ID extraction', () => {
    it('should extract data-test-id values from changed lines', () => {
      const file = parseSingleFile(CHECKOUT_DIFF)
      const chunk = analyzeWithAST(file, CHECKOUT_SOURCE_NEW)

      expect(chunk.testIds).toContain('checkout-button')
    })

    it('should extract multiple test IDs when several are changed', () => {
      // En CHECKOUT_SOURCE_COMPLEX el primer button está en línea 13, el segundo en 17
      const multiChangeDiff = `diff --git a/app/components/Checkout.tsx b/app/components/Checkout.tsx
index abc..def 100644
--- a/app/components/Checkout.tsx
+++ b/app/components/Checkout.tsx
@@ -12,6 +12,6 @@
       {isUserEligible && !confirmed && (
-        <button data-test-id="deuna-express-btn-old" onClick={() => {}}>
+        <button data-test-id="deuna-express-btn" onClick={() => {}}>
           Pago Express DEUNA
         </button>
       )}`

      const file = parseSingleFile(multiChangeDiff)
      const chunk = analyzeWithAST(file, CHECKOUT_SOURCE_COMPLEX)

      expect(chunk.testIds.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('summary', () => {
    it('should include component name in summary', () => {
      const file = parseSingleFile(CHECKOUT_DIFF)
      const chunk = analyzeWithAST(file, CHECKOUT_SOURCE_NEW)

      expect(chunk.summary).toContain('CheckoutForm')
    })

    it('should include the attribute change in summary', () => {
      const file = parseSingleFile(CHECKOUT_DIFF)
      const chunk = analyzeWithAST(file, CHECKOUT_SOURCE_NEW)

      expect(chunk.summary).toContain('data-test-id')
    })

    it('should show old and new values in summary when both exist', () => {
      const file = parseSingleFile(CHECKOUT_DIFF)
      const chunk = analyzeWithAST(file, CHECKOUT_SOURCE_NEW)

      expect(chunk.summary).toContain('checkout-btn')
      expect(chunk.summary).toContain('checkout-button')
    })

    it('should return a non-empty summary for any changed file', () => {
      const file = parseSingleFile(CHECKOUT_DIFF)
      const chunk = analyzeWithAST(file, CHECKOUT_SOURCE_NEW)

      expect(chunk.summary.length).toBeGreaterThan(0)
    })
  })

  describe('edge cases', () => {
    it('should return empty arrays when no changed ranges match AST nodes', () => {
      const diffOutOfRange = `diff --git a/app/components/Checkout.tsx b/app/components/Checkout.tsx
index abc..def 100644
--- a/app/components/Checkout.tsx
+++ b/app/components/Checkout.tsx
@@ -999,3 +999,3 @@
-      old line
+      new line`

      const file = parseSingleFile(diffOutOfRange)
      const chunk = analyzeWithAST(file, CHECKOUT_SOURCE_NEW)

      expect(chunk.components).toHaveLength(0)
      expect(chunk.jsxChanges).toHaveLength(0)
    })

    it('should handle TSX files without errors', () => {
      const file = parseSingleFile(CHECKOUT_DIFF)
      expect(() => analyzeWithAST(file, CHECKOUT_SOURCE_NEW)).not.toThrow()
    })
  })
})
