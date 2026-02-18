import 'dotenv/config'
import { getConfig, validateConfig } from './config'
import { createGitOperations } from './git'
import { createSpecsReader } from './specs'
import { buildChatMessages } from './prompt'
import { createOllamaClient, MockLLMClient } from './llm'
import type { AnalyzerDependencies, LLMResponse } from './types'
import { AnalyzerError } from './error'

const SEPARATOR = '─'.repeat(60)

export interface AnalyzeOptions {
  useMockLLM?: boolean
  onChunk?: (chunk: string) => void
}

export function createDependencies(options: AnalyzeOptions = {}): AnalyzerDependencies {
  const config = getConfig()
  validateConfig(config)

  const git = createGitOperations()
  const specsReader = createSpecsReader()
  const llmClient = options.useMockLLM
    ? new MockLLMClient(['Mock response for testing'])
    : createOllamaClient(config)

  return { config, git, specsReader, llmClient }
}

export async function collectStream(
  stream: AsyncGenerator<LLMResponse>,
  onChunk?: (chunk: string) => void
): Promise<string> {
  let full = ''
  let hasDoneChunk = false

  for await (const chunk of stream) {
    if (chunk.done) {
      full = chunk.message.content
      hasDoneChunk = true
    } else {
      if (!hasDoneChunk) full += chunk.message.content
      onChunk?.(chunk.message.content)
    }
  }

  return full
}

export async function runAnalysis(
  deps: AnalyzerDependencies,
  options: AnalyzeOptions = {}
): Promise<string> {
  const { config, git, specsReader, llmClient } = deps

  const diff = git.getDiff(config.frontRepoPath)

  if (!diff) {
    console.log('ℹ️  No hay cambios sin commitear en poc-front-app.')
    console.log('   Tip: si ya commiteaste, prueba con: git diff HEAD~1 HEAD\n')
    return ''
  }

  const specs = specsReader.readSpecs(config.e2eRepoPath)
  const messages = buildChatMessages(diff, specs)

  console.log('Analizando...\n')
  console.log(SEPARATOR)

  const stream = llmClient.chat(messages)
  const fullResponse = await collectStream(stream, (chunk) => {
    if (options.onChunk) {
      options.onChunk(chunk)
    } else {
      process.stdout.write(chunk)
    }
  })

  console.log('\n' + SEPARATOR)

  return fullResponse
}

export async function main() {
  console.log('🔍 poc-analyzer — Análisis de impacto en tests E2E\n')

  try {
    const deps = createDependencies()

    console.log(`📁 Front:  ${deps.config.frontRepoPath}`)
    console.log(`📁 E2E:    ${deps.config.e2eRepoPath}`)
    console.log(`🤖 Modelo: ${deps.config.model}\n`)

    await runAnalysis(deps)
    console.log('\n✅ Análisis completado.\n')
  } catch (error) {
    if (error instanceof AnalyzerError) {
      console.error(`\n❌ ${error.message}`)
      process.exit(error.recoverable ? 0 : 1)
    }

    console.error('\n❌ Error inesperado:', error)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}
