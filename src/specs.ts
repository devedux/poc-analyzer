import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import type { SpecsReader, SpecFile } from './types'
import { SpecsNotFoundError, SpecsReadError } from './error'

export function createSpecsReader(): SpecsReader {
  return {
    readSpecs(repoPath: string): SpecFile[] {
      const specsDir = join(repoPath, 'specs')

      if (!existsSync(specsDir)) {
        throw new SpecsNotFoundError(specsDir)
      }

      const files = readdirSync(specsDir)

      return files
        .filter((file) => file.endsWith('.spec.ts'))
        .map((file) => {
          const filePath = join(specsDir, file)
          try {
            const content = readFileSync(filePath, 'utf-8')
            return { name: file, content }
          } catch (error) {
            const readError = error as Error
            throw new SpecsReadError(filePath, readError)
          }
        })
    },
  }
}
