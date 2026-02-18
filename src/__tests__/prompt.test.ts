import { describe, it, expect } from 'vitest'
import { buildAnalysisPrompt, buildChatMessages, parseLLMResponse } from '../prompt'
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

  describe('parseLLMResponse', () => {
    const sampleResponse = `
## 📋 Resumen ejecutivo
Se cambió el selector del botón de login.

## 🔴 Tests rotos
- **login should redirect to dashboard** — el selector cambió en la línea 12

## 🟡 Tests en riesgo
- **checkout flow completes** — depende del componente de auth modificado

## 🟢 Tests no afectados
- **home page loads correctly** — no hay cambios en esa ruta
    `.trim()

    it('should parse broken test names', () => {
      const result = parseLLMResponse(sampleResponse)

      expect(result.broken).toEqual(['login should redirect to dashboard'])
    })

    it('should parse risk test names', () => {
      const result = parseLLMResponse(sampleResponse)

      expect(result.risk).toEqual(['checkout flow completes'])
    })

    it('should parse ok test names', () => {
      const result = parseLLMResponse(sampleResponse)

      expect(result.ok).toEqual(['home page loads correctly'])
    })

    it('should return empty arrays for empty response', () => {
      const result = parseLLMResponse('')

      expect(result.broken).toHaveLength(0)
      expect(result.risk).toHaveLength(0)
      expect(result.ok).toHaveLength(0)
    })

    it('should handle response with no tests in a section', () => {
      const response = `## 🔴 Tests rotos\nNinguno\n## 🟡 Tests en riesgo\n- **risky test** — might break`
      const result = parseLLMResponse(response)

      expect(result.broken).toHaveLength(0)
      expect(result.risk).toEqual(['risky test'])
    })
  })
})
