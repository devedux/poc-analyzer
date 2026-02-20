import type { SpecFile, ChatMessage, ASTChunk, DiffFile, SemanticMatch, AnalyzeResult } from './types'

export interface PromptOptions {
  includeInstructions?: boolean
  customInstructions?: string
}

const DEFAULT_INSTRUCTIONS = `Analiza los cambios y responde ÚNICAMENTE con el siguiente formato markdown. No agregues texto fuera de este formato.

## 📋 ¿Qué cambió?
Una sola oración resumiendo el cambio (para producto y management).

---

## 🔴 Tests que fallarán

Por cada test que definitivamente fallará usa esta estructura exacta:

#### \`[nombre del test]\` — \`[archivo.spec.ts]\`
**Por qué falla:** [qué selector, componente o valor cambió y cómo lo rompe]

**Cambio que lo rompe:**
\`\`\`diff
[las líneas del diff que causan el fallo — solo las relevantes]
\`\`\`

**Línea afectada en el test:**
\`\`\`typescript
[la línea del test que ya no va a funcionar]
\`\`\`

Si no hay ninguno, escribe: *Sin tests rotos.*

---

## 🟡 Tests en riesgo

Por cada test que podría fallar usa esta estructura exacta:

#### \`[nombre del test]\` — \`[archivo.spec.ts]\`
**Por qué es riesgo:** [qué suposición podría fallar según el contexto del cambio]

Si no hay ninguno, escribe: *Sin tests en riesgo.*

---

## ✅ Tests no afectados

Por cada test que sigue funcionando:
- \`[nombre del test]\` — [razón breve]

Si no hay ninguno, escribe: *Sin tests.*

---

## 📊 Resumen

| Categoría | Cantidad |
|-----------|----------|
| 🔴 Rotos | N |
| 🟡 Riesgo | N |
| ✅ OK | N |
| **Total** | **N** |

IMPORTANTE: cada test debe aparecer en UNA SOLA categoría.`

export function buildAnalysisPrompt(
  diff: string,
  specs: SpecFile[],
  options: PromptOptions = {}
): string {
  const specsBlock = specs.map((s) => `// ${s.name}\n${s.content}`).join('\n\n---\n\n')

  const instructions = options.customInstructions ?? DEFAULT_INSTRUCTIONS
  const includeInstructions = options.includeInstructions ?? true

  let prompt = `Eres un experto en testing. Aquí están los cambios que hice en el código del front:

<diff>
${diff}
</diff>

Aquí están los tests E2E del proyecto:

<e2e_tests>
${specsBlock}
</e2e_tests>
`

  if (includeInstructions) {
    prompt += `\n${instructions}`
  }

  return prompt
}

export function buildChatMessages(diff: string, specs: SpecFile[]): ChatMessage[] {
  const prompt = buildAnalysisPrompt(diff, specs)

  return [{ role: 'user', content: prompt }]
}

/**
 * Formatea las líneas del diff de un DiffFile en formato estándar unified diff.
 * Incluye contexto para que el modelo entienda el entorno del cambio.
 */
function formatDiffLines(diffFile: DiffFile): string {
  const lines: string[] = []

  for (const hunk of diffFile.hunks) {
    lines.push(`@@ ${diffFile.filename} @@`)
    for (const line of hunk.lines) {
      const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '
      lines.push(`${prefix}${line.content}`)
    }
  }

  return lines.join('\n')
}

/**
 * Construye el prompt usando chunks semánticos del AST.
 * En vez de volcar el diff crudo, le da al LLM:
 * - Qué componentes React cambiaron
 * - Qué atributos JSX y test IDs están involucrados
 * - El diff formateado solo de ese archivo
 */
export function buildAnalysisPromptFromAST(chunks: ASTChunk[], specs: SpecFile[]): string {
  const specsBlock = specs.map((s) => `// ${s.name}\n${s.content}`).join('\n\n---\n\n')

  const changesBlock = chunks
    .map((chunk) => {
      const lines: string[] = [`### ${chunk.filename}`]

      if (chunk.summary) lines.push(`**Semántica:** ${chunk.summary}`)
      if (chunk.testIds.length > 0)
        lines.push(`**Test IDs involucrados:** \`${chunk.testIds.join('`, `')}\``)

      lines.push('\n```diff')
      lines.push(formatDiffLines({ filename: chunk.filename, rawDiff: chunk.rawDiff, hunks: chunk.hunks }))
      lines.push('```')

      return lines.join('\n')
    })
    .join('\n\n---\n\n')

  return `Eres un experto en testing. Aquí están los cambios del PR con análisis semántico del código:

<cambios>
${changesBlock}
</cambios>

Aquí están los tests E2E del proyecto:

<e2e_tests>
${specsBlock}
</e2e_tests>

${DEFAULT_INSTRUCTIONS}`
}

export function buildChatMessagesFromAST(chunks: ASTChunk[], specs: SpecFile[]): ChatMessage[] {
  return [{ role: 'user', content: buildAnalysisPromptFromAST(chunks, specs) }]
}

/**
 * Prompt más preciso: cada diff chunk va acompañado solo de sus specs relevantes.
 * Reduce el ruido vs buildChatMessagesFromAST que aún pasa todos los specs.
 */
export function buildChatMessagesFromMatches(matches: SemanticMatch[]): ChatMessage[] {
  const changesBlock = matches
    .map(({ diffChunk, relevantSpecs }) => {
      const lines: string[] = [`### ${diffChunk.filename}`]

      if (diffChunk.summary) lines.push(`**Semántica:** ${diffChunk.summary}`)
      if (diffChunk.testIds.length > 0)
        lines.push(`**Test IDs involucrados:** \`${diffChunk.testIds.join('`, `')}\``)

      lines.push('\n```diff')
      lines.push(formatDiffLines({ filename: diffChunk.filename, rawDiff: diffChunk.rawDiff, hunks: diffChunk.hunks }))
      lines.push('```')

      if (relevantSpecs.length > 0) {
        lines.push('\n**Tests más relacionados (por similitud semántica):**')
        for (const { chunk, score } of relevantSpecs) {
          lines.push(`\n#### ${chunk.testName} *(score: ${score.toFixed(2)})*`)
          lines.push('```typescript')
          lines.push(chunk.content)
          lines.push('```')
        }
      }

      return lines.join('\n')
    })
    .join('\n\n---\n\n')

  const prompt = `Eres un experto en testing. Aquí están los cambios del PR con los tests más relevantes identificados por similitud semántica:

<cambios_y_tests_relevantes>
${changesBlock}
</cambios_y_tests_relevantes>

${DEFAULT_INSTRUCTIONS}`

  return [{ role: 'user', content: prompt }]
}

export function parseLLMResponse(content: string): AnalyzeResult[] {
  const results: AnalyzeResult[] = []

  let currentSection: 'broken' | 'risk' | 'ok' | null = null
  let currentTest: string | null = null
  let currentFile: string | null = null
  let currentReasonLines: string[] = []

  function flushCurrent() {
    if (currentTest && currentSection) {
      results.push({
        test: currentTest,
        file: currentFile ?? '',
        line: 0,
        status: currentSection,
        reason: currentReasonLines.join(' ').trim(),
      })
    }
    currentTest = null
    currentFile = null
    currentReasonLines = []
  }

  for (const line of content.split('\n')) {
    const trimmed = line.trim()

    if (trimmed.includes('🔴')) {
      flushCurrent()
      currentSection = 'broken'
      continue
    } else if (trimmed.includes('🟡')) {
      flushCurrent()
      currentSection = 'risk'
      continue
    } else if (trimmed.includes('✅') || trimmed.includes('🟢')) {
      flushCurrent()
      currentSection = 'ok'
      continue
    } else if (trimmed.startsWith('## 📊') || trimmed.startsWith('## Resumen')) {
      flushCurrent()
      currentSection = null
      continue
    }

    if (!currentSection) continue

    // Formato h4: #### `nombre del test` — `archivo.spec.ts`
    const h4Match = trimmed.match(/^####\s+`(.+?)`(?:\s+[—-]\s+`(.+?)`)?/)
    if (h4Match) {
      flushCurrent()
      currentTest = h4Match[1].trim()
      currentFile = h4Match[2]?.trim() ?? ''
      currentReasonLines = []
      continue
    }

    // Formato bullet para ok: - `nombre del test` — razón
    const backtickBulletMatch = trimmed.match(/^-\s+`(.+?)`(?:\s+[—-]\s+(.+))?/)
    if (backtickBulletMatch && currentSection === 'ok') {
      flushCurrent()
      currentTest = backtickBulletMatch[1].trim()
      currentFile = ''
      currentReasonLines = backtickBulletMatch[2] ? [backtickBulletMatch[2].trim()] : []
      flushCurrent()
      continue
    }

    // Formato legacy: - **nombre del test** — motivo
    const bulletMatch = trimmed.match(/^-\s+\*\*(.+?)\*\*(?:\s+[—-]\s+(.+))?/)
    if (bulletMatch) {
      flushCurrent()
      currentTest = bulletMatch[1].trim()
      currentFile = ''
      currentReasonLines = bulletMatch[2] ? [bulletMatch[2].trim()] : []
      if (currentSection === 'ok') flushCurrent()
      continue
    }

    // Capturar razón para broken/risk
    if (currentTest && currentSection !== 'ok') {
      const reasonMatch = trimmed.match(/^\*\*Por qué (?:falla|es riesgo):\*\*\s*(.+)/)
      if (reasonMatch) {
        currentReasonLines.push(reasonMatch[1].trim())
      }
    }
  }

  flushCurrent()
  return results
}

/**
 * Retorna las listas de nombres de tests en cada categoría.
 * Mantiene la interfaz simple para quienes solo necesitan los nombres.
 */
export function parseLLMResponseSummary(content: string): {
  broken: string[]
  risk: string[]
  ok: string[]
} {
  const results = parseLLMResponse(content)
  return {
    broken: results.filter((r) => r.status === 'broken').map((r) => r.test),
    risk: results.filter((r) => r.status === 'risk').map((r) => r.test),
    ok: results.filter((r) => r.status === 'ok').map((r) => r.test),
  }
}
