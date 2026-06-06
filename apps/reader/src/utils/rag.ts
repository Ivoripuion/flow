import { v4 as uuidv4 } from 'uuid'

import {
  addKB,
  bulkAddChunks,
  deleteKB,
  getAllKBs,
  getAllEnabledChunks,
  toggleKB,
  renameKB,
} from '../knowledgeBase/db'
import { KnowledgeBase, KBChunk } from '../knowledgeBase/types'
import { AIConfig } from '../state'

import { getEmbedding, batchEmbed } from './embedding'
import { parsePDF, chunkText } from './pdfParser'

export interface IngestProgress {
  phase: 'parsing' | 'embedding'
  current: number
  total: number
  message: string
  errors?: number
}

/**
 * Full ingestion pipeline: parse PDF → chunk → embed → store.
 */
export async function ingestPDF(
  file: File,
  name: string,
  config: AIConfig,
  onProgress?: (progress: IngestProgress) => void,
): Promise<KnowledgeBase> {
  // Phase 1: Parse PDF
  onProgress?.({ phase: 'parsing', current: 0, total: 0, message: '' })
  const pages = await parsePDF(file)
  const chunks = chunkText(pages)
  console.log(
    `[RAG] Chunking complete: ${chunks.length} chunks from ${pages.length} pages`,
  )
  onProgress?.({
    phase: 'parsing',
    current: chunks.length,
    total: chunks.length,
    message: '',
  })

  // Create the KB record
  const kbId = await addKB(name)

  // Phase 2: Embed all chunks concurrently
  const texts = chunks.map((c) => c.text)
  const embeddings = await batchEmbed(texts, config, (completed, total) => {
    onProgress?.({
      phase: 'embedding',
      current: completed,
      total,
      message: '',
    })
  })

  // Collect successful chunks
  const dbChunks: KBChunk[] = []
  let failedCount = 0
  for (let i = 0; i < chunks.length; i++) {
    const emb = embeddings[i]
    if (emb) {
      dbChunks.push({
        id: uuidv4(),
        kbId,
        pageNumber: chunks[i]!.pageNumber,
        text: chunks[i]!.text,
        embedding: new Float32Array(emb),
      })
    } else {
      if (failedCount === 0) {
        console.error('Embedding failed for chunk', i)
      }
      failedCount++
    }
  }

  onProgress?.({
    phase: 'embedding',
    current: chunks.length,
    total: chunks.length,
    message: '',
    errors: failedCount,
  })

  // Phase 3: Bulk insert all chunks at once
  if (dbChunks.length > 0) {
    await bulkAddChunks(dbChunks, kbId)
  } else {
    // All embeddings failed — clean up the empty KB record
    await deleteKB(kbId)
    throw new Error(
      `All ${chunks.length} embeddings failed. Check console for the first error and verify your embedding model config.`,
    )
  }

  return {
    id: kbId,
    name,
    createdAt: Date.now(),
    chunkCount: dbChunks.length,
    enabled: true,
  }
}

/**
 * Cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: Float32Array): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    const va = a[i]!
    const vb = b[i]!
    dotProduct += va * vb
    normA += va * va
    normB += vb * vb
  }

  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

export interface RAGResult {
  text: string
  similarity: number
}

/**
 * Search the knowledge base for chunks relevant to the query.
 * Returns top-k results sorted by similarity.
 */
export async function searchKB(
  query: string,
  config: AIConfig,
  topK = 3,
): Promise<RAGResult[]> {
  const result = await getEmbedding(query, config)
  if (result.error || result.embedding.length === 0) {
    console.log('[RAG] Embedding failed or not configured')
    return []
  }

  const queryEmbedding = result.embedding
  const chunks = await getAllEnabledChunks()

  if (chunks.length === 0) {
    console.log('[RAG] No enabled KB chunks found')
    return []
  }

  // Validate chunks and filter out invalid ones
  const validChunks = chunks.filter((chunk) => {
    if (!chunk.text || typeof chunk.text !== 'string') {
      console.warn('[RAG] Skipping chunk with invalid text:', chunk)
      return false
    }
    if (!chunk.embedding || !(chunk.embedding instanceof Float32Array)) {
      console.warn('[RAG] Skipping chunk with invalid embedding:', chunk)
      return false
    }
    return true
  })

  if (validChunks.length === 0) {
    console.log('[RAG] No valid chunks found after filtering')
    return []
  }

  const scored = validChunks.map((chunk) => ({
    text: chunk.text,
    similarity: cosineSimilarity(queryEmbedding, chunk.embedding),
  }))

  const results = scored
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
    .filter((s) => s.similarity > 0)

  console.log(
    `[RAG] Searched ${validChunks.length} chunks, top ${results.length} results:`,
    results.map((r) => ({
      similarity: r.similarity.toFixed(4),
      preview: r.text.slice(0, 200) + '...',
    })),
  )

  return results
}

/**
 * Build a context string from RAG search results for prompt injection.
 * @param results - RAG search results
 * @param contextLength - max characters per result (default: 1000)
 */
export function buildContext(
  results: RAGResult[],
  contextLength = 1000,
): string {
  if (results.length === 0) return ''
  return results
    .map((r, i) => `[参考资料${i + 1}]\n${r.text.slice(0, contextLength)}`)
    .join('\n\n')
}

// Re-export DB functions and storage management for UI
export { getAllKBs, deleteKB, toggleKB, renameKB }
export {
  initStorage,
  switchToSQLite,
  reconnectFolder,
  usingSQLite,
  getDisplayPath,
} from '../knowledgeBase/db'
