import { describe, it, expect, vi } from 'vitest'
import * as fs from 'fs'
import { createSpecsReader } from '../specs'
import { SpecsNotFoundError } from '../error'

vi.mock('fs')

describe('createSpecsReader', () => {
  it('should throw SpecsNotFoundError when specs directory does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const reader = createSpecsReader()

    expect(() => reader.readSpecs('/some/path')).toThrow(SpecsNotFoundError)
  })

  it('should return only .spec.ts files', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue(['login.spec.ts', 'README.md', 'helper.ts'] as any)
    vi.mocked(fs.readFileSync).mockReturnValue('test content' as any)

    const reader = createSpecsReader()
    const specs = reader.readSpecs('/some/path')

    expect(specs).toHaveLength(1)
    expect(specs[0].name).toBe('login.spec.ts')
  })

  it('should read file content correctly', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue(['test.spec.ts'] as any)
    vi.mocked(fs.readFileSync).mockReturnValue('it("works", () => {})' as any)

    const reader = createSpecsReader()
    const specs = reader.readSpecs('/some/path')

    expect(specs[0].content).toBe('it("works", () => {})')
  })

  it('should return empty array when no spec files exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue(['README.md', 'helper.ts'] as any)

    const reader = createSpecsReader()
    const specs = reader.readSpecs('/some/path')

    expect(specs).toHaveLength(0)
  })
})
