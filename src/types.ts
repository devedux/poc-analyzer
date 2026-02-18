export interface SpecFile {
  name: string
  content: string
}

export interface AnalyzeResult {
  test: string
  file: string
  line: number
  status: 'broken' | 'risk' | 'ok'
  reason: string
}

export interface AnalysisSummary {
  broken: AnalyzeResult[]
  risk: AnalyzeResult[]
  ok: AnalyzeResult[]
  total: number
}

export interface LLMClient {
  chat(messages: ChatMessage[], options?: LLMOptions): AsyncGenerator<LLMResponse>
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface LLMOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  stream?: boolean
}

export interface LLMResponse {
  message: {
    role: string
    content: string
  }
  done: boolean
}

export interface Config {
  frontRepoPath: string
  e2eRepoPath: string
  model: string
  maxTokens: number
  temperature: number
  repeatPenalty: number
}

export interface AppDependencies {
  config: Config
  llmClient: LLMClient
  git: GitOperations
  specsReader: SpecsReader
}

export interface GitOperations {
  getDiff(repoPath: string): string
  getDiffFromCommit(repoPath: string, commit: string): string
}

export interface SpecsReader {
  readSpecs(repoPath: string): SpecFile[]
}

export interface LLMClientFactory {
  create(config: Config): LLMClient
}
