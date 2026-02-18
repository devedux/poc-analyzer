import { describe, it, expect } from 'vitest'
import { filterSpecsByPattern, getSpecFilesCount } from '../specs'
import type { SpecFile } from '../types'

describe('specs', () => {
  describe('getSpecFilesCount', () => {
    it('should return correct count', () => {
      const specs: SpecFile[] = [
        { name: 'a.spec.ts', content: 'test a' },
        { name: 'b.spec.ts', content: 'test b' },
        { name: 'c.spec.ts', content: 'test c' },
      ]

      expect(getSpecFilesCount(specs)).toBe(3)
    })

    it('should return 0 for empty array', () => {
      expect(getSpecFilesCount([])).toBe(0)
    })
  })

  describe('filterSpecsByPattern', () => {
    const specs: SpecFile[] = [
      { name: 'login.spec.ts', content: 'test login' },
      { name: 'logout.spec.ts', content: 'test logout' },
      { name: 'home.spec.ts', content: 'test home' },
      { name: 'auth.spec.ts', content: 'test auth' },
    ]

    it('should filter specs by pattern', () => {
      const result = filterSpecsByPattern(specs, /login|logout/)

      expect(result).toHaveLength(2)
      expect(result.map((s) => s.name)).toContain('login.spec.ts')
      expect(result.map((s) => s.name)).toContain('logout.spec.ts')
    })

    it('should return empty array when no match', () => {
      const result = filterSpecsByPattern(specs, /nonexistent/)

      expect(result).toHaveLength(0)
    })

    it('should return all specs when pattern matches all', () => {
      const result = filterSpecsByPattern(specs, /\.spec\.ts$/)

      expect(result).toHaveLength(4)
    })
  })
})
