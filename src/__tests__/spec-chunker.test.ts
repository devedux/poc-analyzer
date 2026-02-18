import { describe, it, expect } from 'vitest'
import { chunkSpecs, getTestNames } from '../spec-chunker'
import type { SpecFile } from '../types'

// Spec real del POC con los 3 niveles de dificultad
const CHECKOUT_SPEC: SpecFile = {
  name: 'checkout.spec.ts',
  content: `
import { test, expect } from '@playwright/test'

test('muestra el resumen del pedido correctamente', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Resumen del pedido')).toBeVisible()
})

test('el botón de pago tiene el texto correcto', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('checkout-btn')).toHaveText('Pagar')
})

test('el método de pago alternativo es clickeable', async ({ page }) => {
  await page.goto('/')
  const btn = page.getByTestId('alt-pay-btn')
  await btn.click()
  await expect(page.getByText('Método alternativo seleccionado')).toBeVisible()
})
`.trim(),
}

const SPEC_WITH_DESCRIBE: SpecFile = {
  name: 'auth.spec.ts',
  content: `
import { test, expect } from '@playwright/test'

test.describe('flujo de login', () => {
  test('muestra el formulario de login', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByTestId('login-form')).toBeVisible()
  })

  test('redirige al dashboard tras login exitoso', async ({ page }) => {
    await page.goto('/login')
    await page.fill('[data-test-id="email"]', 'user@test.com')
    await page.fill('[data-test-id="password"]', 'secret')
    await page.click('[data-test-id="submit-btn"]')
    await expect(page).toHaveURL('/dashboard')
  })
})
`.trim(),
}

describe('chunkSpecs', () => {
  it('should extract all top-level tests from a spec file', () => {
    const chunks = chunkSpecs([CHECKOUT_SPEC])
    expect(chunks).toHaveLength(3)
  })

  it('should capture the correct test names', () => {
    const chunks = chunkSpecs([CHECKOUT_SPEC])
    const names = chunks.map((c) => c.testName)

    expect(names).toContain('muestra el resumen del pedido correctamente')
    expect(names).toContain('el botón de pago tiene el texto correcto')
    expect(names).toContain('el método de pago alternativo es clickeable')
  })

  it('should set the filename on each chunk', () => {
    const chunks = chunkSpecs([CHECKOUT_SPEC])
    expect(chunks.every((c) => c.filename === 'checkout.spec.ts')).toBe(true)
  })

  it('should include the test body in the content', () => {
    const chunks = chunkSpecs([CHECKOUT_SPEC])
    const payChunk = chunks.find((c) => c.testName === 'el botón de pago tiene el texto correcto')

    expect(payChunk?.content).toContain('getByTestId')
    expect(payChunk?.content).toContain('checkout-btn')
  })

  it('should extract tests nested inside describe blocks', () => {
    const chunks = chunkSpecs([SPEC_WITH_DESCRIBE])
    expect(chunks).toHaveLength(2)
    expect(chunks.map((c) => c.testName)).toContain('muestra el formulario de login')
    expect(chunks.map((c) => c.testName)).toContain('redirige al dashboard tras login exitoso')
  })

  it('should handle multiple spec files', () => {
    const chunks = chunkSpecs([CHECKOUT_SPEC, SPEC_WITH_DESCRIBE])
    expect(chunks).toHaveLength(5)
  })

  it('should return empty array for a spec with no tests', () => {
    const emptySpec: SpecFile = { name: 'empty.spec.ts', content: 'import { test } from "@playwright/test"' }
    expect(chunkSpecs([emptySpec])).toHaveLength(0)
  })

  it('should return empty array for empty input', () => {
    expect(chunkSpecs([])).toHaveLength(0)
  })
})

describe('getTestNames', () => {
  it('should return only the test names from chunks', () => {
    const chunks = chunkSpecs([CHECKOUT_SPEC])
    const names = getTestNames(chunks)

    expect(names).toHaveLength(3)
    expect(names[0]).toBe('muestra el resumen del pedido correctamente')
  })
})
