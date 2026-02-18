import type { SpecFile, ChatMessage } from './types'

export interface PromptOptions {
  includeInstructions?: boolean
  customInstructions?: string
}

const DEFAULT_INSTRUCTIONS = `Analiza los cambios y dime:
1. Qué tests probablemente se rompieron y por qué (sé específico: nombre del test, línea del spec y qué parte del cambio lo rompe)
2. Qué tests son riesgo pero no certeza y por qué
3. Qué tests no se ven afectados

Formato de respuesta:
- Usa emojis: 🔴 ROTO, 🟡 RIESGO, 🟢 OK
- Por cada test afectado: nombre, archivo, línea aproximada, motivo
- Al final un resumen de cuántos tests están en cada categoría`

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

export function parseLLMResponse(content: string): {
  broken: string[]
  risk: string[]
  ok: string[]
} {
  const broken: string[] = []
  const risk: string[] = []
  const ok: string[] = []

  const lines = content.split('\n')

  for (const line of lines) {
    if (line.includes('🔴 ROTO') || line.startsWith('- ') && line.toLowerCase().includes('roto')) {
      const match = line.match(/[`"]?([^\n`"]+)[`"]?\s*[-:]\s*(.+)/)
      if (match) {
        broken.push(match[1].trim())
      }
    } else if (line.includes('🟡 RIESGO')) {
      const match = line.match(/[`"]?([^\n`"]+)[`"]?\s*[-:]\s*(.+)/)
      if (match) {
        risk.push(match[1].trim())
      }
    } else if (line.includes('🟢 OK')) {
      const match = line.match(/[`"]?([^\n`"]+)[`"]?\s*[-:]\s*(.+)/)
      if (match) {
        ok.push(match[1].trim())
      }
    }
  }

  return { broken, risk, ok }
}
