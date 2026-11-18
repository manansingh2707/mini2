import { useState, useRef, useEffect } from 'react'
import { renderFormattedText } from '../utils/formatText'

const SUGGESTED_QUESTIONS = [
  'How do I run this locally?',
  'What problem does this project solve?',
  'Explain the system architecture.',
  'What are the core dependencies?',
]

export default function Chatbot({ repoMeta, techStack, explanation, architecture }) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hello. I can answer questions about the **${repoMeta?.fullName || 'this repository'}** codebase.

You can ask about local setup, architectural design, specific components, or dependencies.`,
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const chatEndRef = useRef(null)

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading])

  const handleSend = async (queryText) => {
    const textToSend = (queryText || input).trim()
    if (!textToSend || loading) return

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend,
    }

    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
          repoContext: {
            name: repoMeta?.fullName || 'repo',
            repo: repoMeta?.repo,
            description: repoMeta?.description,
            techStack,
            language: repoMeta?.language,
            htmlUrl: repoMeta?.htmlUrl,
            readmeSnippet: explanation?.slice(0, 4000) || '',
            highlights: repoMeta?.highlights || [],
            architecture: architecture || {},
          },
        }),
      })

      if (!res.ok) {
        throw new Error(`Chat error (${res.status})`)
      }

      const data = await res.json()
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          role: 'assistant',
          content: data.message || 'No response generated.',
        },
      ])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `Unable to get response: ${err.message}. Please check your connection.`,
          isError: true,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClear = () => {
    setMessages([
      {
        id: 'welcome-reset',
        role: 'assistant',
        content: `Chat cleared. Ask anything about **${repoMeta?.fullName || 'this repository'}**.`,
      },
    ])
  }

  const renderMessageContent = (content) => {
    const parts = content.split(/(```[\s\S]*?```)/g)

    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const lines = part.slice(3, -3).trim().split('\n')
        const language = lines[0].match(/^[a-zA-Z0-9_-]+$/) ? lines.shift() : 'code'
        const codeText = lines.join('\n')

        return (
          <div key={index} className="chat-code-wrapper">
            <div className="chat-code-header">
              <span className="code-lang">{language}</span>
            </div>
            <pre className="chat-code-block">
              <code>{codeText}</code>
            </pre>
          </div>
        )
      }

      return (
        <div key={index} className="chat-prose">
          {part.split('\n\n').map((para, pIdx) => {
            const trimmed = para.trim()
            if (!trimmed) return null
            if (trimmed.startsWith('### ')) {
              return (
                <h4 key={pIdx} className="chat-heading">
                  {renderFormattedText(trimmed.replace('### ', ''))}
                </h4>
              )
            }
            if (trimmed.startsWith('## ')) {
              return (
                <h3 key={pIdx} className="chat-heading">
                  {renderFormattedText(trimmed.replace('## ', ''))}
                </h3>
              )
            }
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
              return (
                <ul key={pIdx} className="chat-list">
                  {trimmed.split('\n').map((item, iIdx) => (
                    <li key={iIdx}>
                      {renderFormattedText(item.replace(/^[-*]\s+/, ''))}
                    </li>
                  ))}
                </ul>
              )
            }
            return (
              <p key={pIdx}>
                {renderFormattedText(trimmed)}
              </p>
            )
          })}
        </div>
      )
    })
  }

  return (
    <div className="chatbot-container">
      {/* Header bar */}
      <div className="chat-header">
        <div className="chat-meta">
          <span className="chat-title">Repository Q&A</span>
          <span className="chat-sub">{repoMeta?.fullName || 'Active Repository'}</span>
        </div>
        <button type="button" className="btn-tool text-muted" onClick={handleClear}>
          Clear
        </button>
      </div>

      {/* Suggested prompts */}
      <div className="suggested-prompts">
        <span className="prompt-label">Suggested:</span>
        <div className="prompt-chips">
          {SUGGESTED_QUESTIONS.map((q, idx) => (
            <button
              key={idx}
              type="button"
              className="chip-btn"
              onClick={() => handleSend(q)}
              disabled={loading}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Messages thread */}
      <div className="chat-messages" role="log" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={`chat-message ${m.role} ${m.isError ? 'error-bubble' : ''}`}>
            <div className="message-label">
              {m.role === 'user' ? 'You' : 'Assistant'}
            </div>
            <div className="message-content">
              {renderMessageContent(m.content)}
            </div>
          </div>
        ))}

        {loading && (
          <div className="chat-message assistant">
            <div className="message-label">Assistant</div>
            <div className="message-content typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          handleSend()
        }}
        className="chat-input-form"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question about this repository..."
          disabled={loading}
        />
        <button
          type="submit"
          className="btn-chat-send"
          disabled={loading || !input.trim()}
        >
          {loading ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  )
}
