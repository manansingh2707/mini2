// src/utils/formatText.jsx
import React from 'react'

export function renderFormattedText(text) {
  if (!text) return null
  if (typeof text !== 'string') return text

  // Split on **bold text** and `inline code`
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)

  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={idx} style={{ fontWeight: 600 }}>
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code key={idx} className="inline-code">
          {part.slice(1, -1)}
        </code>
      )
    }
    // Remove any leftover double asterisks from plain segments
    const cleanSegment = part.replace(/\*\*/g, '')
    return cleanSegment
  })
}
