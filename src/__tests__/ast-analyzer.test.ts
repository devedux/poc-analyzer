import { describe, it, expect } from 'vitest'
import { analyzeWithAST } from '../ast-analyzer'
import { parseDiff, buildRemovedValueMap } from '../diff-parser'
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

  describe('JSXChange pairing — multi-element bug fix', () => {
    // Reproduce the real production bug:
    // Old component had ONE data-test-id="checkout-container" on the root div.
    // New component has MANY elements each with their own data-test-id.
    // Bug: every new element was getting removedValue="checkout-container".
    // Fix: only the first div (same tag) consumes the old value; the rest get undefined.
    const MULTI_ELEMENT_SOURCE = `
export function Checkout() {
  return (
    <div data-test-id="modular-checkout">
      <h1 data-test-id="checkout-title">Title</h1>
      <button data-test-id="pay-btn">Pay</button>
    </div>
  )
}`.trim()

    // diff: 1 removed div (checkout-container), 3 added elements (div + h1 + button)
    // added lines land on 3, 4, 5 in the new file (matching MULTI_ELEMENT_SOURCE)
    const MULTI_ELEMENT_DIFF = `diff --git a/Checkout.tsx b/Checkout.tsx
index abc..def 100644
--- a/Checkout.tsx
+++ b/Checkout.tsx
@@ -2,5 +2,7 @@ export function Checkout() {
   return (
-    <div data-test-id="checkout-container">
-      <h1>Title</h1>
+    <div data-test-id="modular-checkout">
+      <h1 data-test-id="checkout-title">Title</h1>
+      <button data-test-id="pay-btn">Pay</button>
   </div>
   )
 }`

    it('only the same-tag element gets removedValue — root div rename correct', () => {
      const file = parseSingleFile(MULTI_ELEMENT_DIFF)
      const chunk = analyzeWithAST(file, MULTI_ELEMENT_SOURCE)

      const divChange = chunk.jsxChanges.find(
        (c) => c.element === 'div' && c.addedValue === 'modular-checkout'
      )
      expect(divChange?.removedValue).toBe('checkout-container')
    })

    it('h1 gets no removedValue — it is a purely new element', () => {
      const file = parseSingleFile(MULTI_ELEMENT_DIFF)
      const chunk = analyzeWithAST(file, MULTI_ELEMENT_SOURCE)

      const h1Change = chunk.jsxChanges.find(
        (c) => c.element === 'h1' && c.addedValue === 'checkout-title'
      )
      expect(h1Change).toBeDefined()
      expect(h1Change?.removedValue).toBeUndefined()
    })

    it('button gets no removedValue — it is a purely new element', () => {
      const file = parseSingleFile(MULTI_ELEMENT_DIFF)
      const chunk = analyzeWithAST(file, MULTI_ELEMENT_SOURCE)

      const btnChange = chunk.jsxChanges.find(
        (c) => c.element === 'button' && c.addedValue === 'pay-btn'
      )
      expect(btnChange).toBeDefined()
      expect(btnChange?.removedValue).toBeUndefined()
    })

    it('total jsxChanges count matches number of added elements with data-test-id', () => {
      const file = parseSingleFile(MULTI_ELEMENT_DIFF)
      const chunk = analyzeWithAST(file, MULTI_ELEMENT_SOURCE)

      // div(modular-checkout) + h1(checkout-title) + button(pay-btn) = 3
      const testIdChanges = chunk.jsxChanges.filter((c) => c.attribute === 'data-test-id')
      expect(testIdChanges).toHaveLength(3)
    })

    // Test FIFO pairing: 2 old buttons → 2 new buttons with different IDs
    const TWO_BUTTONS_SOURCE = `
export function PaymentButtons() {
  return (
    <div>
      <button data-test-id="primary-pay-btn">Pay Now</button>
      <button data-test-id="alt-pay-btn">Pay Later</button>
    </div>
  )
}`.trim()

    const TWO_BUTTONS_DIFF = `diff --git a/PaymentButtons.tsx b/PaymentButtons.tsx
index abc..def 100644
--- a/PaymentButtons.tsx
+++ b/PaymentButtons.tsx
@@ -3,5 +3,6 @@
   <div>
-    <button data-test-id="confirm-btn">Confirm</button>
-    <button data-test-id="cancel-btn">Cancel</button>
+    <button data-test-id="primary-pay-btn">Pay Now</button>
+    <button data-test-id="alt-pay-btn">Pay Later</button>
   </div>`

    it('FIFO pairing: first old button maps to first new button', () => {
      const file = parseSingleFile(TWO_BUTTONS_DIFF)
      const chunk = analyzeWithAST(file, TWO_BUTTONS_SOURCE)

      const first = chunk.jsxChanges.find((c) => c.addedValue === 'primary-pay-btn')
      expect(first?.removedValue).toBe('confirm-btn')
    })

    it('FIFO pairing: second old button maps to second new button', () => {
      const file = parseSingleFile(TWO_BUTTONS_DIFF)
      const chunk = analyzeWithAST(file, TWO_BUTTONS_SOURCE)

      const second = chunk.jsxChanges.find((c) => c.addedValue === 'alt-pay-btn')
      expect(second?.removedValue).toBe('cancel-btn')
    })
  })

  describe('buildRemovedValueMap', () => {
    it('builds a map with one entry per unique element tag', () => {
      const diff = `diff --git a/X.tsx b/X.tsx
index a..b 100644
--- a/X.tsx
+++ b/X.tsx
@@ -1,3 +1,2 @@
-<div data-test-id="old-root">
-<button data-test-id="old-btn">
+<div data-test-id="new-root">`

      const file = parseSingleFile(diff)
      const map = buildRemovedValueMap(file, 'data-test-id')

      expect(map.get('div')).toEqual(['old-root'])
      expect(map.get('button')).toEqual(['old-btn'])
    })

    it('accumulates multiple removed values for the same tag in order', () => {
      const diff = `diff --git a/X.tsx b/X.tsx
index a..b 100644
--- a/X.tsx
+++ b/X.tsx
@@ -1,3 +1,1 @@
-<button data-test-id="btn-a">
-<button data-test-id="btn-b">
+<button data-test-id="btn-new">`

      const file = parseSingleFile(diff)
      const map = buildRemovedValueMap(file, 'data-test-id')

      expect(map.get('button')).toEqual(['btn-a', 'btn-b'])
    })

    it('returns empty map when no removed lines have the attribute', () => {
      const diff = `diff --git a/X.tsx b/X.tsx
index a..b 100644
--- a/X.tsx
+++ b/X.tsx
@@ -1,2 +1,2 @@
-<div className="old">
+<div className="new">`

      const file = parseSingleFile(diff)
      const map = buildRemovedValueMap(file, 'data-test-id')

      expect(map.size).toBe(0)
    })

    it('ignores added lines — only removed lines populate the map', () => {
      const diff = `diff --git a/X.tsx b/X.tsx
index a..b 100644
--- a/X.tsx
+++ b/X.tsx
@@ -1,2 +1,2 @@
-<div data-test-id="old">
+<div data-test-id="new">`

      const file = parseSingleFile(diff)
      const map = buildRemovedValueMap(file, 'data-test-id')

      expect(map.get('div')).toEqual(['old'])
      expect(map.get('div')).not.toContain('new')
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
