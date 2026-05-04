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

function edgeKey(from: number, to: number) { return `${from}-${to}`; }

function layoutNodesRadial(
  existingNodes: Map<number, GraphNode>,
  newNodes: NarratorNode[],
  centerId: number,
  centerX: number,
  centerY: number,
): Map<number, GraphNode> {
  const result = new Map(existingNodes);

  // Ensure center exists with position
  const existingCenter = result.get(centerId);
  if (!existingCenter) {
    // First load - add center node
    const centerNode = newNodes.find(n => n.id === centerId);
    if (centerNode) {
      result.set(centerId, { ...centerNode, x: centerX, y: centerY });
    }
  } else if (existingCenter.x === undefined) {
    // Center exists but no position - update it
    result.set(centerId, { ...existingCenter, x: centerX, y: centerY });
  }

  // Get neighbors that need positioning
  const toLayout = newNodes.filter(n => n.id !== centerId && !result.has(n.id));
  if (toLayout.length === 0) return result;

  // Position neighbors radially around center
  const radius = Math.max(180, toLayout.length * 40);
  const angleStep = (2 * Math.PI) / Math.max(toLayout.length, 1);

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
      let nodes = layoutNodesRadial(prev.nodes, data.nodes, centerId, centerX, centerY);
      let edges = new Map(prev.edges);

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
    if (fetchControllerRef.current) {
      fetchControllerRef.current.abort();
    }
    const controller = new AbortController();
    fetchControllerRef.current = controller;

    setLoadingNodeIds(prev => new Set([...prev, nodeId]));

    try {
      const data = await fetchNeighbors(nodeId, depth, NEIGHBOR_LIMIT);
      if (controller.signal.aborted) return;

      // Get current center position from state
      const currentCenter = state.nodes.get(nodeId);
      const posX = currentCenter?.x ?? centerX;
      const posY = currentCenter?.y ?? centerY;

      mergeData(data, nodeId, posX, posY);

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
      setLoading(false);
    }
  }, [mergeData, state.nodes]);

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
    // Initialize with center node at position
    const initialNodes = new Map<number, GraphNode>();
    initialNodes.set(centerNode.id, { ...centerNode, x: centerX, y: centerY });

    const initialEdges = new Map<string, GraphEdge>();

    setState({
      nodes: initialNodes,
      edges: initialEdges,
      expandedNodes: new Set(),
      hoveredNodeId: null,
      focusedNodeId: centerNode.id,
    });

    // Merge in neighbors data
    if (data.nodes.length > 0 || data.edges.length > 0) {
      mergeData(data, centerNode.id, centerX, centerY);
    }
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
  };
}
