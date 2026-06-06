import { AIConfig } from '../state'

import { translateText } from './translate'

export interface Paragraph {
  element: HTMLElement
  text: string
  translatedText?: string
}

/**
 * Extract paragraphs from the document
 */
export function extractParagraphs(doc: Document): Paragraph[] {
  const paragraphs: Paragraph[] = []
  const body = doc.body

  // Get all text-containing elements (p, div, li, etc.)
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node: Node) => {
      const el = node as HTMLElement
      // Skip if already processed (has translation)
      if (el.dataset.translated === 'true') {
        return NodeFilter.FILTER_REJECT
      }
      // Only process block-level elements with text
      const tagName = el.tagName.toLowerCase()
      if (
        [
          'p',
          'div',
          'li',
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'blockquote',
        ].includes(tagName) &&
        el.textContent?.trim()
      ) {
        return NodeFilter.FILTER_ACCEPT
      }
      return NodeFilter.FILTER_SKIP
    },
  })

  let node: Node | null
  while ((node = walker.nextNode())) {
    const el = node as HTMLElement
    const text = el.textContent?.trim()
    if (text && text.length > 0) {
      paragraphs.push({
        element: el,
        text,
      })
    }
  }

  return paragraphs
}

/**
 * Translate paragraphs and insert translations into the document.
 * Uses concurrent workers for better throughput.
 */
export async function translatePage(
  paragraphs: Paragraph[],
  config: AIConfig,
  onProgress?: (progress: number) => void,
  context?: string,
  concurrency = 3,
): Promise<{ success: number; failed: number }> {
  let success = 0
  let failed = 0
  let completed = 0

  const queue = paragraphs.map((p) => ({ paragraph: p }))
  const workers: Promise<void>[] = []

  for (let w = 0; w < Math.min(concurrency, paragraphs.length); w++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const item = queue.shift()
          if (!item) break

          const { paragraph } = item

          try {
            const result = await translateText(paragraph.text, config, context)

            if (result.error || !result.text) {
              failed++
            } else {
              paragraph.translatedText = result.text
              insertTranslation(paragraph.element, result.text)
              success++
            }
          } catch (error) {
            failed++
            console.error('Translation error:', error)
          }

          completed++
          onProgress?.(completed / paragraphs.length)
        }
      })(),
    )
  }

  await Promise.all(workers)
  return { success, failed }
}

/**
 * Insert translation element after the original paragraph
 */
function insertTranslation(
  originalElement: HTMLElement,
  translatedText: string,
) {
  // Mark original element as translated
  originalElement.dataset.translated = 'true'

  // Create translation container
  const translationContainer =
    originalElement.ownerDocument.createElement('div')
  translationContainer.className = 'ai-translation'
  translationContainer.setAttribute('data-ai-translation', 'true')

  // Use CSS variables for better theme support
  translationContainer.style.cssText = `
    margin-top: 0.5em;
    margin-bottom: 1em;
    padding: 0.75em;
    padding-left: 1em;
    background-color: rgba(128, 128, 128, 0.08);
    border-left: 3px solid rgba(128, 128, 128, 0.2);
    font-style: italic;
    opacity: 0.85;
    transition: opacity 0.2s;
  `

  // Add hover effect
  translationContainer.addEventListener('mouseenter', () => {
    translationContainer.style.opacity = '1'
  })
  translationContainer.addEventListener('mouseleave', () => {
    translationContainer.style.opacity = '0.85'
  })

  // Create translation text element
  const translationText = originalElement.ownerDocument.createElement('p')
  translationText.textContent = translatedText
  translationText.style.cssText = `
    margin: 0;
    line-height: 1.6;
    word-wrap: break-word;
    overflow-wrap: break-word;
  `

  translationContainer.appendChild(translationText)

  // Insert after the original element
  if (originalElement.nextSibling) {
    originalElement.parentNode?.insertBefore(
      translationContainer,
      originalElement.nextSibling,
    )
  } else {
    originalElement.parentNode?.appendChild(translationContainer)
  }
}

/**
 * Remove all translations from the page
 */
export function removeTranslations(doc: Document) {
  const translations = doc.querySelectorAll('.ai-translation')
  translations.forEach((el) => el.remove())

  // Remove translated markers
  const translatedElements = doc.querySelectorAll('[data-translated="true"]')
  translatedElements.forEach((el) => {
    delete (el as HTMLElement).dataset.translated
  })
}
