import { execSync, ExecSyncOptions } from 'child_process'
import type { GitOperations } from './types'
import { GitDiffError } from './error'

export function createGitOperations(): GitOperations {
  return {
    getDiff(repoPath: string): string {
      const options: ExecSyncOptions = {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }

      try {
        const diff = execSync('git diff HEAD', options).toString().trim()
        return diff
      } catch (error) {
        const execError = error as Error & { status?: number; stderr?: Buffer }
        throw new GitDiffError(repoPath, execError)
      }
    },

    getDiffFromCommit(repoPath: string, commit: string): string {
      const options: ExecSyncOptions = {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }

      try {
        const diff = execSync(`git diff ${commit}`, options).toString().trim()
        return diff
      } catch (error) {
        const execError = error as Error & { status?: number; stderr?: Buffer }
        throw new GitDiffError(repoPath, execError)
      }
    },
  }
}

export function hasUncommittedChanges(repoPath: string): boolean {
  const options: ExecSyncOptions = {
    cwd: repoPath,
    encoding: 'utf-8',
  }

  try {
    const status = execSync('git status --porcelain', options).toString().trim()
    return status.length > 0
  } catch {
    return false
  }
}
