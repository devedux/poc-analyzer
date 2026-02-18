import { describe, it, expect } from 'vitest'
import {
  AnalyzerError,
  GitDiffError,
  SpecsNotFoundError,
  SpecsReadError,
  LLMError,
  ValidationError,
} from '../error'

describe('error', () => {
  describe('AnalyzerError', () => {
    it('should have correct properties via subclass', () => {
      const error = new ValidationError('Test error message')

      expect(error.code).toBe('VALIDATION_ERROR')
      expect(error.message).toBe('Test error message')
      expect(error.recoverable).toBe(false)
      expect(error.name).toBe('ValidationError')
    })

    it('should default recoverable to false', () => {
      const error = new ValidationError('Test')

      expect(error.recoverable).toBe(false)
    })
  })

  describe('GitDiffError', () => {
    it('should create error with repo path', () => {
      const error = new GitDiffError('/repo/path')

      expect(error.code).toBe('GIT_DIFF_ERROR')
      expect(error.message).toContain('/repo/path')
      expect(error.name).toBe('GitDiffError')
      expect(error.recoverable).toBe(false)
    })

    it('should include cause message when provided', () => {
      const cause = new Error('Original error')
      const error = new GitDiffError('/repo/path', cause)

      expect(error.message).toContain('Original error')
    })
  })

  describe('SpecsNotFoundError', () => {
    it('should create error with path', () => {
      const error = new SpecsNotFoundError('/specs/path')

      expect(error.code).toBe('SPECS_NOT_FOUND')
      expect(error.message).toContain('/specs/path')
      expect(error.name).toBe('SpecsNotFoundError')
    })
  })

  describe('SpecsReadError', () => {
    it('should create error with file path', () => {
      const error = new SpecsReadError('/specs/test.spec.ts')

      expect(error.code).toBe('SPECS_READ_ERROR')
      expect(error.message).toContain('/specs/test.spec.ts')
      expect(error.name).toBe('SpecsReadError')
    })

    it('should include cause when provided', () => {
      const cause = new Error('File not found')
      const error = new SpecsReadError('/specs/test.spec.ts', cause)

      expect(error.message).toContain('File not found')
    })
  })

  describe('LLMError', () => {
    it('should create error with message', () => {
      const error = new LLMError('API error')

      expect(error.code).toBe('LLM_ERROR')
      expect(error.message).toBe('API error')
      expect(error.name).toBe('LLMError')
      expect(error.recoverable).toBe(true)
    })

    it('should include cause when provided', () => {
      const cause = new Error('Network error')
      const error = new LLMError('API error', cause)

      expect(error.cause).toBe(cause)
    })
  })

  describe('ValidationError', () => {
    it('should create error with message', () => {
      const error = new ValidationError('Invalid input')

      expect(error.code).toBe('VALIDATION_ERROR')
      expect(error.message).toBe('Invalid input')
      expect(error.name).toBe('ValidationError')
    })
  })
})
