import { AIConfig } from '../state'

import { streamChatCompletion, StreamOptions, StreamResult } from './stream'

export interface TranslateResult {
  text: string
  error?: string
}

function buildTranslatePrompt(
  text: string,
  config: AIConfig,
  context?: string,
): string {
  const prompt =
    config.translatePrompt || '请将以下文本翻译成中文，保持原文的格式和风格：'

  if (context) {
    return `参考以下资料：\n${context}\n\n${prompt}\n\n${text}`
  }
  return `${prompt}\n\n${text}`
}

/**
 * Streaming translation — tokens are delivered incrementally via onChunk.
 */
export async function translateTextStream(
  text: string,
  config: AIConfig,
  context: string | undefined,
  opts: StreamOptions,
): Promise<StreamResult> {
  const fullPrompt = buildTranslatePrompt(text, config, context)

  console.log(
    `[Translate] Stream prompt length: ${fullPrompt.length} chars` +
      (context
        ? ` (context: ${context.length} chars, text: ${text.length} chars)`
        : ''),
  )
  console.log('[Translate] Full prompt:\n', fullPrompt)

  return streamChatCompletion(fullPrompt, config, opts)
}

export async function translateText(
  text: string,
  config: AIConfig,
  context?: string,
): Promise<TranslateResult> {
  if (!config.apiKey || !config.apiUrl || !config.modelName) {
    return {
      text: '',
      error: 'AI configuration is incomplete',
    }
  }

  const fullPrompt = buildTranslatePrompt(text, config, context)

  console.log(
    `[Translate] Prompt length: ${fullPrompt.length} chars` +
      (context
        ? ` (context: ${context.length} chars, text: ${text.length} chars)`
        : ''),
  )
  console.log('[Translate] Full prompt:\n', fullPrompt)

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
    const translatedText = data.choices?.[0]?.message?.content?.trim() || ''

    if (!translatedText) {
      return {
        text: '',
        error: 'No translation result',
      }
    }

    return {
      text: translatedText,
    }
  } catch (error) {
    return {
      text: '',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
