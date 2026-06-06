export interface PDFPage {
  pageNumber: number
  text: string
}

/**
 * Parse a PDF file and extract text from each page.
 * Dynamically imports pdfjs-dist to avoid bloating the initial bundle.
 */
export async function parsePDF(file: File): Promise<PDFPage[]> {
  const pdfjsLib = await import('pdfjs-dist')

  // Use local worker from public/ to avoid ESM/CDN version mismatch
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const pages: PDFPage[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((item: any) => {
        if ('str' in item) {
          return item.str
        }
        return ''
      })
      .join(' ')

    const cleaned = text.replace(/\s+/g, ' ').trim()
    if (cleaned.length > 0) {
      pages.push({ pageNumber: i, text: cleaned })
    }
  }

  return pages
}

/**
 * Detect if text is a numbered dictionary and split by entries.
 * Entry pattern: "201 低能 (imbecility) 的状态..." or "68 拉康..."
 */
function tryEntryChunking(
  pages: PDFPage[],
): { text: string; pageNumber: number }[] | null {
  const fullText = pages.map((p) => p.text).join(' ')

  // Try patterns: with space "201 低能" or without "201低能"
  const patterns = [
    // With whitespace separator: "201 低能", "68  拉康..."
    /\b(\d{1,4})\s+(?=[\u4e00-\u9fff（(A-Za-z])/g,
    // No separator (PDF text may be concatenated): "201低能"
    /\b(\d{1,4})(?=[\u4e00-\u9fff（(])/g,
  ]

  const allEntries: { number: number; index: number }[] = []

  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(fullText)) !== null) {
      const num = parseInt(match[1]!, 10)
      if (num > 0) allEntries.push({ number: num, index: match.index })
    }
    // If first pattern worked, skip the second
    if (allEntries.length >= 15) break
  }

  // Deduplicate by index (multiple patterns might match same position)
  const seen = new Set<number>()
  const entries = allEntries.filter((e) => {
    if (seen.has(e.index)) return false
    seen.add(e.index)
    return true
  })

  // Show first 5 matches with surrounding text for debugging
  if (allEntries.length > 0) {
    const samples = allEntries.slice(0, 5).map((e) => ({
      number: e.number,
      context: fullText.slice(e.index, e.index + 60).replace(/\s+/g, ' '),
    }))
    console.log('[PDF] First 5 pattern matches:', samples)
  }

  console.log(
    `[PDF] Entry detection: found ${entries.length} candidates (need ≥15)`,
  )

  if (entries.length < 15) return null

  // Verify progression: entry numbers should be mostly sequential
  let increasing = 0
  let decreasing = 0
  for (let i = 1; i < entries.length; i++) {
    if (entries[i]!.number > entries[i - 1]!.number) increasing++
    else decreasing++
  }
  if (increasing < entries.length * 0.7 && decreasing < entries.length * 0.7) {
    console.log(
      `[PDF] Entry numbers not sequential (${increasing} inc, ${decreasing} dec), falling back`,
    )
    return null
  }

  console.log(
    `[PDF] Detected dictionary: ${entries.length} entries (${increasing}↑ ${decreasing}↓)`,
  )

  // Split by entry boundaries (sorted by position)
  const sorted = entries.sort((a, b) => a.index - b.index)
  const chunks: { text: string; pageNumber: number }[] = []
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i]!.index
    const end = sorted[i + 1]?.index ?? fullText.length
    const text = fullText.slice(start, end).trim()

    // Estimate page number from character position
    let pageNumber = 0
    let charCount = 0
    for (const page of pages) {
      charCount += page.text.length
      if (start < charCount) {
        pageNumber = page.pageNumber
        break
      }
    }

    if (text.length >= 20) {
      chunks.push({ text, pageNumber })
    }
  }

  return chunks.length > 0 ? chunks : null
}

/**
 * Split text from pages into overlapping chunks (fallback for non-dictionary texts).
 */
function mechanicalChunk(
  pages: PDFPage[],
  chunkSize: number,
  overlap: number,
): { text: string; pageNumber: number }[] {
  const chunks: { text: string; pageNumber: number }[] = []

  for (const page of pages) {
    if (page.text.length <= chunkSize) {
      chunks.push({ text: page.text, pageNumber: page.pageNumber })
      continue
    }

    const step = chunkSize - overlap
    let start = 0

    while (start < page.text.length) {
      let end = start + chunkSize
      if (end >= page.text.length) {
        chunks.push({
          text: page.text.slice(start),
          pageNumber: page.pageNumber,
        })
        break
      }

      const slice = page.text.slice(start, end + 50)
      const breakMatch = slice.match(/[。！？\n]/)
      if (breakMatch && breakMatch.index! >= chunkSize - 100) {
        end = start + breakMatch.index! + 1
      }

      chunks.push({
        text: page.text.slice(start, end).trim(),
        pageNumber: page.pageNumber,
      })

      start += step
    }
  }

  return chunks
}

/**
 * Split text into chunks for embedding.
 * Automatically detects dictionary entries (numbered format)
 * and falls back to mechanical 800-char chunks for regular books.
 */
export function chunkText(
  pages: PDFPage[],
  chunkSize = 800,
  overlap = 100,
): { text: string; pageNumber: number }[] {
  // Diagnostic: show what we're working with
  const fullText = pages.map((p) => p.text).join(' ')
  console.log(
    `[PDF] Parsed ${pages.length} pages, total ${fullText.length} chars`,
  )
  console.log(`[PDF] Text preview (first 300 chars):`, fullText.slice(0, 300))

  const entryChunks = tryEntryChunking(pages)
  if (entryChunks) {
    console.log(
      `[PDF] ✅ Dictionary entry chunking succeeded: ${entryChunks.length} entries`,
    )
    console.log(`[PDF] Sample entry:`, entryChunks[0]?.text.slice(0, 150))
    return entryChunks
  }
  const mechChunks = mechanicalChunk(pages, chunkSize, overlap)
  console.log(
    `[PDF] ⚠️ Fell back to mechanical chunking: ${mechChunks.length} chunks`,
  )
  return mechChunks
}
