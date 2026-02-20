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
  githubOwner?: string
  githubRepo?: string
  githubToken?: string
}

export interface GitHubClient {
  getPRDiff(prNumber: number): Promise<string>
  getFileContent(path: string, ref: string): Promise<string>
  postComment(prNumber: number, body: string): Promise<void>
}

export interface DiffLine {
  type: 'added' | 'removed' | 'context'
  content: string
  newLineNumber: number | null
  oldLineNumber: number | null
}

export interface DiffHunk {
  oldStart: number
  newStart: number
  lines: DiffLine[]
}

export interface DiffFile {
  filename: string
  rawDiff: string
  hunks: DiffHunk[]
}

export interface JSXChange {
  element: string
  attribute: string
  addedValue?: string
  removedValue?: string
}

export interface ASTChunk {
  filename: string
  rawDiff: string
  hunks: DiffHunk[]
  components: string[]
  functions: string[]
  jsxChanges: JSXChange[]
  testIds: string[]
  summary: string
}

export interface GitOperations {
  getDiff(repoPath: string): string
  getDiffFromCommit(repoPath: string, commit: string): string
}

export interface SpecsReader {
  readSpecs(repoPath: string): SpecFile[]
}

export interface AnalyzerDependencies {
  config: Config
  llmClient: LLMClient
  git: GitOperations
  specsReader: SpecsReader
}

export interface PRAnalyzerDependencies {
  config: Config
  llmClient: LLMClient
  specsReader: SpecsReader
  githubClient: GitHubClient
}

export interface SpecChunk {
  testName: string
  filename: string
  content: string
}

export interface ScoredSpecChunk {
  chunk: SpecChunk
  score: number
}

export interface SemanticMatch {
  diffChunk: ASTChunk
  relevantSpecs: ScoredSpecChunk[]
}

// ─── Step 4: Graph persistence types ─────────────────────

export interface PRMetadata {
  prNumber: number
  title: string
  description: string
  author: string
  branch: string
  commitSha: string
  baseSha: string
  createdAt: string
  mergedAt: string | null
}

/**
 * Score detallado que preserva todas las señales de retrieval
 * por separado. Nunca tirar datos para training futuro.
 */
export interface ScoredSpecChunkDetailed {
  chunk: SpecChunk
  cosineScore: number
  bm25Score: number
  rrfScore: number
  rank: number
}

export interface SemanticMatchDetailed {
  diffChunk: ASTChunk
  relevantSpecs: ScoredSpecChunkDetailed[]
}

export interface GitHubClientExtended extends GitHubClient {
  getPRMetadata(prNumber: number): Promise<PRMetadata>
}
