import { describe, it, expect } from 'vitest'
import { MockLLMClient } from '../llm'
import type { ChatMessage } from '../types'

describe('llm', () => {
  describe('MockLLMClient', () => {
    it('should return mock responses', async () => {
      const responses = ['First response', 'Second response']
      const client = new MockLLMClient(responses)

      const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }]
      const chunks: string[] = []

      for await (const chunk of client.chat(messages)) {
        chunks.push(chunk.message.content)
      }

      expect(chunks.length).toBeGreaterThan(0)
    })

    it('should handle empty responses', async () => {
      const client = new MockLLMClient([])

      const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }]
      const chunks: string[] = []

      for await (const chunk of client.chat(messages)) {
        chunks.push(chunk.message.content)
      }

      expect(chunks.length).toBeGreaterThan(0)
    })

    it('should use default response when none provided', async () => {
      const client = new MockLLMClient()

      const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }]
      const chunks: string[] = []

      for await (const chunk of client.chat(messages)) {
        chunks.push(chunk.message.content)
      }

      expect(chunks[0]).toBe('Mock response')
    })

    it('should yield done: false for streaming chunks', async () => {
      const client = new MockLLMClient(['Test response'])

      const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }]
      let foundFalse = false

      for await (const chunk of client.chat(messages)) {
        if (!chunk.done) {
          foundFalse = true
        }
      }

      expect(foundFalse).toBe(true)
    })

    it('should yield done: true on final chunk', async () => {
      const client = new MockLLMClient(['Test response'])

      const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }]
      let finalChunkDone = false

      for await (const chunk of client.chat(messages)) {
        if (chunk.done) {
          finalChunkDone = true
        }
      }

      expect(finalChunkDone).toBe(true)
    })
  })
})
