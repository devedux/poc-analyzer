import type { DiffFile, DiffHunk, DiffLine } from './types'

const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx']

/**
 * Parsea el formato unified diff de GitHub en estructura tipada.
 * Cada sección "diff --git" se convierte en un DiffFile con sus hunks y líneas.
 */
export function parseDiff(rawDiff: string): DiffFile[] {
  const files: DiffFile[] = []

  // Separar por encabezado de archivo. El split deja el contenido SIN "diff --git "
  const sections = rawDiff.split(/^diff --git /m).filter(Boolean)

  for (const section of sections) {
    const lines = section.split('\n')

    // Primera línea: "a/path b/path"
    const headerMatch = lines[0]?.match(/^a\/.+ b\/(.+)$/)
    if (!headerMatch) continue

    const filename = headerMatch[1].trim()
    const hunks: DiffHunk[] = []

    let currentHunk: DiffHunk | null = null
    let oldLine = 0
    let newLine = 0

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]

      // Encabezado de hunk: "@@ -old_start[,count] +new_start[,count] @@"
      const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (hunkMatch) {
        if (currentHunk) hunks.push(currentHunk)
        oldLine = parseInt(hunkMatch[1], 10)
        newLine = parseInt(hunkMatch[2], 10)
        currentHunk = { oldStart: oldLine, newStart: newLine, lines: [] }
        continue
      }

      if (!currentHunk) continue

      if (line.startsWith('+') && !line.startsWith('+++')) {
        currentHunk.lines.push({
          type: 'added',
          content: line.slice(1),
          newLineNumber: newLine++,
          oldLineNumber: null,
        })
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        currentHunk.lines.push({
          type: 'removed',
          content: line.slice(1),
          newLineNumber: null,
          oldLineNumber: oldLine++,
        })
      } else if (line.startsWith(' ')) {
        currentHunk.lines.push({
          type: 'context',
          content: line.slice(1),
          newLineNumber: newLine++,
          oldLineNumber: oldLine++,
        })
      }
    }

    if (currentHunk) hunks.push(currentHunk)

    files.push({ filename, rawDiff: section, hunks })
  }

  return files
}

/**
 * Retorna los rangos de líneas (nuevo archivo) que fueron modificadas.
 * Solo líneas added — son las que el AST analizará.
 */
export function getChangedLineRanges(file: DiffFile): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = []

  for (const hunk of file.hunks) {
    const added = hunk.lines
      .filter((l): l is DiffLine & { newLineNumber: number } =>
        l.type === 'added' && l.newLineNumber !== null
      )
      .map((l) => l.newLineNumber)

    if (added.length > 0) {
      ranges.push({ start: Math.min(...added), end: Math.max(...added) })
    }
  }

  return ranges
}

/**
 * Extrae los valores removidos de atributos JSX directamente del diff
 * (antes de pasar por el AST, que solo ve el nuevo archivo).
 */
export function extractRemovedValues(file: DiffFile, attribute: string): string[] {
  const pattern = new RegExp(`${attribute}=["']([^"']+)["']`)
  const values: string[] = []

  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.type === 'removed') {
        const match = line.content.match(pattern)
        if (match) values.push(match[1])
      }
    }
  }

  return values
}

/**
 * Builds a per-element-tag lookup map of removed attribute values from the diff.
 * Each entry is a FIFO queue — consume one value per added element of the same tag
 * during AST traversal to correctly pair added/removed attribute values.
 *
 * Fixes the bug where a single old value (e.g. "checkout-container") was incorrectly
 * applied as removedValue to ALL new elements that share the same attribute name.
 *
 * Example:
 *   diff: -<div data-test-id="root">  +<div data-test-id="new-root">  +<h1 data-test-id="title">
 *   result: Map { 'div' → ['root'] }
 *   → first div consumes 'root', h1 gets undefined (no old value)
 */
export function buildRemovedValueMap(file: DiffFile, attribute: string): Map<string, string[]> {
  const tagPattern = /<(\w+)/
  const attrPattern = new RegExp(`${attribute}=["']([^"']+)["']`)
  const map = new Map<string, string[]>()

  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.type === 'removed') {
        const tagMatch = line.content.match(tagPattern)
        const attrMatch = line.content.match(attrPattern)
        if (tagMatch && attrMatch) {
          const tag = tagMatch[1]
          if (!map.has(tag)) map.set(tag, [])
          map.get(tag)!.push(attrMatch[1])
        }
      }
    }
  }

  return map
}

export function isCodeFile(filename: string): boolean {
  return CODE_EXTENSIONS.some((ext) => filename.endsWith(ext))
}
