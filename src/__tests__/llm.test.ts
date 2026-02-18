import { describe, it, expect } from 'vitest'
import { MockLLMClient } from '../llm'
import type { ChatMessage, LLMResponse } from '../types'

describe('llm', () => {
  describe('MockLLMClient', () => {
    it('should return mock responses as non-done chunks', async () => {
      const responses = ['First response', 'Second response']
      const client = new MockLLMClient(responses)

      const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }]
      const nonDoneChunks: LLMResponse[] = []

      for await (const chunk of client.chat(messages)) {
        if (!chunk.done) nonDoneChunks.push(chunk)
      }

      expect(nonDoneChunks).toHaveLength(2)
      expect(nonDoneChunks[0].message.content).toBe('First response')
      expect(nonDoneChunks[1].message.content).toBe('Second response')
    })

    it('should yield done: true on final chunk with joined content', async () => {
      const client = new MockLLMClient(['Hello', ' World'])

      const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }]
      const chunks: LLMResponse[] = []

      for await (const chunk of client.chat(messages)) {
        chunks.push(chunk)
      }

      const doneChunk = chunks.find((c) => c.done)
      expect(doneChunk).toBeDefined()
      expect(doneChunk?.message.content).toBe('Hello World')
    })

    it('should handle empty responses array', async () => {
      const client = new MockLLMClient([])

      const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }]
      const chunks: LLMResponse[] = []

      for await (const chunk of client.chat(messages)) {
        chunks.push(chunk)
      }

      expect(chunks).toHaveLength(1)
      expect(chunks[0].done).toBe(true)
      expect(chunks[0].message.content).toBe('')
    })

    it('should use default response when none provided', async () => {
      const client = new MockLLMClient()

      const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }]
      const nonDoneChunks: LLMResponse[] = []

      for await (const chunk of client.chat(messages)) {
        if (!chunk.done) nonDoneChunks.push(chunk)
      }

      expect(nonDoneChunks[0].message.content).toBe('Mock response')
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
  })
})
