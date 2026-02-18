import type { GitHubClient } from './types'

export function createGitHubClient(token: string, owner: string, repo: string): GitHubClient {
  return {
    async getPRDiff(prNumber: number): Promise<string> {
      const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3.diff',
        },
      })

      if (!res.ok) {
        throw new Error(`GitHub API error ${res.status}: ${await res.text()}`)
      }

      return res.text()
    },

    async postComment(prNumber: number, body: string): Promise<void> {
      const url = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body }),
      })

      if (!res.ok) {
        throw new Error(`GitHub API error ${res.status}: ${await res.text()}`)
      }
    },
  }
}
