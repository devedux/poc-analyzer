import type { SpecFile, ChatMessage } from './types'

export interface PromptOptions {
  includeInstructions?: boolean
  customInstructions?: string
}

const DEFAULT_INSTRUCTIONS = `Analiza los cambios y responde ÚNICAMENTE con el siguiente formato markdown. No agregues texto fuera de este formato.

## 📋 Resumen ejecutivo
Una sola oración explicando qué cambió y el impacto general (para producto y management).

## 🔴 Tests rotos
Tests que SEGURAMENTE fallarán por estos cambios. Si no hay ninguno, escribe "Ninguno".
Para cada test:
- **nombre del test** — motivo concreto (qué línea del diff lo rompe)

## 🟡 Tests en riesgo
Tests que PODRÍAN fallar dependiendo del contexto. Si no hay ninguno, escribe "Ninguno".
Para cada test:
- **nombre del test** — por qué es riesgo (qué suposición podría fallar)

## 🟢 Tests no afectados
Tests que siguen funcionando sin cambios. Si no hay ninguno, escribe "Ninguno".
Para cada test:
- **nombre del test** — por qué no se ve afectado

## 📊 Totales
| Categoría | Cantidad |
|-----------|----------|
| 🔴 Rotos | N |
| 🟡 Riesgo | N |
| 🟢 OK | N |
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

export function parseLLMResponse(content: string): {
  broken: string[]
  risk: string[]
  ok: string[]
} {
  const broken: string[] = []
  const risk: string[] = []
  const ok: string[] = []

  let currentSection: 'broken' | 'risk' | 'ok' | null = null

  for (const line of content.split('\n')) {
    const trimmed = line.trim()

    if (trimmed.includes('🔴')) {
      currentSection = 'broken'
    } else if (trimmed.includes('🟡')) {
      currentSection = 'risk'
    } else if (trimmed.includes('🟢')) {
      currentSection = 'ok'
    } else if (currentSection && trimmed.startsWith('- **')) {
      const match = trimmed.match(/^- \*\*(.+?)\*\*/)
      if (match) {
        const bucket = currentSection === 'broken' ? broken : currentSection === 'risk' ? risk : ok
        bucket.push(match[1].trim())
      }
    }
  }

  return { broken, risk, ok }
}
