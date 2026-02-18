# poc-analyzer — Memory

## Stack
TypeScript + Ollama (local LLM) + Vitest. Entry points: `src/analyze.ts` (local) y `src/analyze-pr.ts` (GitHub PR).

## Arquitectura post-refactor (PATH 10/10)
- `types.ts` — interfaces puras: `AnalyzerDependencies`, `PRAnalyzerDependencies`, `GitHubClient`, `Config` (con campos github opcionales)
- `error.ts` — jerarquía completa: `AnalyzerError` (base), `ConfigurationError`, `GitDiffError`, `SpecsNotFoundError`, `SpecsReadError`, `LLMError`, `ValidationError`
- `config.ts` — `getConfig()`, `validateConfig()`, `validatePRConfig()`. El objeto `CONFIG` es interno, no exportado.
- `github.ts` — `createGitHubClient(token, owner, repo): GitHubClient`
- `analyze.ts` — `runAnalysis(deps, opts)`, `collectStream(stream, onChunk?)`, `createDependencies()`. Protegido con `require.main === module`. Carga `dotenv/config`.
- `analyze-pr.ts` — `runPRAnalysis(deps, prNumber)`, `createPRDependencies()`. Protegido con `require.main === module`.
- `index.ts` — barrel export limpio

## Patrones confirmados
- Usar `require.main === module` para proteger entry points de efectos de módulo en imports/tests
- `collectStream` usa `done: true` chunk como fuente de verdad del contenido completo
- `MockLLMClient.done` chunk siempre devuelve `this.responses.join('')`
- `ConfigurationError` extiende `AnalyzerError` para ser capturada por el handler genérico

## Tests
- 53 tests totales en 7 archivos. Corren con `npm run test:run`.
- Los diagnósticos del IDE pueden quedar stale — confiar en `vitest run` como fuente de verdad.
- `specs.test.ts` usa `vi.mock('fs')` para testear `createSpecsReader` sin filesystem real.
