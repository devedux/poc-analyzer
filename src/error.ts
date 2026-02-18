export type ErrorCode =
  | 'GIT_DIFF_ERROR'
  | 'SPECS_NOT_FOUND'
  | 'SPECS_READ_ERROR'
  | 'LLM_ERROR'
  | 'VALIDATION_ERROR'

export abstract class AnalyzerError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly recoverable: boolean = false
  ) {
    super(message)
    this.name = 'AnalyzerError'
    Error.captureStackTrace(this, this.constructor)
  }
}

export class GitDiffError extends AnalyzerError {
  constructor(repoPath: string, cause?: Error) {
    super(
      'GIT_DIFF_ERROR',
      `Failed to get git diff from: ${repoPath}${cause ? `. Cause: ${cause.message}` : ''}`,
      false
    )
    this.name = 'GitDiffError'
  }
}

export class SpecsNotFoundError extends AnalyzerError {
  constructor(repoPath: string) {
    super('SPECS_NOT_FOUND', `Specs directory not found: ${repoPath}`, false)
    this.name = 'SpecsNotFoundError'
  }
}

export class SpecsReadError extends AnalyzerError {
  constructor(filePath: string, cause?: Error) {
    super(
      'SPECS_READ_ERROR',
      `Failed to read spec file: ${filePath}${cause ? `. Cause: ${cause.message}` : ''}`,
      false
    )
    this.name = 'SpecsReadError'
  }
}

export class LLMError extends AnalyzerError {
  cause?: Error

  constructor(message: string, cause?: Error) {
    super('LLM_ERROR', message, true)
    this.name = 'LLMError'
    if (cause) {
      this.cause = cause
    }
  }
}

export class ValidationError extends AnalyzerError {
  constructor(message: string) {
    super('VALIDATION_ERROR', message, false)
    this.name = 'ValidationError'
  }
}
