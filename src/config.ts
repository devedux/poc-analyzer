import { resolve } from 'path'
import type { Config } from './types'

const DEFAULT_FRONT_REPO = '../poc-front-app'
const DEFAULT_E2E_REPO = '../poc-e2e-tests'
const DEFAULT_MODEL = 'llama3.2'
const DEFAULT_MAX_TOKENS = 1024
const DEFAULT_TEMPERATURE = 0.1
const DEFAULT_REPEAT_PENALTY = 1.3

export const CONFIG = {
  get frontRepoPath(): string {
    return resolve(process.env.FRONT_REPO_PATH ?? DEFAULT_FRONT_REPO)
  },

  get e2eRepoPath(): string {
    return resolve(process.env.E2E_REPO_PATH ?? DEFAULT_E2E_REPO)
  },

  get model(): string {
    return process.env.OLLAMA_MODEL ?? DEFAULT_MODEL
  },

  get maxTokens(): number {
    const envValue = process.env.OLLAMA_MAX_TOKENS
    return envValue ? parseInt(envValue, 10) : DEFAULT_MAX_TOKENS
  },

  get temperature(): number {
    const envValue = process.env.OLLAMA_TEMPERATURE
    return envValue ? parseFloat(envValue) : DEFAULT_TEMPERATURE
  },

  get repeatPenalty(): number {
    const envValue = process.env.OLLAMA_REPEAT_PENALTY
    return envValue ? parseFloat(envValue) : DEFAULT_REPEAT_PENALTY
  },
} as const

export function getConfig(): Config {
  return {
    frontRepoPath: CONFIG.frontRepoPath,
    e2eRepoPath: CONFIG.e2eRepoPath,
    model: CONFIG.model,
    maxTokens: CONFIG.maxTokens,
    temperature: CONFIG.temperature,
    repeatPenalty: CONFIG.repeatPenalty,
  }
}

export function validateConfig(config: Config): void {
  const errors: string[] = []

  if (!config.frontRepoPath) {
    errors.push('FRONT_REPO_PATH is required')
  }

  if (!config.e2eRepoPath) {
    errors.push('E2E_REPO_PATH is required')
  }

  if (!config.model) {
    errors.push('OLLAMA_MODEL is required')
  }

  if (config.maxTokens <= 0) {
    errors.push('OLLAMA_MAX_TOKENS must be positive')
  }

  if (config.temperature < 0 || config.temperature > 2) {
    errors.push('OLLAMA_TEMPERATURE must be between 0 and 2')
  }

  if (errors.length > 0) {
    throw new ConfigurationError(errors.join('; '))
  }
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(`Configuration error: ${message}`)
    this.name = 'ConfigurationError'
  }
}
