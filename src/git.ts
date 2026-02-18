import { execSync, ExecSyncOptions } from 'child_process'
import type { GitOperations } from './types'
import { GitDiffError } from './error'

function buildExecOptions(repoPath: string): ExecSyncOptions {
  return { cwd: repoPath, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
}

export function createGitOperations(): GitOperations {
  return {
    getDiff(repoPath: string): string {
      try {
        return execSync('git diff HEAD', buildExecOptions(repoPath)).toString().trim()
      } catch (error) {
        const execError = error as Error & { status?: number; stderr?: Buffer }
        throw new GitDiffError(repoPath, execError)
      }
    },

    getDiffFromCommit(repoPath: string, commit: string): string {
      try {
        return execSync(`git diff ${commit}`, buildExecOptions(repoPath)).toString().trim()
      } catch (error) {
        const execError = error as Error & { status?: number; stderr?: Buffer }
        throw new GitDiffError(repoPath, execError)
      }
    },
  }
}
