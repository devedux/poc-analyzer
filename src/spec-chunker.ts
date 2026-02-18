import type { SpecFile, SpecChunk } from './types'

/**
 * Convierte una lista de spec files en chunks individuales por test.
 * Cada test( o it( se convierte en un SpecChunk independiente.
 */
export function chunkSpecs(specs: SpecFile[]): SpecChunk[] {
  return specs.flatMap((spec) => extractTestChunks(spec))
}

/**
 * Extrae los bloques de test individuales de un archivo spec.
 *
 * Estrategia: busca líneas con test( o it( y usa conteo de llaves
 * para encontrar el cierre del bloque. Maneja tests anidados en describe().
 */
function extractTestChunks(spec: SpecFile): SpecChunk[] {
  const chunks: SpecChunk[] = []
  const lines = spec.content.split('\n')

  // Detecta test( o it( con cualquier indentación y tipos de comillas
  const TEST_PATTERN = /^\s*(?:test|it)\s*\(\s*(['"`])(.+?)\1/

  let i = 0
  while (i < lines.length) {
    const match = lines[i].match(TEST_PATTERN)

    if (!match) {
      i++
      continue
    }

    const testName = match[2]
    const startLine = i
    let depth = 0
    let started = false
    let j = i

    // Cuenta llaves para encontrar el cierre del bloque
    while (j < lines.length) {
      for (const char of lines[j]) {
        if (char === '{') {
          depth++
          started = true
        } else if (char === '}') {
          depth--
        }
      }

      if (started && depth === 0) {
        chunks.push({
          testName,
          filename: spec.name,
          content: lines.slice(startLine, j + 1).join('\n'),
        })
        i = j + 1
        break
      }

      j++
    }

    // Fallback si no se encontró el cierre
    if (!started || depth !== 0) i++
  }

  return chunks
}

export function getTestNames(chunks: SpecChunk[]): string[] {
  return chunks.map((c) => c.testName)
}
