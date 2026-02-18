import { describe, it, expect } from 'vitest'
import { getConfig, validateConfig, validatePRConfig } from '../config'
import { ConfigurationError } from '../error'
import type { Config } from '../types'

describe('config', () => {
  describe('getConfig', () => {
    it('should return config with default values', () => {
      const config = getConfig()

      expect(config.frontRepoPath).toBeDefined()
      expect(config.e2eRepoPath).toBeDefined()
      expect(config.model).toBe('llama3.2')
      expect(config.maxTokens).toBe(1024)
      expect(config.temperature).toBe(0.1)
      expect(config.repeatPenalty).toBe(1.3)
    })

    it('should read from environment variables', () => {
      const originalEnv = process.env

      process.env = {
        ...originalEnv,
        FRONT_REPO_PATH: '/custom/front',
        E2E_REPO_PATH: '/custom/e2e',
        OLLAMA_MODEL: 'custom-model',
        OLLAMA_MAX_TOKENS: '2048',
        OLLAMA_TEMPERATURE: '0.5',
        OLLAMA_REPEAT_PENALTY: '1.5',
        GITHUB_OWNER: 'my-org',
        GITHUB_REPO: 'my-repo',
        GITHUB_TOKEN: 'ghp_test',
      }

      try {
        const config = getConfig()

        expect(config.frontRepoPath).toContain('/custom/front')
        expect(config.e2eRepoPath).toContain('/custom/e2e')
        expect(config.model).toBe('custom-model')
        expect(config.maxTokens).toBe(2048)
        expect(config.temperature).toBe(0.5)
        expect(config.repeatPenalty).toBe(1.5)
        expect(config.githubOwner).toBe('my-org')
        expect(config.githubRepo).toBe('my-repo')
        expect(config.githubToken).toBe('ghp_test')
      } finally {
        process.env = originalEnv
      }
    })
  })

  describe('validateConfig', () => {
    it('should throw ConfigurationError for empty frontRepoPath', () => {
      const config: Config = {
        frontRepoPath: '',
        e2eRepoPath: '/valid/path',
        model: 'llama3.2',
        maxTokens: 1024,
        temperature: 0.1,
        repeatPenalty: 1.3,
      }

      expect(() => validateConfig(config)).toThrow(ConfigurationError)
    })

    it('should throw ConfigurationError for empty e2eRepoPath', () => {
      const config: Config = {
        frontRepoPath: '/valid/path',
        e2eRepoPath: '',
        model: 'llama3.2',
        maxTokens: 1024,
        temperature: 0.1,
        repeatPenalty: 1.3,
      }

      expect(() => validateConfig(config)).toThrow(ConfigurationError)
    })

    it('should throw ConfigurationError for invalid maxTokens', () => {
      const config: Config = {
        frontRepoPath: '/valid/path',
        e2eRepoPath: '/valid/path',
        model: 'llama3.2',
        maxTokens: -1,
        temperature: 0.1,
        repeatPenalty: 1.3,
      }

      expect(() => validateConfig(config)).toThrow('OLLAMA_MAX_TOKENS must be positive')
    })

    it('should throw ConfigurationError for invalid temperature', () => {
      const config: Config = {
        frontRepoPath: '/valid/path',
        e2eRepoPath: '/valid/path',
        model: 'llama3.2',
        maxTokens: 1024,
        temperature: 3,
        repeatPenalty: 1.3,
      }

      expect(() => validateConfig(config)).toThrow('OLLAMA_TEMPERATURE must be between 0 and 2')
    })

    it('should not throw for valid config', () => {
      const config: Config = {
        frontRepoPath: '/valid/path',
        e2eRepoPath: '/valid/path',
        model: 'llama3.2',
        maxTokens: 1024,
        temperature: 0.5,
        repeatPenalty: 1.3,
      }

      expect(() => validateConfig(config)).not.toThrow()
    })
  })

  describe('validatePRConfig', () => {
    const baseConfig: Config = {
      frontRepoPath: '/valid/path',
      e2eRepoPath: '/valid/path',
      model: 'llama3.2',
      maxTokens: 1024,
      temperature: 0.1,
      repeatPenalty: 1.3,
    }

    it('should throw when githubToken is missing', () => {
      expect(() =>
        validatePRConfig({ ...baseConfig, githubOwner: 'org', githubRepo: 'repo' })
      ).toThrow('GITHUB_TOKEN is required')
    })

    it('should throw when githubOwner is missing', () => {
      expect(() =>
        validatePRConfig({ ...baseConfig, githubToken: 'token', githubRepo: 'repo' })
      ).toThrow('GITHUB_OWNER is required')
    })

    it('should throw when githubRepo is missing', () => {
      expect(() =>
        validatePRConfig({ ...baseConfig, githubToken: 'token', githubOwner: 'org' })
      ).toThrow('GITHUB_REPO is required')
    })

    it('should not throw when all github fields are present', () => {
      expect(() =>
        validatePRConfig({
          ...baseConfig,
          githubToken: 'token',
          githubOwner: 'org',
          githubRepo: 'repo',
        })
      ).not.toThrow()
    })
  })
})
