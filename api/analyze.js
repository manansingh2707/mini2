// api/analyze.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { url, apiKeys = {} } = req.body || {}
  if (!url) {
    return res.status(400).json({ error: 'Repository URL is required' })
  }

  let owner, repo, branchHint
  try {
    const parsed = parseGithubUrl(url)
    owner = parsed.owner
    repo = parsed.repo
    branchHint = parsed.branch
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Invalid GitHub URL' })
  }

  const keys = {
    grok: apiKeys.grok || req.headers['x-grok-key'] || process.env.GROK_API_KEY,
    gemini: apiKeys.gemini || req.headers['x-gemini-key'] || process.env.GEMINI_API_KEY,
    deepseek: apiKeys.deepseek || req.headers['x-deepseek-key'] || process.env.DEEPSEEK_API_KEY,
    openrouter: apiKeys.openrouter || req.headers['x-openrouter-key'] || process.env.OPENROUTER_API_KEY,
    huggingface: apiKeys.huggingface || req.headers['x-huggingface-key'] || process.env.HUGGINGFACE_API_KEY,
    github: apiKeys.github || req.headers['x-github-token'] || process.env.GITHUB_TOKEN,
  }

  try {
    const meta = await fetchRepoMetadata(owner, repo, keys.github)
    const branch = branchHint || meta.default_branch || 'main'

    const [repositoryContent, fileTree] = await Promise.all([
      fetchRepositoryReadme(owner, repo, branch),
      fetchRepositoryTree(owner, repo, branch, keys.github)
    ])

    const techStack = detectTechStack(repositoryContent, fileTree)

    const [explanationResult, architecture] = await Promise.all([
      explainRepository(repositoryContent, meta, fileTree, techStack, keys),
      generateArchitecture(repositoryContent, meta, fileTree, techStack, keys)
    ])

    return res.status(200).json({
      meta: {
        owner,
        repo,
        fullName: meta.full_name || `${owner}/${repo}`,
        description: meta.description || '',
        stars: meta.stargazers_count || 0,
        forks: meta.forks_count || 0,
        openIssues: meta.open_issues_count || 0,
        language: meta.language || 'Code',
        topics: meta.topics || [],
        license: meta.license?.spdx_id || meta.license?.name || 'Not specified',
        defaultBranch: branch,
        avatarUrl: meta.owner?.avatar_url || '',
        htmlUrl: meta.html_url || `https://github.com/${owner}/${repo}`,
      },
      explanation: explanationResult.text,
      highlights: explanationResult.highlights,
      techStack,
      architecture,
      providerUsed: explanationResult.provider,
    })
  } catch (err) {
    console.error('Analyze error:', err)
    return res.status(500).json({ error: err.message || 'Failed to analyze repository' })
  }
}

export function parseGithubUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') throw new Error('Invalid URL provided')
  
  let clean = rawUrl.trim()
  clean = clean.replace(/^(https?:\/\/)?(www\.)?github\.com\//, '')
  clean = clean.replace(/\.git$/, '').replace(/\/$/, '')

  const parts = clean.split('/')
  if (parts.length < 2) {
    throw new Error('Please enter a valid repository URL like https://github.com/owner/repo')
  }

  const owner = parts[0]
  const repo = parts[1]
  let branch = null

  if (parts.length >= 4 && parts[2] === 'tree') {
    branch = parts[3]
  }

  return { owner, repo, branch }
}

async function fetchRepoMetadata(owner, repo, githubToken) {
  const headers = {
    'User-Agent': 'GitHub-Repo-Explainer-App',
    'Accept': 'application/vnd.github.v3+json',
  }
  if (githubToken) {
    headers['Authorization'] = `token ${githubToken}`
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers,
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      return await res.json()
    }
  } catch (e) {
    console.warn('GitHub API metadata fetch failed, using fallback:', e.message)
  }

  return {
    full_name: `${owner}/${repo}`,
    default_branch: 'main',
    stargazers_count: 0,
    forks_count: 0,
    open_issues_count: 0,
    language: 'Code',
    html_url: `https://github.com/${owner}/${repo}`,
  }
}

async function fetchRepositoryReadme(owner, repo, branch) {
  const branches = [branch, 'main', 'master']
  const fileNames = [
    'README.md',
    'readme.md',
    'README.MD',
    'README.markdown',
    'README.rst',
    'README.txt',
    'README'
  ]

  for (const b of branches) {
    for (const name of fileNames) {
      const url = `https://raw.githubusercontent.com/${owner}/${repo}/${b}/${name}`
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(6000) })
        if (response.ok) {
          const text = await response.text()
          if (text && text.trim().length > 10) return text
        }
      } catch {
        continue
      }
    }
  }

  return `# ${repo}\n\nNo README file was found in this repository.`
}

async function fetchRepositoryTree(owner, repo, branch, githubToken) {
  const headers = {
    'User-Agent': 'GitHub-Repo-Explainer-App',
    'Accept': 'application/vnd.github.v3+json',
  }
  if (githubToken) {
    headers['Authorization'] = `token ${githubToken}`
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      { headers, signal: AbortSignal.timeout(8000) }
    )
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data.tree)) {
        return data.tree.map(item => ({
          path: item.path,
          type: item.type === 'tree' ? 'directory' : 'file',
          size: item.size || 0,
        }))
      }
    }
  } catch (e) {
    console.warn('Failed to fetch git tree:', e.message)
  }

  return [
    { path: 'src', type: 'directory', size: 0 },
    { path: 'src/index.js', type: 'file', size: 1024 },
    { path: 'package.json', type: 'file', size: 512 },
    { path: 'README.md', type: 'file', size: 2048 },
  ]
}

function detectTechStack(readme, fileTree = []) {
  const text = (readme + ' ' + fileTree.map(f => f.path).join(' ')).toLowerCase()
  const tech = []

  const signatures = [
    { name: 'React', category: 'Frontend', match: /react|jsx|tsx/ },
    { name: 'Next.js', category: 'Framework', match: /next\.js|nextjs/ },
    { name: 'Vue', category: 'Frontend', match: /vue|vuex|pinia/ },
    { name: 'Node.js', category: 'Backend', match: /nodejs|node\.js|express|fastify/ },
    { name: 'TypeScript', category: 'Language', match: /typescript|\.ts|\.tsx/ },
    { name: 'Python', category: 'Language', match: /python|\.py|django|flask|fastapi/ },
    { name: 'Go', category: 'Language', match: /golang|go\.mod|\.go/ },
    { name: 'Rust', category: 'Language', match: /rust|cargo\.toml|\.rs/ },
    { name: 'Docker', category: 'DevOps', match: /docker|dockerfile/ },
    { name: 'PostgreSQL', category: 'Database', match: /postgres|postgresql/ },
    { name: 'MongoDB', category: 'Database', match: /mongodb|mongoose/ },
    { name: 'Redis', category: 'Cache', match: /redis/ },
    { name: 'Tailwind CSS', category: 'Styling', match: /tailwind/ },
    { name: 'GraphQL', category: 'API', match: /graphql/ },
    { name: 'REST API', category: 'API', match: /rest api|restful/ },
  ]

  for (const sig of signatures) {
    if (sig.match.test(text)) {
      tech.push({ name: sig.name, category: sig.category })
    }
  }

  return tech.length > 0 ? tech : [{ name: 'JavaScript', category: 'Language' }]
}

async function explainRepository(readme, meta, fileTree, techStack, keys) {
  const truncatedReadme = readme.length > 7000 ? readme.slice(0, 7000) : readme
  const topFiles = fileTree.slice(0, 30).map(f => f.path).join(', ')
  const techNames = techStack.map(t => t.name).join(', ')

  const prompt = `You are a friendly engineer explaining a GitHub project to someone who wants to understand it quickly and easily.

Your explanation MUST be written in plain, clear, conversational English that anyone can understand. 
Do not use complicated academic jargon, robotic corporate phrases, or marketing buzzwords. 
Explain things simply, just like you would describe it to a friend over coffee. Use clear everyday analogies when explaining how it works.

Project: ${meta.full_name || meta.repo}
Description: ${meta.description || 'Open source software'}
Files: ${topFiles}
Technologies: ${techNames}

README content:
${truncatedReadme}

Format the explanation with these clear headings:

### What This Project Does
Explain the real-world problem it solves in simple words. Why would someone need this? Use a simple analogy (for example: "Think of it like...").

### How It Works Step by Step
Walk through what actually happens when someone uses this tool or runs this code. Keep the steps logical and easy to follow.

### What It Is Built With
Mention the main tools and technologies used, and briefly explain in plain English why they are used (for example: "React is used to build the visual screen you click on").

### How to Get Started
Give simple, clear instructions on how someone can clone it and run it on their own computer.

### Who Should Use It
Describe who benefits most from this project (beginners, developers, teams) and when it is useful.`

  if (keys.grok) {
    try {
      const text = await callGrok(prompt, keys.grok)
      return { text, highlights: extractHighlights(text), provider: 'Grok' }
    } catch (e) {
      console.warn('Grok failed:', e.message)
    }
  }

  if (keys.gemini) {
    const models = ['gemini-1.5-flash-latest', 'gemini-1.5-flash', 'gemini-2.0-flash-exp']
    for (const m of models) {
      try {
        const text = await callGemini(prompt, keys.gemini, m)
        return { text, highlights: extractHighlights(text), provider: `Gemini` }
      } catch (e) {
        console.warn(`Gemini ${m} failed:`, e.message)
      }
    }
  }

  if (keys.deepseek) {
    try {
      const text = await callDeepSeek(prompt, keys.deepseek)
      return { text, highlights: extractHighlights(text), provider: 'DeepSeek' }
    } catch (e) {
      console.warn('DeepSeek failed:', e.message)
    }
  }

  if (keys.openrouter) {
    try {
      const text = await callOpenRouter(prompt, keys.openrouter, 'meta-llama/llama-3.2-3b-instruct:free')
      return { text, highlights: extractHighlights(text), provider: 'OpenRouter' }
    } catch (e) {
      console.warn('OpenRouter failed:', e.message)
    }
  }

  const fallbackText = generateSimplePlainEnglishExplanation(meta, techStack, fileTree)
  return {
    text: fallbackText,
    highlights: extractHighlights(fallbackText),
    provider: 'Built-in Explainer',
  }
}

function extractHighlights(text) {
  const highlights = []
  const lines = text.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s/.test(trimmed)) {
      const clean = trimmed.replace(/^[-*]|\d+\.\s*/, '').replace(/\*\*/g, '').trim()
      if (clean.length > 20 && clean.length < 130) {
        highlights.push(clean)
        if (highlights.length >= 3) break
      }
    }
  }
  if (highlights.length === 0) {
    return [
      'Simple and clean setup that works right out of the box',
      'Organized in separate, easy-to-understand parts',
      'Built with widely used and dependable modern tools'
    ]
  }
  return highlights
}

function generateSimplePlainEnglishExplanation(meta, techStack, fileTree) {
  const repoName = meta.repo || meta.name || 'this project'
  const techNames = techStack.map(t => t.name).join(', ')

  return `### What This Project Does
**${repoName}** is designed to solve a very practical problem: making complex tasks simpler and faster to complete. 

Think of it like ordering a ready-to-assemble kit instead of having to find every single screw, board, and tool yourself. Instead of writing everything from scratch, this project gives you a solid, working structure right from the start.

### How It Works Step by Step
When you run this project, it follows a simple flow:
1. **Taking Your Input:** It listens for what you want it to do (through your browser, command line, or an API call).
2. **Doing the Heavy Lifting:** The core code processes your request, checks that everything is valid, and runs the main logic.
3. **Saving or Fetching Data:** If information needs to be stored or retrieved, it talks to the database or storage layer.
4. **Showing You the Result:** Finally, it gives you a clean result on your screen or sends back the answer you asked for.

### What It Is Built With
This project relies on **${techNames || 'standard web technologies'}**:
- Clean separation between the user interface and the behind-the-scenes logic.
- Standard configuration files that let you change settings without breaking the code.
- Straightforward tools that make testing and running easy on any computer.

### How to Get Started
You can run this project on your own machine in three simple steps:
\`\`\`bash
# 1. Download the code
git clone ${meta.htmlUrl || `https://github.com/${meta.owner}/${meta.repo}`}.git
cd ${repoName}

# 2. Install the required packages
npm install

# 3. Start the project
npm run dev
\`\`\`

### Who Should Use It
This project is great for:
- Developers who want a reliable, working starter without unnecessary complexity.
- Anyone looking to learn how a well-structured application is put together in plain English.
- Teams that need a dependable foundation they can customize quickly.`
}

async function generateArchitecture(readme, meta, fileTree, techStack, keys) {
  const truncated = readme.length > 5000 ? readme.slice(0, 5000) : readme
  const fileList = fileTree.slice(0, 30).map(f => f.path).join(', ')

  const prompt = `Analyze this GitHub repository and generate an architecture flowchart JSON for ReactFlow.
Return ONLY valid JSON with "nodes" and "edges" arrays.

Node format:
{
  "nodes": [
    { "id": "1", "type": "start", "position": { "x": 350, "y": 40 }, "data": { "label": "User", "description": "Web or mobile user", "tech": "Client" } },
    { "id": "2", "type": "api", "position": { "x": 350, "y": 160 }, "data": { "label": "API Router", "description": "Receives requests", "tech": "HTTP" } }
  ],
  "edges": [
    { "id": "e1-2", "source": "1", "target": "2", "label": "Sends request", "animated": true }
  ]
}

Allowed types: "start", "end", "process", "decision", "database", "api", "service", "ui", "worker", "cache"
Rules: 6 to 10 nodes max, simple and logical top-to-bottom layout.

Repo: ${meta.full_name || meta.repo}
Tech: ${techStack.map(t => t.name).join(', ')}
Files: ${fileList}`

  const callers = [
    { key: keys.grok, call: (p) => callGrok(p, keys.grok) },
    { key: keys.gemini, call: (p) => callGemini(p, keys.gemini, 'gemini-1.5-flash-latest') },
    { key: keys.deepseek, call: (p) => callDeepSeek(p, keys.deepseek) },
  ]

  for (const item of callers) {
    if (!item.key) continue
    try {
      const raw = await item.call(prompt)
      const cleaned = raw.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(cleaned)
      if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges) && parsed.nodes.length >= 4) {
        return normalizeArchitecture(parsed)
      }
    } catch {
      continue
    }
  }

  return generateCleanArchitecture(meta, fileTree, techStack)
}

function normalizeArchitecture(arch) {
  const nodes = arch.nodes.map((n, idx) => ({
    id: String(n.id || idx + 1),
    type: n.type || 'service',
    position: n.position || { x: 220 + (idx % 2) * 220, y: 50 + Math.floor(idx / 2) * 120 },
    data: {
      label: n.data?.label || n.label || `Component ${idx + 1}`,
      description: n.data?.description || n.description || '',
      tech: n.data?.tech || n.tech || '',
    }
  }))

  const edges = arch.edges.map((e, idx) => ({
    id: e.id || `e${e.source}-${e.target}-${idx}`,
    source: String(e.source),
    target: String(e.target),
    label: e.label || '',
    animated: e.animated ?? true,
  }))

  return { nodes, edges }
}

function generateCleanArchitecture(meta, fileTree, techStack) {
  const nodes = []
  const edges = []
  let nextNodeId = 1
  let nextEdgeId = 1

  const addNode = (type, label, x, y, description, tech) => {
    const id = String(nextNodeId++)
    nodes.push({ id, type, position: { x, y }, data: { label, description, tech } })
    return id
  }

  const addEdge = (source, target, label) => {
    edges.push({ id: `e${nextEdgeId++}`, source, target, label, animated: true })
  }

  const filePaths = fileTree.map(f => f.path.toLowerCase()).join(' ')
  const techNames = techStack.map(t => t.name.toLowerCase())

  const hasUi = techNames.some(t => ['react', 'vue', 'frontend'].includes(t)) || filePaths.includes('src/')
  const hasApi = techNames.some(t => ['node.js', 'express', 'python', 'api'].includes(t)) || filePaths.includes('api/')
  const hasDb = techNames.some(t => ['postgresql', 'mongodb', 'database'].includes(t)) || filePaths.includes('db')

  const startId = addNode('start', 'User Request', 350, 40, 'User interacts with the application', 'Client')
  
  let currentTarget = startId
  if (hasUi) {
    const uiId = addNode('ui', 'User Interface', 350, 150, 'Visual pages and buttons', 'Frontend')
    addEdge(startId, uiId, 'Opens')
    currentTarget = uiId
  }

  let serviceParent = currentTarget
  if (hasApi) {
    const apiId = addNode('api', 'API Router', 350, 260, 'Receives and validates requests', 'Backend')
    addEdge(currentTarget, apiId, 'Calls')
    serviceParent = apiId
  }

  const serviceId = addNode('service', 'Core Logic', 350, 370, 'Processes tasks and business rules', 'Core')
  addEdge(serviceParent, serviceId, 'Processes')

  if (hasDb) {
    const dbId = addNode('database', 'Database', 350, 480, 'Stores persistent data', 'Storage')
    addEdge(serviceId, dbId, 'Reads/Writes')
  }

  const endId = addNode('end', 'Final Response', 350, 590, 'Returns clean result back to user', 'Result')
  addEdge(serviceId, endId, 'Delivers')

  return { nodes, edges }
}

/* Callers */
async function callGrok(prompt, apiKey) {
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'grok-beta',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      max_tokens: 2200,
    }),
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error(`Grok error: ${response.status}`)
  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

async function callGemini(prompt, apiKey, model) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 2200 },
      }),
      signal: AbortSignal.timeout(20000),
    }
  )
  if (!response.ok) throw new Error(`Gemini error: ${response.status}`)
  const data = await response.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

async function callDeepSeek(prompt, apiKey) {
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      max_tokens: 2200,
    }),
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error(`DeepSeek error: ${response.status}`)
  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

async function callOpenRouter(prompt, apiKey, model) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/agrwl-utkarsh/mini2',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      max_tokens: 2200,
    }),
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error(`OpenRouter error: ${response.status}`)
  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}
