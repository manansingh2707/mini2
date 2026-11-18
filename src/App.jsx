import { useState, useEffect } from 'react'
import ArchitectureFlow from './components/ArchitectureFlow'
import Chatbot from './components/Chatbot'
import CodeExplanation from './components/CodeExplanation'
import './App.css'

const TABS = [
  { id: 'explanation', label: 'Explanation' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'chatbot', label: 'Chat' },
]

const EXAMPLE_REPOS = [
  { label: 'Next.js', url: 'https://github.com/vercel/next.js' },
  { label: 'React', url: 'https://github.com/facebook/react' },
  { label: 'Vite', url: 'https://github.com/vitejs/vite' },
  { label: 'Tailwind CSS', url: 'https://github.com/tailwindlabs/tailwindcss' },
  { label: 'Express', url: 'https://github.com/expressjs/express' },
]

function App() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('explanation')
  
  const [repoMeta, setRepoMeta] = useState(null)
  const [explanation, setExplanation] = useState(null)
  const [highlights, setHighlights] = useState([])
  const [techStack, setTechStack] = useState([])
  const [architecture, setArchitecture] = useState(null)

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('repo_explainer_theme') || 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('repo_explainer_theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light')
  }

  const handleSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault()
    if (!url.trim() || loading) return

    setLoading(true)
    setError('')
    setExplanation(null)
    setArchitecture(null)
    setRepoMeta(null)

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: url.trim(),
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(errData.error || `HTTP ${res.status}`)
      }

      const data = await res.json()
      setRepoMeta(data.meta)
      setExplanation(data.explanation)
      setHighlights(data.highlights || [])
      setTechStack(data.techStack || [])
      setArchitecture(data.architecture)
      setActiveTab('explanation')
    } catch (err) {
      setError(err.message || 'Something went wrong while analyzing the repository.')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectExample = (exampleUrl) => {
    setUrl(exampleUrl)
  }

  const renderActiveTabContent = () => {
    if (!repoMeta && !explanation && !loading) {
      return (
        <div className="empty-state">
          <p>Enter a GitHub repository URL above and click <strong>Explain Repository</strong>.</p>
        </div>
      )
    }

    switch (activeTab) {
      case 'explanation':
        return (
          <CodeExplanation
            explanation={explanation}
            repoMeta={repoMeta}
            techStack={techStack}
            highlights={highlights}
          />
        )
      case 'architecture':
        return (
          <ArchitectureFlow
            architecture={architecture}
            repoMeta={repoMeta}
          />
        )
      case 'chatbot':
        return (
          <Chatbot
            repoMeta={repoMeta}
            techStack={techStack}
            explanation={explanation}
            architecture={architecture}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="app-layout">
      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-brand">
            <span className="brand-title">Repository Explainer</span>
          </div>

          <div className="topbar-actions">
            <button
              type="button"
              className="btn-topbar"
              onClick={toggleTheme}
            >
              {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
            </button>

            <a
              href="https://github.com/agrwl-utkarsh/mini2"
              target="_blank"
              rel="noreferrer"
              className="btn-topbar"
            >
              GitHub
            </a>
          </div>
        </div>
      </header>

      <main className="container">
        {/* Minimal Hero */}
        <section className="hero">
          <h1>GitHub Repository Explainer</h1>
          <p className="subtitle">
            Understand any codebase in plain, simple English. Inspect system architecture and chat about the code.
          </p>
        </section>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="analyze-form" noValidate>
          <div className="input-wrapper">
            <label htmlFor="repo-url" className="visually-hidden">GitHub Repository URL</label>
            <input
              id="repo-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/owner/repository"
              required
              disabled={loading}
              autoComplete="off"
            />
            {url && !loading && (
              <button
                type="button"
                className="clear-btn"
                onClick={() => setUrl('')}
                aria-label="Clear URL"
              >
                ✕
              </button>
            )}
          </div>
          <button type="submit" className="submit-btn" disabled={loading || !url.trim()}>
            {loading ? (
              <>
                <span className="spinner" aria-hidden="true"></span>
                <span>Analyzing...</span>
              </>
            ) : (
              'Explain Repository'
            )}
          </button>
        </form>

        {/* Example repositories */}
        <div className="examples">
          <span className="examples-label">Examples:</span>
          {EXAMPLE_REPOS.map((ex) => (
            <button
              key={ex.url}
              type="button"
              className="example-btn"
              onClick={() => handleSelectExample(ex.url)}
              disabled={loading}
            >
              {ex.label}
            </button>
          ))}
        </div>

        {/* Error notification */}
        {error && (
          <div className="error" role="alert">
            <span>{error}</span>
          </div>
        )}

        {/* Results */}
        {(repoMeta || explanation || loading) && (
          <article className="result">
            {/* Repository Info Header Card */}
            {repoMeta && (
              <header className="repo-info-banner">
                <div className="repo-identity">
                  <div>
                    <h2 className="repo-name">
                      <a href={repoMeta.htmlUrl} target="_blank" rel="noreferrer">
                        {repoMeta.fullName}
                      </a>
                    </h2>
                    {repoMeta.description && (
                      <p className="repo-desc">{repoMeta.description}</p>
                    )}
                  </div>
                </div>

                <div className="repo-stats-pills">
                  <span className="stat-pill">{repoMeta.stars.toLocaleString()} stars</span>
                  <span className="stat-pill">{repoMeta.forks.toLocaleString()} forks</span>
                  <span className="stat-pill">{repoMeta.language}</span>
                  <span className="stat-pill">{repoMeta.license}</span>
                </div>
              </header>
            )}

            {/* Tab Navigation */}
            <div className="tab-bar" role="tablist">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`panel-${tab.id}`}
                  id={`tab-${tab.id}`}
                  className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className="tab-label">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Tab Panel Content */}
            <div
              className="tab-panels"
              role="tabpanel"
              id={`panel-${activeTab}`}
              aria-labelledby={`tab-${activeTab}`}
            >
              {renderActiveTabContent()}
            </div>
          </article>
        )}
      </main>
    </div>
  )
}

export default App
