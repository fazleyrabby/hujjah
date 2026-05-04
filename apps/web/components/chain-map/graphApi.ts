/**
 * Graph API - fetches neighbors for lazy-loading infinite canvas
 */
import type { NarratorNode, NarratorEdge } from '@hujjah/ui';

export interface GraphNeighborResponse {
  nodes: NarratorNode[];
  edges: NarratorEdge[];
}

export async function fetchNeighbors(
  nodeId: number,
  depth: number = 1,
  limit: number = 20,
): Promise<GraphNeighborResponse> {
  const res = await fetch(
    `/api/chain?action=neighbors&id=${nodeId}&depth=${depth}&limit=${limit}`,
  );
  if (!res.ok) throw new Error(`Failed to fetch neighbors for ${nodeId}`);
  return res.json();
}

export async function searchNarrators(
  query: string,
  limit: number = 20,
): Promise<NarratorNode[]> {
  const res = await fetch(
    `/api/chain?action=search&q=${encodeURIComponent(query)}&limit=${limit}`,
  );
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}
