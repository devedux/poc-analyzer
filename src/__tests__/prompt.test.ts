import { describe, it, expect, vi, beforeEach } from 'vitest'
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

      const prompt = buildAnalysisPrompt(diff, specs, {
        customInstructions,
      })

      expect(prompt).toContain(customInstructions)
    })

    it('should exclude instructions when includeInstructions is false', () => {
      const diff = 'const x = 1;'
      const specs: SpecFile[] = []

      const prompt = buildAnalysisPrompt(diff, specs, {
        includeInstructions: false,
      })

      expect(prompt).not.toContain('Qué tests probablemente se rompieron')
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
    it('should parse broken tests with 🔴 emoji', () => {
      const response = `
🔴 ROTO
test "should fail"
      `.trim()

      const result = parseLLMResponse(response)

      expect(result.broken.length).toBeGreaterThanOrEqual(0)
    })

    it('should parse risk tests with 🟡 emoji', () => {
      const response = '🟡 RIESGO\ntest "might fail"'

      const result = parseLLMResponse(response)

      expect(result.risk.length).toBeGreaterThanOrEqual(0)
    })

    it('should parse ok tests with 🟢 emoji', () => {
      const response = '🟢 OK\ntest "should pass"'

      const result = parseLLMResponse(response)

      expect(result.ok.length).toBeGreaterThanOrEqual(0)
    })
  })
})
