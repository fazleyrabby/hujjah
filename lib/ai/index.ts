/**
 * lib/ai/index.ts
 *
 * Public API for the AI layer.
 */

export { embed, embedOne, cosineSimilarity, terminateEmbeddingWorker } from './embedding';
export { retrieveRelevantVerses, retrieveHybrid } from './retrieve';
export { explainVerse, explainQuery } from './explain';
export type { EmbeddingVector } from './embedding';
export type { RetrievedVerse } from './retrieve';
export type { VerseContext } from './explain';
