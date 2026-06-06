import { AIConfig } from '../state'

export interface EmbeddingResult {
  embedding: number[]
  error?: string
}

/**
 * Get embedding for a single text using the AI API's embeddings endpoint.
 */
export async function getEmbedding(
  text: string,
  config: AIConfig,
): Promise<EmbeddingResult> {
  if (!config.apiKey || !config.apiUrl || !config.embeddingModelName) {
    return {
      embedding: [],
      error: 'AI configuration is incomplete',
    }
  }

  try {
    const response = await fetch(`${config.apiUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.embeddingModelName,
        input: text,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        embedding: [],
        error: errorData.error?.message || `API error: ${response.statusText}`,
      }
    }

    const data = await response.json()
    const embedding = data.data?.[0]?.embedding

    if (!embedding) {
      return {
        embedding: [],
        error: 'No embedding result',
      }
    }

    return { embedding }
  } catch (error) {
    return {
      embedding: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Send a batch of texts to the embedding API in a single request.
 * OpenAI-compatible APIs accept an array for the `input` field.
 */
async function getBatchEmbedding(
  texts: string[],
  config: AIConfig,
): Promise<{ embeddings: (number[] | null)[]; error?: string }> {
  if (!config.apiKey || !config.apiUrl || !config.embeddingModelName) {
    return {
      embeddings: texts.map(() => null),
      error: 'AI configuration is incomplete',
    }
  }

  try {
    const response = await fetch(`${config.apiUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.embeddingModelName,
        input: texts,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        embeddings: texts.map(() => null),
        error: errorData.error?.message || `API error: ${response.statusText}`,
      }
    }

    const data = await response.json()

    // API returns data array sorted by index field
    const results: (number[] | null)[] = new Array(texts.length).fill(null)
    if (Array.isArray(data.data)) {
      for (const item of data.data) {
        if (item.embedding && typeof item.index === 'number') {
          results[item.index] = item.embedding
        }
      }
    }

    return { embeddings: results }
  } catch (error) {
    return {
      embeddings: texts.map(() => null),
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Batch-embed multiple texts with progress callback.
 * Uses batch API calls (array input) for efficiency, with concurrency control.
 */
export async function batchEmbed(
  texts: string[],
  config: AIConfig,
  onProgress?: (completed: number, total: number) => void,
  concurrency = 2,
  batchSize = 20,
): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = new Array(texts.length).fill(null)
  let completedCount = 0

  // Split texts into batches
  const batches: { texts: string[]; startIndex: number }[] = []
  for (let i = 0; i < texts.length; i += batchSize) {
    batches.push({
      texts: texts.slice(i, i + batchSize),
      startIndex: i,
    })
  }

  console.log(
    `[Embedding] ${texts.length} texts in ${batches.length} batches (batch size: ${batchSize}, concurrency: ${concurrency})`,
  )

  const queue = [...batches]
  const workers: Promise<void>[] = []

  for (let w = 0; w < Math.min(concurrency, batches.length); w++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const batch = queue.shift()
          if (!batch) break

          const result = await getBatchEmbedding(batch.texts, config)

          if (result.error) {
            // Fallback: try single embedding for each text in the batch
            console.warn(
              `[Embedding] Batch failed (${result.error}), falling back to single requests`,
            )
            for (let j = 0; j < batch.texts.length; j++) {
              const single = await getEmbedding(batch.texts[j]!, config)
              if (single.embedding.length > 0) {
                results[batch.startIndex + j] = single.embedding
              }
              completedCount++
              onProgress?.(completedCount, texts.length)
            }
          } else {
            for (let j = 0; j < batch.texts.length; j++) {
              results[batch.startIndex + j] = result.embeddings[j] ?? null
            }
            completedCount += batch.texts.length
            onProgress?.(completedCount, texts.length)
          }
        }
      })(),
    )
  }

  await Promise.all(workers)
  return results
}
