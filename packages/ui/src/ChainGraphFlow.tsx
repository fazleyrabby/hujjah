'use client';

import React, { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  MarkerType,
  BackgroundVariant,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { clsx } from 'clsx';
import type { NarratorNode, NarratorEdge } from './types';

const TABAQAH_LABELS: Record<number, string> = {
  1: 'Sahaba',
  2: "Tabi'un",
  3: "Tabi' al-Tabi'in",
  4: 'Later Scholar',
};

/* ─── Name normalization ─── */
function normalizeName(name: string): string {
  if (!name) return '';
  return name
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '') // remove diacritics
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/abu\s+/i, '')
    .replace(/abi\s+/i, '')
    .trim()
    .toLowerCase();
}

/* ─── Merge duplicate narrators (canonicalization) ─── */
function mergeDuplicateNarrators(nodes: NarratorNode[]) {
  const groups = new Map<string, NarratorNode[]>();
  for (const n of nodes) {
    const key = normalizeName(n.name_ar || '');
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(n);
  }

  const mergedNodes: NarratorNode[] = [];
  const idMap = new Map<number, number>(); // old id → canonical id
  const mergedCountMap = new Map<number, number>(); // canonical id → how many were merged

  for (const [, group] of groups) {
    // Canonical: prefer richer data
    const canonical = group.reduce((best, n) => {
      if (!best) return n;
      if (n.reliability && !best.reliability) return n;
      if (n.name_en && !best.name_en) return n;
      if (n.tabaqah && !best.tabaqah) return n;
      return best;
    }, null as NarratorNode | null)!;

    mergedNodes.push({ ...canonical });
    mergedCountMap.set(Number(canonical.id), group.length);

    for (const g of group) {
      if (Number(g.id) !== Number(canonical.id)) {
        idMap.set(Number(g.id), Number(canonical.id));
      }
    }
  }

  return { mergedNodes, idMap, mergedCountMap };
}

/* ─── Rebuild edges with remapped canonical IDs ─── */
function rebuildEdges(edges: NarratorEdge[], idMap: Map<number, number>) {
  const seen = new Set<string>();
  const cleaned: NarratorEdge[] = [];

  for (const e of edges) {
    let from = Number(e.from_narrator_id);
    let to = Number(e.to_narrator_id);

    // Follow ID chain to canonical
    while (idMap.has(from)) from = idMap.get(from)!;
    while (idMap.has(to)) to = idMap.get(to)!;

    if (from === to) continue; // self-loop

    const key = `${from}->${to}`;
    if (seen.has(key)) continue;
    seen.add(key);

    cleaned.push({ ...e, from_narrator_id: from, to_narrator_id: to });
  }

  return cleaned;
}

/* ─── Adjacency helpers ─── */
function buildAdjacency(edges: NarratorEdge[]) {
  const parents = new Map<number, number[]>();
  const children = new Map<number, number[]>();
  for (const e of edges) {
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

/* ─── Narrator Node Component ─── */
function NarratorNodeComponent({ data }: NodeProps & {
  data: {
    narrator: NarratorNode;
    isCenter: boolean;
    darkMode: boolean;
    lang: 'en' | 'bn' | 'ar';
    totalParents: number;
    totalChildren: number;
    mergedCount: number;
  };
}) {
  const { narrator, isCenter, isSelected, isHovered, darkMode: dm, lang: lng, totalParents, totalChildren, mergedCount } = data;
  const name = narrator.name_ar;
  const subname = lng === 'bn'
    ? (narrator.name_bn ?? narrator.name_en)
    : (narrator.name_en ?? narrator.name_bn);
  const rel = narrator.reliability || (narrator.tabaqah === 1 ? 'thiqah' : null);
  const relColor =
    rel === 'thiqah' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
    : rel === 'saduq' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
    : rel === 'daif' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
    : rel === 'mawdu' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
    : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-gray-500';

  const isHighlighted = isSelected || isHovered;

  return (
    <div className="relative">
      {/* Parent handle (top) — teacher connection */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-amber-400 !border-2 !border-white dark:!border-zinc-900"
      />

      <div
        className={clsx(
          'px-3 py-2 rounded-xl border transition-all flex flex-col items-center min-w-[80px] max-w-[130px]',
          isCenter
            ? 'bg-teal-500 text-white font-semibold shadow-lg ring-2 ring-teal-400 scale-105'
            : isHighlighted
              ? 'ring-2 ring-amber-400 shadow-md scale-[1.03] bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 border-amber-300 dark:border-amber-600'
              : dm
                ? 'bg-zinc-800 text-gray-100 border-zinc-700 hover:ring-2 hover:ring-amber-400'
                : 'bg-white text-gray-900 border-gray-200 hover:ring-2 hover:ring-amber-400',
        )}
      >
        <span dir="rtl" className={isCenter ? 'font-bold text-sm' : 'text-[11px]'}>{name}</span>
        {subname && (
          <span className={clsx('text-[8px] opacity-75', isCenter ? 'text-white/80' : dm ? 'text-gray-400' : 'text-gray-500')}>
            {subname}
          </span>
        )}
        <span className={clsx('text-[8px] mt-1 font-medium', dm ? 'text-gray-100' : 'text-gray-500')}>
          {totalParents > 0 && `${totalParents}T`}
          {totalParents > 0 && totalChildren > 0 && ' · '}
          {totalChildren > 0 && `${totalChildren}S`}
        </span>
        {narrator.tabaqah && TABAQAH_LABELS[narrator.tabaqah] && (
          <span className={clsx('text-[8px] px-1 py-0.5 rounded-full mt-0.5 font-medium',
            narrator.tabaqah === 1
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
              : 'bg-gray-100 text-gray-600 dark:bg-zinc-700 dark:text-gray-300'
          )}>
            {TABAQAH_LABELS[narrator.tabaqah]}
          </span>
        )}
        {rel && (
          <span className={clsx('text-[8px] px-1 py-0.5 rounded-full mt-1 font-medium', relColor)}>
            {rel}
          </span>
        )}
        {narrator.data_source === 'computed' && (
          <span className="text-[7px] px-1 py-0.5 rounded mt-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">
            name only
          </span>
        )}
        {mergedCount > 1 && (
          <span className="text-[7px] px-1 py-0.5 rounded mt-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 font-medium">
            merged ({mergedCount})
          </span>
        )}
      </div>

      {/* Child handle (bottom) — student connection */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-teal-400 !border-2 !border-white dark:!border-zinc-900"
      />
    </div>
  );
}

/* ─── Main Component ─── */
interface ChainGraphFlowProps {
  nodes: NarratorNode[];
  edges: NarratorEdge[];
  centerId: number;
  darkMode: boolean;
  lang: 'en' | 'bn' | 'ar';
  onNodeClick: (node: NarratorNode) => void;
}

const BASE_LIMIT = 5;

export default function ChainGraphFlow({
  nodes: rawNodes,
  edges: rawEdges,
  centerId,
  darkMode,
  lang,
  onNodeClick,
}: ChainGraphFlowProps) {
  // Canonicalize: merge duplicate narrators before rendering
  const { mergedNodes, idMap, mergedCountMap } = useMemo(() => mergeDuplicateNarrators(rawNodes), [rawNodes]);

  // Remap centerId to canonical if it was merged
  const canonicalCenterId = useMemo(() => {
    let id = Number(centerId);
    while (idMap.has(id)) id = idMap.get(id)!;
    return id;
  }, [centerId, idMap]);

  // Rebuild edges with remapped canonical IDs
  const cleanedEdges = useMemo(() => rebuildEdges(rawEdges, idMap), [rawEdges, idMap]);

  const nodeMap = useMemo(() => {
    const m = new Map<number, NarratorNode>();
    for (const n of mergedNodes) m.set(Number(n.id), n);
    return m;
  }, [mergedNodes]);

  const { parents, children } = useMemo(() => buildAdjacency(cleanedEdges), [cleanedEdges]);

  const centerNode = nodeMap.get(canonicalCenterId);
  const centerTotalParents = (parents.get(canonicalCenterId) || []).length;
  const centerTotalChildren = (children.get(canonicalCenterId) || []).length;

  /* ─── Build initial React Flow nodes/edges ─── */
  const { initialNodes, initialEdges } = useMemo(() => {
    const cf: Node[] = [];
    const ef: Edge[] = [];

    // Use BFS to get visible nodes up/down from center (depth 1)
    const maxDepth = 1;
    const visible = new Set<number>();

    // Collect parents (teachers)
    {
      const visited = new Set<number>([canonicalCenterId]);
      let current = [canonicalCenterId];
      for (let d = 0; d < maxDepth; d++) {
        const next: number[] = [];
        for (const id of current) {
          const ps = (parents.get(id) || []).slice(0, BASE_LIMIT);
          for (const pid of ps) {
            if (!visited.has(pid)) {
              visited.add(pid);
              visible.add(pid);
              next.push(pid);
            }
          }
        }
        current = next;
      }
    }

    // Collect children (students)
    {
      const visited = new Set<number>([canonicalCenterId]);
      let current = [canonicalCenterId];
      for (let d = 0; d < maxDepth; d++) {
        const next: number[] = [];
        for (const id of current) {
          const cs = (children.get(id) || []).slice(0, BASE_LIMIT);
          for (const cid of cs) {
            if (!visited.has(cid)) {
              visited.add(cid);
              visible.add(cid);
              next.push(cid);
            }
          }
        }
        current = next;
      }
    }

    visible.add(canonicalCenterId);

    // Build node positions — vertical layout
    // Level 0 = parents (top), 1 = center, 2 = children (bottom)
    const levelMap = new Map<number, number>();
    const parentArr = [...visible].filter(id => id !== canonicalCenterId && nodeMap.has(id) && (parents.get(canonicalCenterId) || []).includes(id));
    const childArr = [...visible].filter(id => id !== canonicalCenterId && nodeMap.has(id) && (children.get(canonicalCenterId) || []).includes(id));

    levelMap.set(canonicalCenterId, 1);
    parentArr.forEach(id => levelMap.set(id, 0));
    childArr.forEach(id => levelMap.set(id, 2));

    const VERT_SPACING = 200;
    const HORIZ_SPACING = 180;
    const CANVAS_OFFSET_X = 400;
    const CANVAS_OFFSET_Y = 280;

    for (const id of visible) {
      const node = nodeMap.get(id);
      if (!node) continue;
      const level = levelMap.get(id) ?? 1;
      const levelNodes = [...visible].filter(lid => levelMap.get(lid) === level);
      const idx = levelNodes.indexOf(id);

      const isCenter = id === canonicalCenterId;
      const totalP = (parents.get(id) || []).length;
      const totalC = (children.get(id) || []).length;

      cf.push({
        id: String(id),
        position: {
          x: CANVAS_OFFSET_X + (idx - Math.floor(levelNodes.length / 2)) * HORIZ_SPACING,
          y: CANVAS_OFFSET_Y + (level - 1) * VERT_SPACING,
        },
        data: {
          narrator: node,
          isCenter,
          isSelected: false,
          isHovered: false,
          darkMode,
          lang,
          totalParents: totalP,
          totalChildren: totalC,
          mergedCount: mergedCountMap.get(id) ?? 1,
        },
        draggable: true,
        type: 'narrator',
      });
    }

    // Build edges — only visible connections
    const seen = new Set<string>();
    for (const e of cleanedEdges) {
      const student = Number(e.from_narrator_id);
      const teacher = Number(e.to_narrator_id);
      if (!visible.has(student) || !visible.has(teacher)) continue;
      const key = `${student}-${teacher}`;
      if (seen.has(key)) continue;
      seen.add(key);

      ef.push({
        id: key,
        source: String(teacher),
        target: String(student),
        type: 'bezier',
        animated: false,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
          color: darkMode ? '#14b8a6' : '#0d9488',
        },
        style: {
          stroke: darkMode ? 'rgba(45,212,191,0.5)' : 'rgba(13,148,136,0.5)',
          strokeWidth: 1.5,
        },
      });
    }

    return { initialNodes: cf, initialEdges: ef };
  }, [canonicalCenterId, nodeMap, parents, children, cleanedEdges, darkMode, lang]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<number | null>(null);
  const [hoveredNode, setHoveredNode] = useState<number | null>(null);

  // Update when center changes
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    setSelectedNode(null);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Apply dark mode + selection highlighting to edges
  useEffect(() => {
    setEdges((eds: Edge[]) =>
      eds.map(e => {
        const sourceId = Number(e.source);
        const targetId = Number(e.target);
        const isHighlighted = selectedNode !== null && (sourceId === selectedNode || targetId === selectedNode);
        const isHoverHighlighted = hoveredNode !== null && !selectedNode && (sourceId === hoveredNode || targetId === hoveredNode);
        const isActive = isHighlighted || isHoverHighlighted;

        return {
          ...e,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 20,
            height: 20,
            color: isActive
              ? (darkMode ? '#fbbf24' : '#d97706')
              : (darkMode ? '#14b8a6' : '#0d9488'),
          },
          style: {
            ...e.style,
            stroke: isActive
              ? (darkMode ? 'rgba(251,191,36,0.9)' : 'rgba(217,119,6,0.9)')
              : (darkMode ? 'rgba(45,212,191,0.4)' : 'rgba(13,148,136,0.4)'),
            strokeWidth: isActive ? 2.5 : 1.5,
          },
        };
      })
    );
  }, [darkMode, setEdges, selectedNode, hoveredNode]);

  // Update nodes with selection/hover state
  useEffect(() => {
    setNodes(nds =>
      nds.map(n => ({
        ...n,
        data: {
          ...n.data,
          isSelected: Number(n.id) === selectedNode,
          isHovered: Number(n.id) === hoveredNode && selectedNode === null,
        },
      }))
    );
  }, [selectedNode, hoveredNode, setNodes]);

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges(eds => addEdge({ ...connection, type: 'smoothstep' }, eds)),
    [setEdges]
  );

  const handleNodeClick = useCallback(
    (_: unknown, node: Node) => {
      setSelectedNode(Number(node.id));
      const narrator = nodeMap.get(Number(node.id));
      if (narrator) onNodeClick(narrator);
    },
    [nodeMap, onNodeClick]
  );

  const handleNodeMouseEnter = useCallback((_: unknown, node: Node) => {
    setHoveredNode(Number(node.id));
  }, []);

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredNode(null);
  }, []);

  const nodeTypes: NodeTypes = {
    narrator: NarratorNodeComponent,
  };

  if (!centerNode) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
        No chains found
      </div>
    );
  }

  const edgeColor = darkMode ? '#14b8a6' : '#0d9488';

  return (
    <ReactFlowProvider>
    <div className="relative w-full rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden" style={{ height: '80vh', minHeight: 600 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color={darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}
        />
        <MiniMap
          nodeColor={(node) =>
            node.data?.isCenter
              ? '#0d9488'
              : darkMode
                ? '#3f3f46'
                : '#e5e7eb'
          }
          maskColor={darkMode ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.1)'}
          style={{ bottom: 16, right: 16 }}
        />
        <Controls
          showInteractive={false}
          className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg border border-gray-200 dark:border-zinc-700 [&>button]:bg-white dark:[&>button]:bg-zinc-900 [&>button]:border-gray-200 dark:[&>button]:border-zinc-700"
        />
      </ReactFlow>

      {/* Stats overlay */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-1 pointer-events-none">
        <div className="text-xs text-gray-500 dark:text-gray-400">
          <span className="text-amber-600 dark:text-amber-400 font-medium">{centerTotalParents} teachers</span>
          <span className="mx-2 text-gray-300 dark:text-gray-600">·</span>
          <span className="text-teal-600 dark:text-teal-400 font-medium">{centerTotalChildren} students</span>
        </div>
        <div className="text-[10px] text-gray-400 dark:text-gray-500">
          1-level view · drag to reposition · click to explore
        </div>
      </div>
    </div>
    </ReactFlowProvider>
  );
}
