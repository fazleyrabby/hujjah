'use client';

import React, { useMemo, useState, useCallback } from 'react';
import type { NarratorNode, NarratorEdge } from './types';
import { clsx } from 'clsx';

/* ─── Types ─── */
interface AdjacencyMaps {
  parents: Map<number, number[]>;
  children: Map<number, number[]>;
}

interface RadialSanadProps {
  nodes: NarratorNode[];
  edges: NarratorEdge[];
  centerId: number;
  darkMode?: boolean;
  lang?: 'en' | 'bn' | 'ar';
  onNodeClick?: (node: NarratorNode) => void;
}

interface NodePosition {
  id: number;
  x: number;
  y: number;
  depth: number;
  node: NarratorNode;
}

interface EdgeLine {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  fromId: number;
  toId: number;
}

const MAX_PER_LAYER = 40;
const LAYER_RADIUS = 120;
const CENTER_SIZE = 10;
const NODE_SIZE = 6;

/* ─── Colors by depth ─── */
const LAYER_COLORS = [
  '#f43f5e', // depth 0 — rose
  '#f59e0b', // depth 1 — amber
  '#10b981', // depth 2 — emerald
  '#06b6d4', // depth 3 — cyan
  '#8b5cf6', // depth 4 — violet
  '#ec4899', // depth 5 — pink
];

function getLayerColor(depth: number): string {
  return LAYER_COLORS[depth % LAYER_COLORS.length];
}

/* ─── Utility ─── */
function buildAdjacency(edgeList: NarratorEdge[]): AdjacencyMaps {
  const parents = new Map<number, number[]>();
  const children = new Map<number, number[]>();
  for (const e of edgeList) {
    const student = Number(e.from_narrator_id);
    const teacher = Number(e.to_narrator_id);
    if (student === teacher) continue;
    if (!parents.has(student)) parents.set(student, []);
    parents.get(student)!.push(teacher);
    if (!children.has(teacher)) children.set(teacher, []);
    children.get(teacher)!.push(student);
  }
  for (const [k, v] of parents) parents.set(k, [...new Set(v)]);
  for (const [k, v] of children) children.set(k, [...new Set(v)]);
  return { parents, children };
}

/* ─── BFS Layering ─── */
function buildLayers(centerId: number, adj: AdjacencyMaps): number[][] {
  const layers: number[][] = [[centerId]];
  const visited = new Set<number>([centerId]);

  let current = [centerId];
  let depth = 0;

  while (current.length > 0 && depth < 5) {
    depth++;
    const next: number[] = [];
    const seen = new Set<number>();

    for (const id of current) {
      const neighbors = [...(adj.parents.get(id) || []), ...(adj.children.get(id) || [])];
      for (const nid of neighbors) {
        if (!visited.has(nid) && !seen.has(nid)) {
          seen.add(nid);
          visited.add(nid);
          next.push(nid);
        }
      }
    }

    if (next.length === 0) break;
    layers.push(next.slice(0, MAX_PER_LAYER));
    current = next.slice(0, MAX_PER_LAYER);
  }

  return layers;
}

/* ─── Calculate Positions ─── */
function calculatePositions(
  layers: number[][],
  nodeMap: Map<number, NarratorNode>,
  centerX: number,
  centerY: number
): Map<number, NodePosition> {
  const positions = new Map<number, NodePosition>();

  for (let depth = 0; depth < layers.length; depth++) {
    const layerNodes = layers[depth];
    const radius = depth * LAYER_RADIUS;
    const angleStep = (2 * Math.PI) / Math.max(layerNodes.length, 1);

    for (let i = 0; i < layerNodes.length; i++) {
      const id = layerNodes[i];
      const angle = i * angleStep - Math.PI / 2; // start from top
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      positions.set(id, {
        id,
        x,
        y,
        depth,
        node: nodeMap.get(id)!,
      });
    }
  }

  return positions;
}

/* ─── Build Edges ─── */
function buildEdges(
  edgeList: NarratorEdge[],
  positions: Map<number, NodePosition>
): EdgeLine[] {
  const lines: EdgeLine[] = [];
  const seen = new Set<string>();

  for (const e of edgeList) {
    const from = Number(e.from_narrator_id);
    const to = Number(e.to_narrator_id);
    if (from === to) continue;

    const p1 = positions.get(from);
    const p2 = positions.get(to);
    if (!p1 || !p2) continue;

    const key = `${from}-${to}`;
    if (seen.has(key)) continue;
    seen.add(key);

    lines.push({
      key,
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      fromId: from,
      toId: to,
    });
  }

  return lines;
}

/* ─── Quadratic Curve Path ─── */
function quadraticPath(x1: number, y1: number, x2: number, y2: number): string {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  // Control point pulled toward center for curved effect
  const controlX = midX * 0.3;
  const controlY = midY * 0.3;
  return `M ${x1},${y1} Q ${controlX},${controlY} ${x2},${y2}`;
}

/* ─── Main Component ─── */
export default function RadialSanad({
  nodes,
  edges,
  centerId,
  darkMode = true,
  lang = 'en',
  onNodeClick,
}: RadialSanadProps) {
  const [hoveredNode, setHoveredNode] = useState<number | null>(null);

  const { nodeMap, positions, edgeLines, maxDepth } = useMemo(() => {
    const adj = buildAdjacency(edges);
    const nodeMap = new Map<number, NarratorNode>();
    for (const n of nodes) nodeMap.set(Number(n.id), n);

    const layers = buildLayers(centerId, adj);
    const maxDepth = layers.length - 1;
    const maxRadius = maxDepth * LAYER_RADIUS;
    const centerX = maxRadius + 100;
    const centerY = maxRadius + 100;

    const positions = calculatePositions(layers, nodeMap, centerX, centerY);
    const edgeLines = buildEdges(edges, positions);

    return { nodeMap, positions, edgeLines, maxDepth };
  }, [nodes, edges, centerId]);

  const handleNodeClick = useCallback(
    (node: NarratorNode) => {
      onNodeClick?.(node);
    },
    [onNodeClick]
  );

  if (positions.size === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
        No chain data
      </div>
    );
  }

  const maxRadius = maxDepth * LAYER_RADIUS;
  const viewBoxSize = (maxRadius + 100) * 2;

  return (
    <div className="w-full overflow-auto flex items-center justify-center p-4">
      <svg
        width={viewBoxSize}
        height={viewBoxSize}
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        className={clsx('rounded-2xl border', darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-gray-50 border-gray-200')}
      >
        {/* Layer guide circles */}
        {Array.from({ length: maxDepth + 1 }, (_, i) => i * LAYER_RADIUS).map(
          (radius, i) =>
            radius > 0 && (
              <circle
                key={`guide-${i}`}
                cx={maxRadius + 100}
                cy={maxRadius + 100}
                r={radius}
                fill="none"
                stroke={darkMode ? '#27272a' : '#e5e7eb'}
                strokeWidth={1}
                strokeDasharray="4 4"
                opacity={0.5}
              />
            )
        )}

        {/* Edges */}
        {edgeLines.map(line => {
          const isConnectedToHover =
            hoveredNode !== null &&
            (line.fromId === hoveredNode || line.toId === hoveredNode);
          const isFaded = hoveredNode !== null && !isConnectedToHover;

          return (
            <path
              key={line.key}
              d={quadraticPath(line.x1, line.y1, line.x2, line.y2)}
              stroke={isConnectedToHover ? '#fbbf24' : darkMode ? '#52525b' : '#9ca3af'}
              strokeWidth={isConnectedToHover ? 2 : 0.8}
              fill="none"
              opacity={isFaded ? 0.1 : isConnectedToHover ? 1 : 0.4}
              className="transition-all duration-200"
            />
          );
        })}

        {/* Nodes */}
        {Array.from(positions.values()).map(pos => {
          const isCenter = pos.id === centerId;
          const isHovered = hoveredNode === pos.id;
          const color = getLayerColor(pos.depth);
          const name = pos.node.name_ar;
          const subname =
            lang === 'bn'
              ? (pos.node.name_bn ?? pos.node.name_en)
              : (pos.node.name_en ?? pos.node.name_bn);

          return (
            <g
              key={pos.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredNode(pos.id)}
              onMouseLeave={() => setHoveredNode(null)}
              onClick={() => handleNodeClick(pos.node)}
            >
              {/* Glow for hovered */}
              {isHovered && (
                <circle
                  r={isCenter ? CENTER_SIZE + 6 : NODE_SIZE + 6}
                  fill={color}
                  opacity={0.2}
                  className="animate-pulse"
                />
              )}

              {/* Main node circle */}
              <circle
                r={isCenter ? CENTER_SIZE : NODE_SIZE}
                fill={isCenter ? '#14b8a6' : color}
                stroke={darkMode ? '#18181b' : '#ffffff'}
                strokeWidth={2}
                className="transition-all duration-200"
              />

              {/* Label */}
              <text
                y={isCenter ? CENTER_SIZE + 16 : NODE_SIZE + 12}
                textAnchor="middle"
                className={clsx(
                  'text-[10px] font-medium select-none pointer-events-none',
                  darkMode ? 'fill-gray-300' : 'fill-gray-700'
                )}
              >
                {name}
              </text>

              {/* Sub-label */}
              {subname && (
                <text
                  y={isCenter ? CENTER_SIZE + 28 : NODE_SIZE + 22}
                  textAnchor="middle"
                  className={clsx(
                    'text-[8px] select-none pointer-events-none',
                    darkMode ? 'fill-gray-500' : 'fill-gray-400'
                  )}
                >
                  {subname}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
