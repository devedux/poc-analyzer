import * as ts from 'typescript'
import type { ASTChunk, DiffFile, JSXChange } from './types'
import { getChangedLineRanges, buildRemovedValueMap } from './diff-parser'

/**
 * Analiza un archivo TypeScript/TSX usando el compilador de TypeScript
 * para extraer información semántica de los cambios del diff.
 *
 * En vez de trabajar con texto plano, entiende:
 * - Qué componentes React fueron modificados
 * - Qué atributos JSX cambiaron (data-test-id, onClick, etc.)
 * - Qué test IDs están involucrados
 * - Qué funciones fueron tocadas
 */
export function analyzeWithAST(diffFile: DiffFile, sourceContent: string): ASTChunk {
  const scriptKind =
    diffFile.filename.endsWith('.tsx') || diffFile.filename.endsWith('.jsx')
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS

  const sourceFile = ts.createSourceFile(
    diffFile.filename,
    sourceContent,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  )

  const changedRanges = getChangedLineRanges(diffFile)

  // Lazy-built per-attribute maps: elementTag → FIFO queue of removedValues.
  // Consumed one-per-element during AST traversal so only actual renames get
  // a removedValue; purely new elements get undefined.
  const removedValueMaps = new Map<string, Map<string, string[]>>()
  function consumeRemovedValue(attrName: string, elementName: string): string | undefined {
    if (!removedValueMaps.has(attrName)) {
      removedValueMaps.set(attrName, buildRemovedValueMap(diffFile, attrName))
    }
    const queue = removedValueMaps.get(attrName)!.get(elementName)
    return queue?.shift()
  }

  const components = new Set<string>()
  const functions = new Set<string>()
  const jsxChanges: JSXChange[] = []
  const testIds = new Set<string>()

  // Convierte posición de caracter a número de línea (1-indexed)
  function lineOf(pos: number): number {
    return sourceFile.getLineAndCharacterOfPosition(pos).line + 1
  }

  function isInChangedRange(node: ts.Node): boolean {
    const line = lineOf(node.getStart(sourceFile))
    return changedRanges.some((r) => line >= r.start && line <= r.end)
  }

  // Sube por el árbol AST hasta encontrar el nombre del componente React (PascalCase)
  function enclosingComponent(node: ts.Node): string | null {
    let current: ts.Node | undefined = node.parent
    while (current) {
      if (ts.isFunctionDeclaration(current) && current.name) {
        if (/^[A-Z]/.test(current.name.text)) return current.name.text
      }
      if (
        ts.isVariableDeclaration(current) &&
        ts.isIdentifier(current.name) &&
        /^[A-Z]/.test(current.name.text)
      ) {
        return current.name.text
      }
      current = current.parent
    }
    return null
  }

  // Sube por el árbol AST hasta encontrar la función contenedora
  function enclosingFunction(node: ts.Node): string | null {
    let current: ts.Node | undefined = node.parent
    while (current) {
      if (ts.isFunctionDeclaration(current) && current.name) return current.name.text
      if (ts.isMethodDeclaration(current) && ts.isIdentifier(current.name))
        return current.name.text
      if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name))
        return current.name.text
      current = current.parent
    }
    return null
  }

  function getJSXElementName(node: ts.Node): string {
    if (ts.isJsxOpeningElement(node) && ts.isIdentifier(node.tagName)) return node.tagName.text
    if (ts.isJsxSelfClosingElement(node) && ts.isIdentifier(node.tagName)) return node.tagName.text
    return ''
  }

  function getAttributeValue(initializer: ts.JsxAttributeValue | undefined): string | undefined {
    if (!initializer) return undefined
    if (ts.isStringLiteral(initializer)) return initializer.text
    if (ts.isJsxExpression(initializer) && initializer.expression) {
      return initializer.expression.getText(sourceFile)
    }
    return undefined
  }

  function visit(node: ts.Node): void {
    if (isInChangedRange(node)) {
      // Atributos JSX cambiados
      if (ts.isJsxAttribute(node)) {
        const attrName = ts.isIdentifier(node.name) ? node.name.text : String(node.name)
        const parentElement = node.parent?.parent
        const elementName = parentElement ? getJSXElementName(parentElement) : ''
        const addedValue = getAttributeValue(node.initializer)

        // Consume the next removedValue for this element type from the FIFO queue.
        // Only actual renames get a removedValue; new-only elements get undefined.
        const removedValue = consumeRemovedValue(attrName, elementName)

        if (attrName === 'data-test-id' && addedValue) testIds.add(addedValue)

        jsxChanges.push({ element: elementName, attribute: attrName, addedValue, removedValue })

        const component = enclosingComponent(node)
        if (component) components.add(component)

        const fn = enclosingFunction(node)
        if (fn && fn !== component) functions.add(fn)
      }

      // Funciones y componentes modificados directamente
      if (ts.isFunctionDeclaration(node) && node.name) {
        if (/^[A-Z]/.test(node.name.text)) {
          components.add(node.name.text)
        } else {
          functions.add(node.name.text)
        }
      }

      // Arrow functions asignadas a variables
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
      ) {
        const name = node.name.text
        if (/^[A-Z]/.test(name)) {
          components.add(name)
        } else {
          functions.add(name)
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  return {
    filename: diffFile.filename,
    rawDiff: diffFile.rawDiff,
    hunks: diffFile.hunks,
    components: [...components],
    functions: [...functions],
    jsxChanges,
    testIds: [...testIds],
    summary: buildSummary([...components], [...functions], jsxChanges, [...testIds]),
  }
}

function buildSummary(
  components: string[],
  functions: string[],
  jsxChanges: JSXChange[],
  testIds: string[]
): string {
  const parts: string[] = []

  if (components.length > 0) parts.push(`Componentes: ${components.join(', ')}`)

  if (functions.length > 0) parts.push(`Funciones: ${functions.join(', ')}`)

  const attrChanges = jsxChanges.map((c) => {
    const change =
      c.removedValue && c.addedValue
        ? `${c.attribute}="${c.removedValue}" → "${c.addedValue}"`
        : `${c.attribute}`
    return `<${c.element}> ${change}`
  })
  if (attrChanges.length > 0) parts.push(`JSX: ${attrChanges.join(', ')}`)

  if (testIds.length > 0) parts.push(`test-ids: ${testIds.join(', ')}`)

  return parts.join(' | ')
}
