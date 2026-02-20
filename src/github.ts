import type { GitHubClient, GitHubClientExtended, PRMetadata } from './types'

export function createGitHubClient(token: string, owner: string, repo: string): GitHubClientExtended {
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

    async getPRMetadata(prNumber: number): Promise<PRMetadata> {
      const res = await githubFetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`
      )
      const data = (await res.json()) as {
        number: number
        title: string
        body: string | null
        user: { login: string }
        head: { ref: string; sha: string }
        base: { sha: string }
        created_at: string
        merged_at: string | null
      }

      return {
        prNumber: data.number,
        title: data.title,
        description: data.body ?? '',
        author: data.user.login,
        branch: data.head.ref,
        commitSha: data.head.sha,
        baseSha: data.base.sha,
        createdAt: data.created_at,
        mergedAt: data.merged_at,
      }
    },
  }
}
