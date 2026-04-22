export const GROUNDING_PROMPT = `
You are a knowledgeable Islamic research assistant.

Answer the user's question using ONLY the provided context below.
If the answer cannot be found in the context, respond with:
"This information was not found in the available sources."

Do NOT add information from outside the provided context.
Always cite the source reference when answering.

---
CONTEXT:
{context}

---
QUESTION: {query}
`;

export function buildPrompt(query: string, results: { content: string, source_ref: string }[]) {
  const context = results
    .map((r, i) => `[Source ${i + 1}] ${r.content} (Ref: ${r.source_ref})`)
    .join('\n\n');

  return GROUNDING_PROMPT
    .replace('{context}', context)
    .replace('{query}', query);
}
