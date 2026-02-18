import { Ollama } from 'ollama'
import type { ASTChunk, SpecChunk } from './types'

const EMBEDDING_MODEL = 'nomic-embed-text'

/**
 * Genera el embedding de un texto usando nomic-embed-text.
 */
export async function embed(text: string): Promise<number[]> {
  const ollama = new Ollama()
  const response = await ollama.embed({ model: EMBEDDING_MODEL, input: text })
  return response.embeddings[0]
}

/**
 * Genera embeddings en batch — una sola llamada a Ollama para N textos.
 * Más eficiente que N llamadas individuales.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const ollama = new Ollama()
  const response = await ollama.embed({ model: EMBEDDING_MODEL, input: texts })
  return response.embeddings
}

/**
 * Similitud coseno entre dos vectores.
 * Retorna 1.0 si son idénticos, 0.0 si no tienen relación, -1.0 si son opuestos.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('Los vectores deben tener la misma dimensión')

  let dot = 0
  let magA = 0
  let magB = 0

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }

  const magnitude = Math.sqrt(magA) * Math.sqrt(magB)
  return magnitude === 0 ? 0 : dot / magnitude
}

/**
 * Genera el texto contextual para un ASTChunk antes de embedear.
 *
 * La clave del "Contextual Embeddings": en vez de embedear solo el diff crudo,
 * describimos QUÉ ES el chunk para que el vector capture su significado real.
 */
export function buildDiffContextualText(chunk: ASTChunk): string {
  const parts: string[] = [
    `Cambio en archivo TypeScript del frontend: ${chunk.filename}`,
  ]

  if (chunk.components.length > 0) {
    parts.push(`Componentes React modificados: ${chunk.components.join(', ')}`)
  }

  if (chunk.jsxChanges.length > 0) {
    const changes = chunk.jsxChanges.map((c) => {
      const val =
        c.removedValue && c.addedValue
          ? `${c.attribute} cambió de "${c.removedValue}" a "${c.addedValue}"`
          : c.attribute
      return `<${c.element}> ${val}`
    })
    parts.push(`Cambios en atributos JSX: ${changes.join(', ')}`)
  }

  if (chunk.testIds.length > 0) {
    parts.push(`Selectores de test involucrados: ${chunk.testIds.join(', ')}`)
  }

  return parts.join('. ')
}

/**
 * Genera el texto contextual para un SpecChunk antes de embedear.
 *
 * Prefix del documento padre + contenido del test para que el vector
 * capture tanto "qué tipo de test es" como "qué verifica concretamente".
 */
export function buildSpecContextualText(chunk: SpecChunk): string {
  return [
    `Test E2E de Playwright en archivo: ${chunk.filename}`,
    `Nombre del test: "${chunk.testName}"`,
    `Contenido: ${chunk.content}`,
  ].join('\n')
}
