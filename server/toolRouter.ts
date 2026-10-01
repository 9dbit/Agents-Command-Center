type GitHubCommit = {
  sha: string
  message: string
  author: string
  date: string | null
  url: string
}

export type GitHubSnapshot = {
  repository: string
  name: string
  fullName: string
  description: string | null
  visibility: string
  defaultBranch: string
  stars: number
  forks: number
  openIssues: number
  updatedAt: string
  url: string
  commits: GitHubCommit[]
}

const repository = () => process.env.GITHUB_REPOSITORY || '9dbit/Agents-Command-Center'

function githubHeaders() {
  const headers: Record<string,string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'agents-command-center/0.5'
  }
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  return headers
}

async function githubJson(path: string) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: githubHeaders(),
    signal: AbortSignal.timeout(15000)
  })
  if (!response.ok) {
    const body = await response.text().catch(()=>'')
    throw new Error(`github_error:${response.status}:${body.slice(0,240)}`)
  }
  return response.json()
}

export function getToolStatus() {
  return {
    connectors: [{
      id: 'github',
      name: 'GitHub',
      status: 'ready',
      configured: true,
      mode: process.env.GITHUB_TOKEN ? 'authenticated' : 'public-read',
      repository: repository(),
      capabilities: ['repository.read','commits.read','brain.sync']
    }]
  }
}

export async function fetchGitHubSnapshot(): Promise<GitHubSnapshot> {
  const repo = repository()
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('invalid_github_repository')
  const [metadata, commits] = await Promise.all([
    githubJson(`/repos/${repo}`),
    githubJson(`/repos/${repo}/commits?per_page=6`)
  ])
  return {
    repository: repo,
    name: metadata.name,
    fullName: metadata.full_name,
    description: metadata.description || null,
    visibility: metadata.visibility || (metadata.private ? 'private' : 'public'),
    defaultBranch: metadata.default_branch,
    stars: Number(metadata.stargazers_count || 0),
    forks: Number(metadata.forks_count || 0),
    openIssues: Number(metadata.open_issues_count || 0),
    updatedAt: metadata.updated_at,
    url: metadata.html_url,
    commits: (Array.isArray(commits) ? commits : []).map((c:any)=>(
      {
        sha: String(c.sha || '').slice(0,12),
        message: String(c.commit?.message || '').split('\n')[0],
        author: String(c.commit?.author?.name || c.author?.login || 'Unknown'),
        date: c.commit?.author?.date || null,
        url: c.html_url
      }
    ))
  }
}
