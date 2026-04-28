'use client';

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import type { NarratorNode, NarratorEdge } from './types';
import { clsx } from 'clsx';

const BASE_LIMIT = 5;
const EXPANDED_MULTIPLIER = 2;
const DEFAULT_DEPTH = 1;

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
  // DB edge: from_narrator_id = student, to_narrator_id = teacher
  // Visual tree: parents (↑ above) = teachers, children (↓ below) = students
  const parents = new Map<number, number[]>();  // X → X's teachers
  const children = new Map<number, number[]>(); // X → X's students
  const edgeList = Array.isArray(edges) ? edges : [];
  for (const e of edgeList) {
    const student = Number(e.from_narrator_id);
    const teacher = Number(e.to_narrator_id);
    if (student === teacher) continue; // skip self-edges
    // student's parent (above) = teacher
    if (!parents.has(student)) parents.set(student, []);
    parents.get(student)!.push(teacher);
    // teacher's child (below) = student
    if (!children.has(teacher)) children.set(teacher, []);
    children.get(teacher)!.push(student);
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
  id,
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
  activeNode,
  newNodes,
  hoveredNode,
  setHoveredNode,
}: {
  node: NarratorNode;
  id: number;
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
  activeNode: number | null;
  newNodes: Set<number>;
  hoveredNode: number | null;
  setHoveredNode: (id: number | null) => void;
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
  const canExpandUp = isCenter && hiddenParents > 0;
  const canExpandDown = isCenter && hiddenChildren > 0;

  const isExpanded = expandedUp || expandedDown;

  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <button
        onClick={onClick}
        onMouseEnter={() => setHoveredNode(id)}
        onMouseLeave={() => setHoveredNode(null)}
        className={clsx(
          'relative px-4 py-2.5 rounded-xl border transition-all flex flex-col items-center min-w-[90px] max-w-[140px] md:min-w-[110px] md:max-w-[180px]',
          isCenter
            ? 'bg-teal-500 text-white font-semibold shadow-lg ring-2 ring-teal-400 scale-105 z-10'
            : hoveredNode === id
              ? 'ring-2 ring-amber-400 scale-[1.03] shadow-md'
              : activeNode === id
                ? 'ring-2 ring-amber-400 shadow-lg shadow-amber-200/50 scale-[1.02] bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-zinc-700'
                : newNodes.has(id)
                  ? 'bg-yellow-100 dark:bg-yellow-900/20 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-zinc-700'
                  : isExpanded
                    ? 'bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-zinc-700 ring-2 ring-amber-400'
                    : darkMode
                      ? 'bg-zinc-800 text-gray-100 border-zinc-700 hover:bg-zinc-700'
                      : 'bg-white text-gray-900 border-gray-200 hover:bg-gray-50',
        )}
      >
        <span dir="rtl" className={isCenter ? 'font-bold text-sm' : 'text-[11px] md:text-[12px]'}>{name}</span>
        {subname && (
          <span className={clsx('text-[8px] md:text-[9px] opacity-75', isCenter ? 'text-white/80' : darkMode ? 'text-gray-400' : 'text-gray-500')}>
            {subname}
          </span>
        )}
        <span className={clsx('text-[8px] md:text-[9px] mt-1 font-medium', darkMode ? 'text-gray-100' : 'text-gray-500')}>
          {totalParents > 0 && `${totalParents} teachers`}
          {totalParents > 0 && totalChildren > 0 && ' · '}
          {totalChildren > 0 && `${totalChildren} students`}
        </span>
        {rel && (
          <span className={clsx('text-[8px] px-1.5 py-0.5 rounded-full mt-1 font-medium', relColor)}>
            {rel}
          </span>
        )}
        {node.data_source === 'computed' && (
          <span className="text-[7px] px-1 py-0.5 rounded mt-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">
            name only
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
              title={`${hiddenParents} more teachers`}
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
              title={`${hiddenChildren} more students`}
            >
              {expandedDown ? '▼' : '↓'}
            </button>
          )}
        </div>
      )}

      {(hiddenParents > 0 || hiddenChildren > 0) && (
        <span className="text-[8px] text-amber-600 dark:text-amber-400 font-medium">
          {hiddenParents > 0 && `+${hiddenParents} more teachers`}
          {hiddenParents > 0 && hiddenChildren > 0 && ' · '}
          {hiddenChildren > 0 && `+${hiddenChildren} more students`}
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
  setNodeRef,
  activeNode,
  newNodes,
  hoveredNode,
  setHoveredNode,
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
  setNodeRef: (id: number) => (el: HTMLDivElement | null) => void;
  activeNode: number | null;
  newNodes: Set<number>;
  hoveredNode: number | null;
  setHoveredNode: (id: number | null) => void;
}) {
  if (nodeIds.length === 0) return null;
  // Flat layer (no fake sibling grouping)
  const groups = new Map<number, number[]>();
  groups.set(0, nodeIds);
  return (
    <div className="flex flex-wrap gap-2 md:gap-4 justify-center px-2 md:px-4">
      {Array.from(groups.values()).map((group, gi) => (
        <div key={gi} className="flex flex-col items-center gap-1">
          <div className="flex gap-3">
            {group.map(id => {
              const node = nodeMap.get(id);
              if (!node) return null;
              const counts = renderedCounts.get(id) ?? { parents: 0, children: 0 };
              const totalParents = (adj.parents.get(id) || []).length;
              const totalChildren = (adj.children.get(id) || []).length;
              return (
                <div key={id} ref={setNodeRef(id)}>
                  <NarratorNodeCard
                    node={node}
                    id={id}
                    isCenter={false}
                    darkMode={darkMode}
                    lang={lang}
                    totalParents={totalParents}
                    totalChildren={totalChildren}
                    renderedParents={counts.parents}
                    renderedChildren={counts.children}
                    onClick={() => onNodeClick(id)}
                    onExpandUp={() => {}}
                    onExpandDown={() => {}}
                    expandedUp={expandedUp.has(id)}
                    expandedDown={expandedDown.has(id)}
                    activeNode={activeNode}
                    newNodes={newNodes}
                    hoveredNode={hoveredNode}
                    setHoveredNode={setHoveredNode}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── SVG Connection Lines ─── */
function ConnectionLines({
  edges,
  nodeRefs,
  containerRef,
  activeNode,
  hoveredNode,
}: {
  edges: NarratorEdge[];
  nodeRefs: React.MutableRefObject<Map<number, HTMLDivElement>>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  activeNode: number | null;
  hoveredNode: number | null;
}) {
  const [lines, setLines] = useState<Array<{ x1: number; y1: number; x2: number; y2: number; key: string; offset: number; student: number; teacher: number }>>([]);

  useEffect(() => {
    function compute() {
      const container = containerRef.current;
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      const seen = new Set<string>();
      const newLines: typeof lines = [];

      for (const e of edges) {
        const student = Number(e.from_narrator_id);
        const teacher = Number(e.to_narrator_id);
        if (student === teacher) continue;
        const key = `${student}-${teacher}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // teacher node is above, student node is below
        const teacherEl = nodeRefs.current.get(teacher);
        const studentEl = nodeRefs.current.get(student);
        if (!teacherEl || !studentEl) continue;

        const tRect = teacherEl.getBoundingClientRect();
        const sRect = studentEl.getBoundingClientRect();

        const x1 = tRect.left + tRect.width / 2 - cRect.left;
        const y1 = tRect.bottom - cRect.top;
        const x2 = sRect.left + sRect.width / 2 - cRect.left;
        const y2 = sRect.top - cRect.top;
        const offset = Math.min(Math.abs(x2 - x1) * 0.08, 40);

        newLines.push({
          key,
          x1,
          y1,
          x2,
          y2,
          offset,
          student,
          teacher,
        });
      }

      setLines(newLines);
    }

    // Delay slightly so DOM has laid out
    const timer = setTimeout(compute, 50);
    window.addEventListener('resize', compute);
    const observer = new MutationObserver(compute);
    if (containerRef.current) {
      observer.observe(containerRef.current, { childList: true, subtree: true });
    }
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', compute);
      observer.disconnect();
    };
  }, [edges, nodeRefs, containerRef]);

  if (lines.length === 0) return null;

  return (
    <svg className="absolute inset-0 pointer-events-none z-0 hidden md:block" style={{ width: '100%', height: '100%' }}>
      {lines.map(line => {
        const midY = (line.y1 + line.y2) / 2;
        const isClose = Math.abs(line.x2 - line.x1) < 40;
        const d = isClose
          ? `M ${line.x1},${line.y1} L ${line.x2},${line.y2}`
          : `M ${line.x1},${line.y1} C ${line.x1},${midY} ${line.x2},${midY} ${line.x2},${line.y2}`;
        const isActive =
          (activeNode !== null && (line.teacher === activeNode || line.student === activeNode)) ||
          (hoveredNode !== null && (line.teacher === hoveredNode || line.student === hoveredNode));
        return (
          <path
            key={line.key}
            d={d}
            stroke={isActive ? 'rgba(251, 191, 36, 0.9)' : 'rgba(100, 116, 139, 0.6)'}
            strokeWidth={isActive ? 2.8 : (line.y1 < line.y2 ? 1 : 2.4)}
            fill="none"
            opacity={isActive ? 1 : 0.15}
          />
        );
      })}
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
  const [activeNode, setActiveNode] = useState<number | null>(null);
  const [newNodes, setNewNodes] = useState<Set<number>>(new Set());
  const [hoveredNode, setHoveredNode] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<number, HTMLDivElement>());
  const prevVisibleRef = useRef<Set<number>>(new Set());
  const isFirstRender = useRef(true);

  // Reset on center change
  useEffect(() => {
    setExpandedUp(new Set());
    setExpandedDown(new Set());
    setActiveNode(null);
    setNewNodes(new Set());
    nodeRefs.current = new Map();
    prevVisibleRef.current = new Set();
    isFirstRender.current = true;
  }, [centerId]);

  // Build adjacency + node map
  const { adj, nodeMap } = useMemo(() => {
    const adj = buildAdjacency(rawEdges);
    const nodeMap = new Map<number, NarratorNode>();
    for (const n of rawNodes) nodeMap.set(Number(n.id), n);
    return { adj, nodeMap };
  }, [rawNodes, rawEdges]);

  // Dynamic depth: fixed at DEFAULT_DEPTH
  const maxDepth = DEFAULT_DEPTH;

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

  // Track newly added nodes when layers change
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      prevVisibleRef.current = new Set(allLevels.flat());
      return;
    }
    const current = new Set(allLevels.flat());
    const prev = prevVisibleRef.current;
    const added = new Set<number>();
    for (const id of current) {
      if (!prev.has(id)) added.add(id);
    }
    if (added.size > 0) {
      setNewNodes(added);
      const timer = setTimeout(() => setNewNodes(new Set()), 800);
      prevVisibleRef.current = current;
      return () => clearTimeout(timer);
    }
    prevVisibleRef.current = current;
  }, [allLevels]);

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
    setActiveNode(id);
    setTimeout(() => {
      const el = nodeRefs.current.get(id);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
    setTimeout(() => setActiveNode(null), 800);
    setExpandedUp(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleExpandDown = useCallback((id: number) => {
    setActiveNode(id);
    setTimeout(() => {
      const el = nodeRefs.current.get(id);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
    setTimeout(() => setActiveNode(null), 800);
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
    <div
      className="relative flex flex-col items-center gap-2 p-6 overflow-x-auto md:overflow-visible px-2 md:px-6 rounded-2xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-950 min-h-[60vh]"
      ref={containerRef}
    >
      {/* SVG Lines — only actual edges */}
      <ConnectionLines
        edges={useMemo(() => {
          const visible = new Set(allLevels.flat());
          const filtered: NarratorEdge[] = [];
          const MAX_EDGES_PER_NODE = 2;
          const nodeEdgeCounts = new Map<number, number>();
          for (const e of rawEdges) {
            const student = Number(e.from_narrator_id);
            const teacher = Number(e.to_narrator_id);
            if (!visible.has(student) || !visible.has(teacher)) continue;

            // enforce ONLY layer-to-layer connections
            let studentLayer = -1;
            let teacherLayer = -1;

            allLevels.forEach((lvl, idx) => {
              if (lvl.includes(student)) studentLayer = idx;
              if (lvl.includes(teacher)) teacherLayer = idx;
            });

            if (Math.abs(studentLayer - teacherLayer) !== 1) continue;

            // --- limit edges for center node ---
            const MAX_CENTER_EDGES = 6;
            if (teacher === centerId) {
              const firstLayer = layers.childLevels[0] || [];
              const allowed = firstLayer.slice(0, MAX_CENTER_EDGES);
              if (!allowed.includes(student)) continue;
            }
            if (student === centerId) {
              const lastParentLayer = layers.parentLevels[layers.parentLevels.length - 1] || [];
              const allowed = lastParentLayer.slice(0, MAX_CENTER_EDGES);
              if (!allowed.includes(teacher)) continue;
            }

            // --- limit deep edge clutter per node ---
            const studentCount = nodeEdgeCounts.get(student) || 0;
            const teacherCount = nodeEdgeCounts.get(teacher) || 0;
            if (studentCount >= MAX_EDGES_PER_NODE || teacherCount >= MAX_EDGES_PER_NODE) continue;
            nodeEdgeCounts.set(student, studentCount + 1);
            nodeEdgeCounts.set(teacher, teacherCount + 1);

            filtered.push(e);
          }
          return filtered;
        }, [rawEdges, allLevels, layers, centerId])}
        nodeRefs={nodeRefs}
        containerRef={containerRef}
        activeNode={activeNode}
        hoveredNode={hoveredNode}
      />

      {/* Stats */}
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 z-10 text-center">
        <span className="text-amber-600 dark:text-amber-400 font-medium">{centerTotalParents} teachers</span>
        <span className="mx-2 text-gray-300 dark:text-gray-600">·</span>
        <span className="text-teal-600 dark:text-teal-400 font-medium">{centerTotalChildren} students</span>
        <span className="mx-2 text-gray-300 dark:text-gray-600">·</span>
        <span>{rawNodes.length} nodes shown (partial view)</span>
      </div>
      <div className="text-[10px] text-gray-400 dark:text-gray-500 mb-2 z-10">
        Showing partial chain · expand nodes to explore full sanad
      </div>

      {centerTotalParents > centerCounts.parents && (
        <div className="text-xs text-gray-500 mb-2 z-10">
          +{centerTotalParents - centerCounts.parents} more teachers
        </div>
      )}

      {/* ── PARENT LEVELS (teachers, top) ── */}
      {[...layers.parentLevels].reverse().map((level, idx) => (
        <div key={`p-${idx}`} className="flex flex-col items-center gap-1 z-10 w-full">
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
            setNodeRef={setNodeRef}
            activeNode={activeNode}
            newNodes={newNodes}
            hoveredNode={hoveredNode}
            setHoveredNode={setHoveredNode}
          />
          <VConnector />
        </div>
      ))}

      {/* ── CENTER NODE ── */}
      <div className="z-10" ref={setNodeRef(centerId)}>
        <NarratorNodeCard
          node={centerNode}
          id={centerId}
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
          activeNode={activeNode}
          newNodes={newNodes}
          hoveredNode={hoveredNode}
          setHoveredNode={setHoveredNode}
        />
      </div>

      {/* ── CHILD LEVELS (students, bottom) ── */}
      {layers.childLevels.map((level, idx) => (
        <div key={`c-${idx}`} className="flex flex-col items-center gap-1 z-10 w-full">
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
            setNodeRef={setNodeRef}
            activeNode={activeNode}
            newNodes={newNodes}
            hoveredNode={hoveredNode}
            setHoveredNode={setHoveredNode}
          />
        </div>
      ))}

      {centerTotalChildren > centerCounts.children && (
        <div className="text-xs text-gray-500 mt-2 z-10">
          +{centerTotalChildren - centerCounts.children} more students
        </div>
      )}
    </div>
  );
}
