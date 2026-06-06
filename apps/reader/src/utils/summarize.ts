import { AIConfig } from '../state'

import { streamChatCompletion, StreamOptions, StreamResult } from './stream'

export interface SummarizeResult {
  text: string
  error?: string
}

function buildSummarizePrompt(
  text: string,
  config: AIConfig,
  context?: string,
): string {
  const prompt =
    config.summarizePrompt || '请总结以下文本的主要内容，要求简洁明了：'

  if (context) {
    return `参考以下资料：\n${context}\n\n${prompt}\n\n${text}`
  }
  return `${prompt}\n\n${text}`
}

/**
 * Streaming summarization — tokens are delivered incrementally via onChunk.
 */
export async function summarizeTextStream(
  text: string,
  config: AIConfig,
  context: string | undefined,
  opts: StreamOptions,
): Promise<StreamResult> {
  const fullPrompt = buildSummarizePrompt(text, config, context)

  console.log(
    `[Summarize] Stream prompt length: ${fullPrompt.length} chars` +
      (context
        ? ` (context: ${context.length} chars, text: ${text.length} chars)`
        : ''),
  )
  console.log('[Summarize] Full prompt:\n', fullPrompt)

  return streamChatCompletion(fullPrompt, config, opts)
}

export async function summarizeText(
  text: string,
  config: AIConfig,
  context?: string,
): Promise<SummarizeResult> {
  if (!config.apiKey || !config.apiUrl || !config.modelName) {
    return {
      text: '',
      error: 'AI configuration is incomplete',
    }
  }

  const fullPrompt = buildSummarizePrompt(text, config, context)

  console.log(
    `[Summarize] Prompt length: ${fullPrompt.length} chars` +
      (context
        ? ` (context: ${context.length} chars, text: ${text.length} chars)`
        : ''),
  )
  console.log('[Summarize] Full prompt:\n', fullPrompt)

  try {
    const response = await fetch(`${config.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.modelName,
        messages: [
          {
            role: 'user',
            content: fullPrompt,
          },
        ],
        temperature: 0.3,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        text: '',
        error: errorData.error?.message || `API error: ${response.statusText}`,
      }
    }

    const data = await response.json()
    const summarizedText = data.choices?.[0]?.message?.content?.trim() || ''

    if (!summarizedText) {
      return {
        text: '',
        error: 'No summary result',
      }
    }

    return {
      text: summarizedText,
    }
  } catch (error) {
    return {
      text: '',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
