'use client';

import { useState, useCallback, useRef } from 'react';
import type { NarratorNode, NarratorEdge } from '@hujjah/ui';
import { fetchNeighbors, searchNarrators, type GraphNeighborResponse } from './graphApi';

export interface GraphNode extends NarratorNode {
  x?: number;
  y?: number;
}

export interface GraphEdge extends NarratorEdge {
  source: number;
  target: number;
}

interface GraphStoreState {
  nodes: Map<number, GraphNode>;
  edges: Map<string, GraphEdge>;
  expandedNodes: Set<number>;
  hoveredNodeId: number | null;
  focusedNodeId: number | null;
}

const MAX_NODES = 400;
const NEIGHBOR_LIMIT = 15;

function nodeKey(id: number) { return id; }
function edgeKey(from: number, to: number) { return `${from}-${to}`; }

function normalizeArabicQuery(text: string): string {
  return text
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}

function layoutNodesRadial(
  existingNodes: Map<number, GraphNode>,
  newNodes: NarratorNode[],
  centerId: number,
  centerX: number,
  centerY: number,
): Map<number, GraphNode> {
  const result = new Map(existingNodes);
  
  // Find existing center position
  const center = result.get(centerId);
  if (!center) {
    // First node - set as center
    const firstNode = newNodes[0];
    if (firstNode) {
      result.set(firstNode.id, { ...firstNode, x: centerX, y: centerY });
    }
    return result;
  }

  // Get neighbors that need layout (not yet positioned)
  const toLayout = newNodes.filter(n => !result.has(n.id));
  if (toLayout.length === 0) return result;

  // Determine positions based on existing graph structure
  const angleStep = (2 * Math.PI) / Math.max(toLayout.length, 6);
  const radius = Math.max(150, toLayout.length * 50);
  
  toLayout.forEach((node, i) => {
    const angle = angleStep * i - Math.PI / 2;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    result.set(node.id, { ...node, x, y });
  });

  return result;
}

export function useGraphStore() {
  const [state, setState] = useState<GraphStoreState>({
    nodes: new Map(),
    edges: new Map(),
    expandedNodes: new Set(),
    hoveredNodeId: null,
    focusedNodeId: null,
  });
  const [loading, setLoading] = useState(false);
  const [loadingNodeIds, setLoadingNodeIds] = useState<Set<number>>(new Set());
  const fetchControllerRef = useRef<AbortController | null>(null);

  const mergeData = useCallback((
    data: GraphNeighborResponse,
    centerId: number,
    centerX: number = 0,
    centerY: number = 0,
  ) => {
    setState(prev => {
      let nodes = new Map(prev.nodes);
      let edges = new Map(prev.edges);

      // Layout new nodes radially around center
      nodes = layoutNodesRadial(nodes, data.nodes, centerId, centerX, centerY);

      // Add edges (deduplicated)
      for (const e of data.edges) {
        const key = edgeKey(e.from_narrator_id, e.to_narrator_id);
        if (!edges.has(key)) {
          edges.set(key, {
            ...e,
            source: e.from_narrator_id,
            target: e.to_narrator_id,
          });
        }
      }

      // Trim if over limit
      if (nodes.size > MAX_NODES) {
        const entries = Array.from(nodes.entries());
        // Keep expanded nodes and focused, remove oldest
        const toRemove = entries
          .filter(([id]) => id !== prev.focusedNodeId && !prev.expandedNodes.has(id))
          .slice(0, nodes.size - MAX_NODES);
        for (const [id] of toRemove) {
          nodes.delete(id);
        }
        // Also remove orphaned edges
        for (const [key, edge] of edges) {
          if (!nodes.has(edge.source) || !nodes.has(edge.target)) {
            edges.delete(key);
          }
        }
      }

      return { ...prev, nodes, edges };
    });
  }, []);

  const loadNeighbors = useCallback(async (
    nodeId: number,
    centerX: number = 0,
    centerY: number = 0,
    depth: number = 1,
  ) => {
    // Cancel any in-flight request
    if (fetchControllerRef.current) {
      fetchControllerRef.current.abort();
    }
    const controller = new AbortController();
    fetchControllerRef.current = controller;

    setLoadingNodeIds(prev => new Set([...prev, nodeId]));
    setLoading(true);

    try {
      const data = await fetchNeighbors(nodeId, depth, NEIGHBOR_LIMIT);
      if (controller.signal.aborted) return;
      
      mergeData(data, nodeId, centerX, centerY);

      setState(prev => ({
        ...prev,
        expandedNodes: new Set([...prev.expandedNodes, nodeId]),
      }));
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('Failed to load neighbors:', err);
    } finally {
      setLoadingNodeIds(prev => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
      setLoading(prev => !!(Array.from(state.nodes.keys()).length));
      // Keep loading false properly
      setLoading(false);
    }
  }, [mergeData]);

  const setHoveredNode = useCallback((id: number | null) => {
    setState(prev => ({ ...prev, hoveredNodeId: id }));
  }, []);

  const setFocusedNode = useCallback((id: number | null) => {
    setState(prev => ({ ...prev, focusedNodeId: id }));
  }, []);

  const initGraph = useCallback((
    centerNode: NarratorNode,
    data: GraphNeighborResponse,
    centerX: number = 0,
    centerY: number = 0,
  ) => {
    setState({
      nodes: new Map([[centerNode.id, { ...centerNode, x: centerX, y: centerY }]]),
      edges: new Map(),
      expandedNodes: new Set(),
      hoveredNodeId: null,
      focusedNodeId: centerNode.id,
    });
    mergeData(data, centerNode.id, centerX, centerY);
  }, [mergeData]);

  const clearGraph = useCallback(() => {
    setState({
      nodes: new Map(),
      edges: new Map(),
      expandedNodes: new Set(),
      hoveredNodeId: null,
      focusedNodeId: null,
    });
  }, []);

  const searchToId = useCallback(async (query: string): Promise<NarratorNode | null> => {
    const results = await searchNarrators(query, 1);
    return results[0] ?? null;
  }, []);

  return {
    nodes: state.nodes,
    edges: state.edges,
    loading,
    loadingNodeIds,
    hoveredNodeId: state.hoveredNodeId,
    focusedNodeId: state.focusedNodeId,
    expandedNodes: state.expandedNodes,
    loadNeighbors,
    setHoveredNode,
    setFocusedNode,
    initGraph,
    clearGraph,
    searchToId,
  };
}
