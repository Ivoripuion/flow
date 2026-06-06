import { AIConfig } from '../state'

export interface StreamOptions {
  onChunk: (chunk: string) => void
  signal?: AbortSignal
}

export interface StreamResult {
  text: string
  error?: string
}

/**
 * Call an OpenAI-compatible chat completion API with streaming enabled.
 * Parses SSE `data:` lines and invokes `onChunk` for each token.
 */
export async function streamChatCompletion(
  prompt: string,
  config: AIConfig,
  opts: StreamOptions,
): Promise<StreamResult> {
  if (!config.apiKey || !config.apiUrl || !config.modelName) {
    return { text: '', error: 'AI configuration is incomplete' }
  }

  try {
    const response = await fetch(`${config.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.modelName,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        stream: true,
      }),
      signal: opts.signal,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        text: '',
        error: errorData.error?.message || `API error: ${response.statusText}`,
      }
    }

    if (!response.body) {
      return { text: '', error: 'No response body' }
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let fullText = ''

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Process complete lines
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue

        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') break

        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content
          if (content) {
            fullText += content
            opts.onChunk(content)
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim().startsWith('data:')) {
      const data = buffer.trim().slice(5).trim()
      if (data !== '[DONE]') {
        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content
          if (content) {
            fullText += content
            opts.onChunk(content)
          }
        } catch {
          // ignore
        }
      }
    }

    return { text: fullText.trim() }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { text: '', error: 'Aborted' }
    }
    return {
      text: '',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
