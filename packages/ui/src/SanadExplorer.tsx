'use client';

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import type { NarratorNode, NarratorEdge } from './types';
import { clsx } from 'clsx';

const BASE_LIMIT = 5;
const EXPANDED_MULTIPLIER = 2;
const DEFAULT_DEPTH = 2;
const EXPANDED_DEPTH = 3;

/* ─── Types ─── */
interface AdjacencyMaps {
  parents: Map<number, number[]>;
  children: Map<number, number[]>;
}

interface BfsOptions {
  maxDepth: number;
  baseLimit: number;
  expandedUp: Set<number>;
  expandedDown: Set<number>;
}

interface LayerData {
  parentLevels: number[][];
  childLevels: number[][];
  renderedCounts: Map<number, { parents: number; children: number }>;
  parentToChildren: Map<number, number[]>; // structure for future grouping
  childToParents: Map<number, number[]>;
}

interface Props {
  nodes: NarratorNode[];
  edges: NarratorEdge[];
  centerId: number;
  darkMode: boolean;
  lang: 'en' | 'bn' | 'ar';
  onNodeClick: (node: NarratorNode) => void;
}

/* ─── Utility ─── */
function buildAdjacency(edges: NarratorEdge[] | any): AdjacencyMaps {
  const parents = new Map<number, number[]>();
  const children = new Map<number, number[]>();
  const edgeList = Array.isArray(edges) ? edges : [];
  for (const e of edgeList) {
    const from = Number(e.from_narrator_id);
    const to = Number(e.to_narrator_id);
    if (!children.has(from)) children.set(from, []);
    children.get(from)!.push(to);
    if (!parents.has(to)) parents.set(to, []);
    parents.get(to)!.push(from);
  }
  for (const [k, v] of parents) parents.set(k, [...new Set(v)]);
  for (const [k, v] of children) children.set(k, [...new Set(v)]);
  return { parents, children };
}

function bfsLayers(
  centerId: number,
  adj: AdjacencyMaps,
  opts: BfsOptions
): LayerData {
  const { maxDepth, baseLimit, expandedUp, expandedDown } = opts;
  const parentLevels: number[][] = [];
  const childLevels: number[][] = [];
  const renderedCounts = new Map<number, { parents: number; children: number }>();
  const parentToChildren = new Map<number, number[]>();
  const childToParents = new Map<number, number[]>();

  // ── Parents (BFS upward) ──
  {
    let current = [centerId];
    const visited = new Set<number>([centerId]);
    for (let d = 0; d < maxDepth; d++) {
      const next: number[] = [];
      const seen = new Set<number>();
      for (const id of current) {
        const allParents = adj.parents.get(id) || [];
        const isExpanded = expandedUp.has(id);
        const limit = isExpanded ? baseLimit * EXPANDED_MULTIPLIER : baseLimit;
        const selected = allParents.slice(0, limit);
        renderedCounts.set(id, {
          ...(renderedCounts.get(id) ?? { children: 0 }),
          parents: selected.length,
        });
        for (const pid of selected) {
          if (!visited.has(pid) && !seen.has(pid)) {
            seen.add(pid);
            visited.add(pid);
            next.push(pid);
          }
          // Track structure for grouping
          const ptc = parentToChildren.get(pid) || [];
          if (!ptc.includes(id)) ptc.push(id);
          parentToChildren.set(pid, ptc);
          const ctp = childToParents.get(id) || [];
          if (!ctp.includes(pid)) ctp.push(pid);
          childToParents.set(id, ctp);
        }
      }
      if (next.length === 0) break;
      parentLevels.push(next);
      current = next;
    }
  }

  // ── Children (BFS downward) ──
  {
    let current = [centerId];
    const visited = new Set<number>([centerId]);
    for (let d = 0; d < maxDepth; d++) {
      const next: number[] = [];
      const seen = new Set<number>();
      for (const id of current) {
        const allChildren = adj.children.get(id) || [];
        const isExpanded = expandedDown.has(id);
        const limit = isExpanded ? baseLimit * EXPANDED_MULTIPLIER : baseLimit;
        const selected = allChildren.slice(0, limit);
        const existing = renderedCounts.get(id) ?? { parents: 0 };
        renderedCounts.set(id, { ...existing, children: selected.length });
        for (const cid of selected) {
          if (!visited.has(cid) && !seen.has(cid)) {
            seen.add(cid);
            visited.add(cid);
            next.push(cid);
          }
          // Track structure for grouping
          const ptc = parentToChildren.get(id) || [];
          if (!ptc.includes(cid)) ptc.push(cid);
          parentToChildren.set(id, ptc);
          const ctp = childToParents.get(cid) || [];
          if (!ctp.includes(id)) ctp.push(id);
          childToParents.set(cid, ctp);
        }
      }
      if (next.length === 0) break;
      childLevels.push(next);
      current = next;
    }
  }

  return { parentLevels, childLevels, renderedCounts, parentToChildren, childToParents };
}

/* ─── Node Card ─── */
function NarratorNodeCard({
  node,
  isCenter,
  darkMode,
  lang,
  totalParents,
  totalChildren,
  renderedParents,
  renderedChildren,
  onClick,
  onExpandUp,
  onExpandDown,
  expandedUp,
  expandedDown,
}: {
  node: NarratorNode;
  isCenter: boolean;
  darkMode: boolean;
  lang: 'en' | 'bn' | 'ar';
  totalParents: number;
  totalChildren: number;
  renderedParents: number;
  renderedChildren: number;
  onClick: () => void;
  onExpandUp: () => void;
  onExpandDown: () => void;
  expandedUp: boolean;
  expandedDown: boolean;
}) {
  const name = node.name_ar;
  const subname = lang === 'bn'
    ? (node.name_bn ?? node.name_en)
    : (node.name_en ?? node.name_bn);

  const rel = node.reliability || (node.tabaqah === 1 ? 'thiqah' : null);
  const relColor =
    rel === 'thiqah' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
    : rel === 'saduq' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
    : rel === 'daif' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
    : rel === 'mawdu' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
    : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-gray-500';

  const hiddenParents = Math.max(0, totalParents - renderedParents);
  const hiddenChildren = Math.max(0, totalChildren - renderedChildren);
  const canExpandUp = hiddenParents > 0;
  const canExpandDown = hiddenChildren > 0;

  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <button
        onClick={onClick}
        className={clsx(
          'relative px-4 py-2.5 rounded-xl border transition-all flex flex-col items-center min-w-[110px] max-w-[180px]',
          isCenter
            ? 'bg-teal-500 text-white font-semibold shadow-lg ring-2 ring-teal-400 scale-105 z-10'
            : darkMode
              ? 'bg-zinc-800 text-gray-100 border-zinc-700 hover:bg-zinc-700'
              : 'bg-white text-gray-900 border-gray-200 hover:bg-gray-50',
        )}
      >
        <span dir="rtl" className={isCenter ? 'font-bold text-sm' : 'text-[12px]'}>{name}</span>
        {subname && (
          <span className={clsx('text-[9px] opacity-75', isCenter ? 'text-white/80' : darkMode ? 'text-gray-400' : 'text-gray-500')}>
            {subname}
          </span>
        )}
        {rel && (
          <span className={clsx('text-[8px] px-1.5 py-0.5 rounded-full mt-1 font-medium', relColor)}>
            {rel}
          </span>
        )}
      </button>

      {(canExpandUp || canExpandDown) && (
        <div className="flex items-center gap-1.5">
          {canExpandUp && (
            <button
              onClick={onExpandUp}
              className={clsx(
                'w-5 h-5 rounded-full text-[9px] flex items-center justify-center transition-colors',
                expandedUp ? 'bg-amber-400 text-zinc-900' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-amber-200'
              )}
              title={`${hiddenParents} more parents`}
            >
              {expandedUp ? '▲' : '↑'}
            </button>
          )}
          {canExpandDown && (
            <button
              onClick={onExpandDown}
              className={clsx(
                'w-5 h-5 rounded-full text-[9px] flex items-center justify-center transition-colors',
                expandedDown ? 'bg-amber-400 text-zinc-900' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-amber-200'
              )}
              title={`${hiddenChildren} more children`}
            >
              {expandedDown ? '▼' : '↓'}
            </button>
          )}
        </div>
      )}

      {(hiddenParents > 0 || hiddenChildren > 0) && (
        <span className="text-[8px] text-amber-600 dark:text-amber-400 font-medium">
          {hiddenParents > 0 && `${hiddenParents}↑`}
          {hiddenParents > 0 && hiddenChildren > 0 && ' '}
          {hiddenChildren > 0 && `${hiddenChildren}↓`}
        </span>
      )}
    </div>
  );
}

/* ─── Row Component ─── */
function GraphRow({
  nodeIds,
  nodeMap,
  darkMode,
  lang,
  adj,
  expandedUp,
  expandedDown,
  renderedCounts,
  onNodeClick,
  onExpandUp,
  onExpandDown,
}: {
  nodeIds: number[];
  nodeMap: Map<number, NarratorNode>;
  darkMode: boolean;
  lang: 'en' | 'bn' | 'ar';
  adj: AdjacencyMaps;
  expandedUp: Set<number>;
  expandedDown: Set<number>;
  renderedCounts: Map<number, { parents: number; children: number }>;
  onNodeClick: (id: number) => void;
  onExpandUp: (id: number) => void;
  onExpandDown: (id: number) => void;
}) {
  if (nodeIds.length === 0) return null;
  return (
    <div className="flex gap-4 justify-center px-4">
      {nodeIds.map(id => {
        const node = nodeMap.get(id);
        if (!node) return null;
        const counts = renderedCounts.get(id) ?? { parents: 0, children: 0 };
        const totalParents = (adj.parents.get(id) || []).length;
        const totalChildren = (adj.children.get(id) || []).length;
        return (
          <NarratorNodeCard
            key={id}
            node={node}
            isCenter={false}
            darkMode={darkMode}
            lang={lang}
            totalParents={totalParents}
            totalChildren={totalChildren}
            renderedParents={counts.parents}
            renderedChildren={counts.children}
            onClick={() => onNodeClick(id)}
            onExpandUp={() => onExpandUp(id)}
            onExpandDown={() => onExpandDown(id)}
            expandedUp={expandedUp.has(id)}
            expandedDown={expandedDown.has(id)}
          />
        );
      })}
    </div>
  );
}

/* ─── SVG Connection Lines ─── */
function ConnectionLines({
  levels,
  nodeRefs,
  containerRef,
}: {
  levels: number[][];
  nodeRefs: React.MutableRefObject<Map<number, HTMLDivElement>>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [lines, setLines] = useState<Array<{ x1: number; y1: number; x2: number; y2: number }>>([]);

  useEffect(() => {
    function compute() {
      const container = containerRef.current;
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      const newLines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

      for (let i = 0; i < levels.length - 1; i++) {
        const upperLevel = levels[i];
        const lowerLevel = levels[i + 1];

        for (const upperId of upperLevel) {
          const upperEl = nodeRefs.current.get(upperId);
          if (!upperEl) continue;
          const upperRect = upperEl.getBoundingClientRect();
          const upperX = upperRect.left + upperRect.width / 2 - cRect.left;
          const upperY = upperRect.bottom - cRect.top;

          for (const lowerId of lowerLevel) {
            const lowerEl = nodeRefs.current.get(lowerId);
            if (!lowerEl) continue;
            const lowerRect = lowerEl.getBoundingClientRect();
            const lowerX = lowerRect.left + lowerRect.width / 2 - cRect.left;
            const lowerY = lowerRect.top - cRect.top;

            // Simple distance check for adjacency (adjacent in graph)
            // In a real implementation you'd check adjacency maps
            // For now, draw lines between all visible nodes in adjacent levels
            newLines.push({ x1: upperX, y1: upperY, x2: lowerX, y2: lowerY });
          }
        }
      }

      setLines(newLines);
    }

    compute();
    window.addEventListener('resize', compute);
    const observer = new MutationObserver(compute);
    if (containerRef.current) {
      observer.observe(containerRef.current, { childList: true, subtree: true, attributes: true });
    }
    return () => {
      window.removeEventListener('resize', compute);
      observer.disconnect();
    };
  }, [levels, nodeRefs, containerRef]);

  if (lines.length === 0) return null;

  return (
    <svg className="absolute inset-0 pointer-events-none z-0" style={{ width: '100%', height: '100%' }}>
      {lines.map((line, i) => (
        <line
          key={i}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke="#d1d5db"
          strokeWidth="1"
          opacity="0.4"
        />
      ))}
    </svg>
  );
}

/* ─── Vertical Connector ─── */
function VConnector() {
  return <div className="w-px h-6 bg-gradient-to-b from-gray-200 via-gray-300 to-transparent dark:from-gray-700 dark:via-gray-600" />;
}

/* ─── Main Component ─── */
export default function SanadExplorer({
  nodes: rawNodes,
  edges: rawEdges,
  centerId,
  darkMode,
  lang,
  onNodeClick,
}: Props) {
  const [expandedUp, setExpandedUp] = useState<Set<number>>(new Set());
  const [expandedDown, setExpandedDown] = useState<Set<number>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<number, HTMLDivElement>());

  // Reset on center change
  useEffect(() => {
    setExpandedUp(new Set());
    setExpandedDown(new Set());
    nodeRefs.current = new Map();
  }, [centerId]);

  // Build adjacency + node map
  const { adj, nodeMap } = useMemo(() => {
    const adj = buildAdjacency(rawEdges);
    const nodeMap = new Map<number, NarratorNode>();
    for (const n of rawNodes) nodeMap.set(Number(n.id), n);
    return { adj, nodeMap };
  }, [rawNodes, rawEdges]);

  // Dynamic depth: expand ANY node = deeper exploration
  const maxDepth = useMemo(() => {
    if (expandedUp.size > 0 || expandedDown.size > 0) return EXPANDED_DEPTH;
    return DEFAULT_DEPTH;
  }, [expandedUp, expandedDown]);

  // Build layers
  const layers = useMemo(() => {
    return bfsLayers(centerId, adj, {
      maxDepth,
      baseLimit: BASE_LIMIT,
      expandedUp,
      expandedDown,
    });
  }, [centerId, adj, maxDepth, expandedUp, expandedDown]);

  // All levels combined for SVG lines [parents top-to-bottom, center, children]
  const allLevels = useMemo(() => {
    return [
      ...[...layers.parentLevels].reverse(),
      [centerId],
      ...layers.childLevels,
    ];
  }, [layers, centerId]);

  const centerNode = nodeMap.get(centerId);
  if (!centerNode) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
        No chains found
      </div>
    );
  }

  const centerCounts = layers.renderedCounts.get(centerId) ?? { parents: 0, children: 0 };
  const centerTotalParents = (adj.parents.get(centerId) || []).length;
  const centerTotalChildren = (adj.children.get(centerId) || []).length;

  const handleNodeClick = useCallback((id: number) => {
    const node = nodeMap.get(id);
    if (node) onNodeClick(node);
  }, [nodeMap, onNodeClick]);

  const toggleExpandUp = useCallback((id: number) => {
    setExpandedUp(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleExpandDown = useCallback((id: number) => {
    setExpandedDown(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Ref setter that also stores in nodeRefs
  const setNodeRef = useCallback((id: number) => (el: HTMLDivElement | null) => {
    if (el) nodeRefs.current.set(id, el);
    else nodeRefs.current.delete(id);
  }, []);

  return (
    <div className="relative flex flex-col items-center gap-2 p-4 overflow-x-auto rounded-2xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950" ref={containerRef}>
      {/* SVG Lines */}
      <ConnectionLines levels={allLevels} nodeRefs={nodeRefs} containerRef={containerRef} />

      {/* Stats */}
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 z-10">
        {layers.parentLevels.length} parent levels · {layers.childLevels.length} child levels
      </div>

      {/* ── PARENT LEVELS (top) ── */}
      {[...layers.parentLevels].reverse().map((level, idx) => (
        <div key={`p-${idx}`} className="flex flex-col items-center gap-1 z-10" ref={setNodeRef(level[0])}>
          <GraphRow
            nodeIds={level}
            nodeMap={nodeMap}
            darkMode={darkMode}
            lang={lang}
            adj={adj}
            expandedUp={expandedUp}
            expandedDown={expandedDown}
            renderedCounts={layers.renderedCounts}
            onNodeClick={handleNodeClick}
            onExpandUp={toggleExpandUp}
            onExpandDown={toggleExpandDown}
          />
          <VConnector />
        </div>
      ))}

      {/* ── CENTER NODE ── */}
      <div className="z-10" ref={setNodeRef(centerId)}>
        <NarratorNodeCard
          node={centerNode}
          isCenter={true}
          darkMode={darkMode}
          lang={lang}
          totalParents={centerTotalParents}
          totalChildren={centerTotalChildren}
          renderedParents={centerCounts.parents}
          renderedChildren={centerCounts.children}
          onClick={() => handleNodeClick(centerId)}
          onExpandUp={() => toggleExpandUp(centerId)}
          onExpandDown={() => toggleExpandDown(centerId)}
          expandedUp={expandedUp.has(centerId)}
          expandedDown={expandedDown.has(centerId)}
        />
      </div>

      {/* ── CHILD LEVELS (bottom) ── */}
      {layers.childLevels.map((level, idx) => (
        <div key={`c-${idx}`} className="flex flex-col items-center gap-1 z-10" ref={setNodeRef(level[0])}>
          <VConnector />
          <GraphRow
            nodeIds={level}
            nodeMap={nodeMap}
            darkMode={darkMode}
            lang={lang}
            adj={adj}
            expandedUp={expandedUp}
            expandedDown={expandedDown}
            renderedCounts={layers.renderedCounts}
            onNodeClick={handleNodeClick}
            onExpandUp={toggleExpandUp}
            onExpandDown={toggleExpandDown}
          />
        </div>
      ))}
    </div>
  );
}
