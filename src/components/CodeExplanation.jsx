import { useMemo } from 'react'
import { renderFormattedText } from '../utils/formatText'

export default function CodeExplanation({ explanation, repoMeta, techStack = [], highlights = [] }) {
  const renderedSections = useMemo(() => {
    if (!explanation) return null
    const blocks = explanation.split(/(```[\s\S]*?```)/g)

    return blocks.map((block, idx) => {
      if (block.startsWith('```') && block.endsWith('```')) {
        const lines = block.slice(3, -3).trim().split('\n')
        const lang = lines[0].match(/^[a-zA-Z0-9_-]+$/) ? lines.shift() : 'bash'
        const code = lines.join('\n')

        return (
          <div key={idx} className="explanation-code-block">
            <div className="code-lang-tag">{lang}</div>
            <pre>
              <code>{code}</code>
            </pre>
          </div>
        )
      }

      return (
        <div key={idx} className="explanation-text-block">
          {block.split('\n\n').map((para, pIdx) => {
            const trimmed = para.trim()
            if (!trimmed) return null

            if (trimmed.startsWith('### ')) {
              return (
                <h3 key={pIdx} className="section-title">
                  {renderFormattedText(trimmed.replace('### ', ''))}
                </h3>
              )
            }
            if (trimmed.startsWith('## ')) {
              return (
                <h2 key={pIdx} className="section-title main">
                  {renderFormattedText(trimmed.replace('## ', ''))}
                </h2>
              )
            }
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
              return (
                <ul key={pIdx} className="bullet-list">
                  {trimmed.split('\n').map((item, iIdx) => (
                    <li key={iIdx}>
                      {renderFormattedText(item.replace(/^[-*]\s+/, ''))}
                    </li>
                  ))}
                </ul>
              )
            }

            return (
              <p key={pIdx} className="prose-paragraph">
                {renderFormattedText(trimmed)}
              </p>
            )
          })}
        </div>
      )
    })
  }, [explanation])

  return (
    <div className="explanation-wrapper">
      {/* Overview summary */}
      <section className="executive-card">
        <div className="executive-header">
          <h3>Overview</h3>
        </div>

        {/* Tech Stack */}
        {techStack.length > 0 && (
          <div className="tech-stack-row">
            <span className="row-label">Technologies:</span>
            <div className="tech-tags">
              {techStack.map((t, idx) => (
                <span key={idx} className="tech-pill">
                  {t.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Key Takeaways */}
        {highlights.length > 0 && (
          <div className="highlights-box">
            <span className="row-label">Summary:</span>
            <ul className="highlight-bullets">
              {highlights.map((h, idx) => (
                <li key={idx}>
                  <span className="bullet-dot">•</span> {renderFormattedText(h)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Main Formatted Explanation */}
      <article className="explanation-body">
        {renderedSections}
      </article>
    </div>
  )
}
