import { Ollama } from 'ollama'
import type { LLMClient, ChatMessage, LLMOptions, LLMResponse, Config } from './types'
import { LLMError } from './error'

export function createOllamaClient(config: Config): LLMClient {
  const ollama = new Ollama()

  return {
    async *chat(messages: ChatMessage[], options?: LLMOptions): AsyncGenerator<LLMResponse> {
      try {
        const stream = await ollama.chat({
          model: options?.model ?? config.model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          stream: options?.stream ?? true,
          options: {
            num_predict: options?.maxTokens ?? config.maxTokens,
            temperature: options?.temperature ?? config.temperature,
            repeat_penalty: config.repeatPenalty,
          },
        })

        let buffer = ''

        for await (const chunk of stream) {
          buffer += chunk.message.content
          yield {
            message: {
              role: chunk.message.role,
              content: chunk.message.content,
            },
            done: false,
          }
        }

        yield {
          message: {
            role: 'assistant',
            content: buffer,
          },
          done: true,
        }
      } catch (error) {
        const llmError = error as Error
        throw new LLMError(`LLM request failed: ${llmError.message}`, llmError)
      }
    },
  }
}

export class MockLLMClient implements LLMClient {
  private responses: string[]

  constructor(responses: string[] = ['Mock response']) {
    this.responses = responses
  }

  async *chat(_messages: ChatMessage[], _options?: LLMOptions): AsyncGenerator<LLMResponse> {
    for (const response of this.responses) {
      yield {
        message: {
          role: 'assistant',
          content: response,
        },
        done: false,
      }
    }

    yield {
      message: {
        role: 'assistant',
        content: this.responses.join(''),
      },
      done: true,
    }
  }
}
