import { describe, it, expect } from 'vitest'
import { buildAnalysisPrompt, buildChatMessages, parseLLMResponse, parseLLMResponseSummary } from '../prompt'
import type { SpecFile } from '../types'

describe('prompt', () => {
  describe('buildAnalysisPrompt', () => {
    it('should include diff in prompt', () => {
      const diff = 'const x = 1;'
      const specs: SpecFile[] = []

      const prompt = buildAnalysisPrompt(diff, specs)

      expect(prompt).toContain('<diff>')
      expect(prompt).toContain(diff)
      expect(prompt).toContain('</diff>')
    })

    it('should include specs in prompt', () => {
      const diff = 'const x = 1;'
      const specs: SpecFile[] = [
        { name: 'example.spec.ts', content: 'it("works", () => {})' },
      ]

      const prompt = buildAnalysisPrompt(diff, specs)

      expect(prompt).toContain('<e2e_tests>')
      expect(prompt).toContain('example.spec.ts')
      expect(prompt).toContain('it("works", () => {})')
      expect(prompt).toContain('</e2e_tests>')
    })

    it('should include multiple specs separated by separator', () => {
      const diff = 'const x = 1;'
      const specs: SpecFile[] = [
        { name: 'a.spec.ts', content: 'test a' },
        { name: 'b.spec.ts', content: 'test b' },
      ]

      const prompt = buildAnalysisPrompt(diff, specs)

      expect(prompt).toContain('---')
    })

    it('should allow custom instructions', () => {
      const diff = 'const x = 1;'
      const specs: SpecFile[] = []
      const customInstructions = 'Custom instructions here'

      const prompt = buildAnalysisPrompt(diff, specs, { customInstructions })

      expect(prompt).toContain(customInstructions)
    })

    it('should exclude instructions when includeInstructions is false', () => {
      const diff = 'const x = 1;'
      const specs: SpecFile[] = []

      const prompt = buildAnalysisPrompt(diff, specs, { includeInstructions: false })

      expect(prompt).not.toContain('IMPORTANTE: cada test debe aparecer')
    })
  })

  describe('buildChatMessages', () => {
    it('should return single user message with prompt', () => {
      const diff = 'const x = 1;'
      const specs: SpecFile[] = [{ name: 'test.spec.ts', content: 'test' }]

      const messages = buildChatMessages(diff, specs)

      expect(messages).toHaveLength(1)
      expect(messages[0].role).toBe('user')
      expect(messages[0].content).toContain(diff)
    })
  })

  describe('parseLLMResponse — nuevo formato (#### `...`)', () => {
    const newFormatResponse = `
## 📋 ¿Qué cambió?
Se renombró el selector del botón de pago.

---

## 🔴 Tests que fallarán

#### \`el botón de pago tiene el texto correcto\` — \`checkout.spec.ts\`
**Por qué falla:** El test usa \`getByTestId('checkout-btn')\` que ya no existe.

---

## 🟡 Tests en riesgo

#### \`el método de pago alternativo es clickeable\` — \`checkout.spec.ts\`
**Por qué es riesgo:** Podría depender de la misma convención de naming.

---

## ✅ Tests no afectados

- \`muestra el resumen del pedido\` — No interactúa con el botón.

---

## 📊 Resumen

| Categoría | Cantidad |
|-----------|----------|
| 🔴 Rotos | 1 |
| 🟡 Riesgo | 1 |
| ✅ OK | 1 |
| **Total** | **3** |
    `.trim()

    it('should parse broken tests from h4 format', () => {
      const result = parseLLMResponseSummary(newFormatResponse)
      expect(result.broken).toContain('el botón de pago tiene el texto correcto')
    })

    it('should parse risk tests from h4 format', () => {
      const result = parseLLMResponseSummary(newFormatResponse)
      expect(result.risk).toContain('el método de pago alternativo es clickeable')
    })

    it('should parse ok tests from ✅ section with bullet format', () => {
      const result = parseLLMResponseSummary(newFormatResponse)
      expect(result.ok).toContain('muestra el resumen del pedido')
    })

    it('should not mix tests between sections', () => {
      const result = parseLLMResponseSummary(newFormatResponse)
      expect(result.broken).not.toContain('muestra el resumen del pedido')
      expect(result.ok).not.toContain('el botón de pago tiene el texto correcto')
    })

    it('parseLLMResponse returns AnalyzeResult[] with structured data', () => {
      const results = parseLLMResponse(newFormatResponse)
      const broken = results.find((r) => r.status === 'broken')
      expect(broken).toBeDefined()
      expect(broken?.test).toBe('el botón de pago tiene el texto correcto')
      expect(broken?.file).toBe('checkout.spec.ts')
      expect(broken?.reason).toContain('checkout-btn')
    })

    it('parseLLMResponse includes risk AnalyzeResult with file', () => {
      const results = parseLLMResponse(newFormatResponse)
      const risk = results.find((r) => r.status === 'risk')
      expect(risk?.test).toBe('el método de pago alternativo es clickeable')
      expect(risk?.file).toBe('checkout.spec.ts')
    })

    it('parseLLMResponse total count matches sections', () => {
      const results = parseLLMResponse(newFormatResponse)
      expect(results.filter((r) => r.status === 'broken')).toHaveLength(1)
      expect(results.filter((r) => r.status === 'risk')).toHaveLength(1)
      expect(results.filter((r) => r.status === 'ok')).toHaveLength(1)
    })
  })

  describe('parseLLMResponse — formato legacy (- **...** )', () => {
    const legacyResponse = `
## 🔴 Tests rotos
- **login should redirect to dashboard** — el selector cambió en la línea 12

## 🟡 Tests en riesgo
- **checkout flow completes** — depende del componente de auth modificado

## 🟢 Tests no afectados
- **home page loads correctly** — no hay cambios en esa ruta
    `.trim()

    it('should still parse broken tests in legacy format', () => {
      expect(parseLLMResponseSummary(legacyResponse).broken).toEqual(['login should redirect to dashboard'])
    })

    it('should still parse risk tests in legacy format', () => {
      expect(parseLLMResponseSummary(legacyResponse).risk).toEqual(['checkout flow completes'])
    })

    it('should still parse ok tests with legacy 🟢 section', () => {
      expect(parseLLMResponseSummary(legacyResponse).ok).toEqual(['home page loads correctly'])
    })
  })

  describe('parseLLMResponse — edge cases', () => {
    it('should return empty array for empty response', () => {
      expect(parseLLMResponse('')).toHaveLength(0)
    })

    it('parseLLMResponseSummary returns empty arrays for empty response', () => {
      const result = parseLLMResponseSummary('')
      expect(result.broken).toHaveLength(0)
      expect(result.risk).toHaveLength(0)
      expect(result.ok).toHaveLength(0)
    })

    it('should return empty broken array when section has no tests', () => {
      const response = `## 🔴 Tests que fallarán\n*Sin tests rotos.*\n## 🟡 Tests en riesgo\n- **risky test** — might break`
      expect(parseLLMResponseSummary(response).broken).toHaveLength(0)
      expect(parseLLMResponseSummary(response).risk).toEqual(['risky test'])
    })
  })
})
