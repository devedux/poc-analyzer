import 'dotenv/config'
import { getConfig, validateConfig, validatePRConfig } from './config'
import { createSpecsReader } from './specs'
import { buildChatMessages, buildChatMessagesFromMatches } from './prompt'
import { createOllamaClient } from './llm'
import { createGitHubClient } from './github'
import { collectStream } from './analyze'
import { parseDiff, isCodeFile } from './diff-parser'
import { analyzeWithAST } from './ast-analyzer'
import { chunkSpecs } from './spec-chunker'
import { matchChunks } from './semantic-matcher'
import type { PRAnalyzerDependencies, ASTChunk } from './types'
import { AnalyzerError } from './error'

const SEPARATOR = '─'.repeat(60)

export function createPRDependencies(): PRAnalyzerDependencies {
  const config = getConfig()
  validateConfig(config)
  validatePRConfig(config)

  return {
    config,
    llmClient: createOllamaClient(config),
    specsReader: createSpecsReader(),
    githubClient: createGitHubClient(config.githubToken!, config.githubOwner!, config.githubRepo!),
  }
}

export async function runPRAnalysis(
  deps: PRAnalyzerDependencies,
  prNumber: number
): Promise<void> {
  const { config, llmClient, specsReader, githubClient } = deps

  console.log(`🔍 poc-analyzer — Analizando PR #${prNumber}\n`)
  console.log(`📁 E2E:    ${config.e2eRepoPath}`)
  console.log(`🤖 Modelo: ${config.model}\n`)

  console.log('📥 Obteniendo diff del PR desde GitHub...')
  const rawDiff = await githubClient.getPRDiff(prNumber)

  if (!rawDiff.trim()) {
    console.log('ℹ️  El PR no tiene cambios.')
    return
  }

  console.log('🔬 Analizando AST de archivos modificados...')
  const diffFiles = parseDiff(rawDiff)
  const astChunks: ASTChunk[] = []

  for (const diffFile of diffFiles.filter((f) => isCodeFile(f.filename))) {
    try {
      const content = await githubClient.getFileContent(
        diffFile.filename,
        `refs/pull/${prNumber}/head`
      )
      astChunks.push(analyzeWithAST(diffFile, content))
      console.log(`  ✓ ${diffFile.filename}`)
    } catch {
      console.log(`  ⚠️  No se pudo analizar ${diffFile.filename}, usando diff crudo`)
    }
  }

  const specs = specsReader.readSpecs(config.e2eRepoPath)

  let messages
  if (astChunks.length > 0) {
    console.log('🧠 Generando embeddings y buscando specs relevantes...')
    const specChunks = chunkSpecs(specs)
    const matches = await matchChunks(astChunks, specChunks)
    const totalSpecs = matches.reduce((sum, m) => sum + m.relevantSpecs.length, 0)
    console.log(`  ✓ ${specChunks.length} tests chunkeados → top ${totalSpecs} seleccionados`)
    messages = buildChatMessagesFromMatches(matches)
  } else {
    messages = buildChatMessages(rawDiff, specs)
  }

  console.log('Analizando...\n')
  console.log(SEPARATOR)

  const stream = llmClient.chat(messages)
  const fullResponse = await collectStream(stream, (chunk) => {
    process.stdout.write(chunk)
  })

  console.log('\n' + SEPARATOR)

  const comment = `## 🤖 Análisis de impacto en tests E2E\n\n${fullResponse}\n\n---\n*Generado por poc-analyzer con ${config.model}*`

  console.log('\n💬 Posteando comentario en el PR...')
  await githubClient.postComment(prNumber, comment)

  console.log(`\n✅ Comentario publicado en PR #${prNumber}\n`)
}

async function main() {
  const prNumber = parseInt(process.argv[2] ?? '', 10)

  if (isNaN(prNumber) || prNumber <= 0) {
    console.error('❌ Uso: tsx src/analyze-pr.ts <pr-number>')
    process.exit(1)
  }

  try {
    const deps = createPRDependencies()
    await runPRAnalysis(deps, prNumber)
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
