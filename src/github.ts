import type { GitHubClient } from './types'

export function createGitHubClient(token: string, owner: string, repo: string): GitHubClient {
  const baseHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
  }

  async function githubFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const res = await fetch(url, {
      ...options,
      headers: { ...baseHeaders, ...(options.headers as Record<string, string>) },
    })
    if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${await res.text()}`)
    return res
  }

  return {
    async getPRDiff(prNumber: number): Promise<string> {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3.diff',
          },
        }
      )
      if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${await res.text()}`)
      return res.text()
    },

    async getFileContent(path: string, ref: string): Promise<string> {
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`
      const res = await githubFetch(url)
      const data = (await res.json()) as { content: string; encoding: string }
      if (data.encoding !== 'base64') throw new Error(`Unexpected encoding: ${data.encoding}`)
      return Buffer.from(data.content, 'base64').toString('utf-8')
    },

    async postComment(prNumber: number, body: string): Promise<void> {
      await githubFetch(
        `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        }
      )
    },
  }
}
