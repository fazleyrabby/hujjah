'use client';

import React, { useMemo } from 'react';
import type { NarratorNode, NarratorEdge } from './types';
import { clsx } from 'clsx';

/* ─── Types ─── */
interface AdjacencyMaps {
  parents: Map<number, number[]>;
  children: Map<number, number[]>;
}

interface ChainPreviewProps {
  nodes: NarratorNode[];
  edges: NarratorEdge[];
  centerId: number;
  darkMode: boolean;
  lang: 'en' | 'bn' | 'ar';
  onNodeClick: (node: NarratorNode) => void;
  onViewMore?: (centerId: number, direction: 'up' | 'down') => void;
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

/* ─── Simplified Node Card ─── */
function PreviewNodeCard({
  node,
  variant,
  darkMode,
  lang,
  onClick,
}: {
  node: NarratorNode;
  variant: 'center' | 'teacher' | 'student';
  darkMode: boolean;
  lang: 'en' | 'bn' | 'ar';
  onClick: () => void;
}) {
  const name = node.name_ar;
  const subname =
    lang === 'bn'
      ? (node.name_bn ?? node.name_en)
      : (node.name_en ?? node.name_bn);

  const rel = node.reliability || (node.tabaqah === 1 ? 'thiqah' : null);
  const relColor =
    rel === 'thiqah'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
      : rel === 'saduq'
        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
        : rel === 'daif'
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
          : rel === 'mawdu'
            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
            : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-gray-500';

  const variantClasses =
    variant === 'center'
      ? 'bg-teal-500 text-white font-semibold shadow-lg ring-2 ring-teal-400 scale-105 z-10'
      : variant === 'teacher'
        ? darkMode
          ? 'bg-sky-900/30 text-sky-100 border-sky-700 hover:bg-sky-800/40'
          : 'bg-sky-50 text-sky-900 border-sky-200 hover:bg-sky-100'
        : variant === 'student'
          ? darkMode
            ? 'bg-emerald-900/30 text-emerald-100 border-emerald-700 hover:bg-emerald-800/40'
            : 'bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100'
          : '';

  return (
    <button
      onClick={onClick}
      className={clsx(
        'relative px-4 py-2.5 rounded-xl border transition-all flex flex-col items-center min-w-[110px] max-w-[180px] shrink-0',
        variantClasses,
      )}
    >
      <span dir="rtl" className={variant === 'center' ? 'font-bold text-sm' : 'text-[12px]'}>
        {name}
      </span>
      {subname && (
        <span
          className={clsx(
            'text-[9px] opacity-75',
            variant === 'center'
              ? 'text-white/80'
              : darkMode
                ? 'text-gray-400'
                : 'text-gray-500',
          )}
        >
          {subname}
        </span>
      )}
      {rel && (
        <span className={clsx('text-[8px] px-1.5 py-0.5 rounded-full mt-1 font-medium', relColor)}>
          {rel}
        </span>
      )}
    </button>
  );
}

/* ─── Row of Nodes ─── */
function NodeRow({
  nodeIds,
  nodeMap,
  variant,
  darkMode,
  lang,
  onNodeClick,
}: {
  nodeIds: number[];
  nodeMap: Map<number, NarratorNode>;
  variant: 'teacher' | 'student';
  darkMode: boolean;
  lang: 'en' | 'bn' | 'ar';
  onNodeClick: (node: NarratorNode) => void;
}) {
  if (nodeIds.length === 0) return null;
  return (
    <div className="flex flex-wrap justify-center gap-3 px-2">
      {nodeIds.map(id => {
        const node = nodeMap.get(id);
        if (!node) return null;
        return (
          <PreviewNodeCard
            key={id}
            node={node}
            variant={variant}
            darkMode={darkMode}
            lang={lang}
            onClick={() => onNodeClick(node)}
          />
        );
      })}
    </div>
  );
}

/* ─── Divider ─── */
function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 w-full max-w-xs">
      <div className="flex-1 h-px bg-gray-200 dark:bg-zinc-700" />
      <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-medium">
        {label}
      </span>
      <div className="flex-1 h-px bg-gray-200 dark:bg-zinc-700" />
    </div>
  );
}

/* ─── Main Component ─── */
export default function ChainPreview({
  nodes,
  edges,
  centerId,
  darkMode,
  lang,
  onNodeClick,
  onViewMore,
}: ChainPreviewProps) {
  const { adj, nodeMap, centerNode } = useMemo(() => {
    const adj = buildAdjacency(edges);
    const nodeMap = new Map<number, NarratorNode>();
    for (const n of nodes) nodeMap.set(Number(n.id), n);
    return { adj, nodeMap, centerNode: nodeMap.get(centerId) };
  }, [nodes, edges, centerId]);

  if (!centerNode) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500 dark:text-gray-400 text-sm">
        No chain data available
      </div>
    );
  }

  const parentIds = adj.parents.get(centerId) ?? [];
  const childIds = adj.children.get(centerId) ?? [];
  const visibleParents = parentIds.slice(0, 5);
  const visibleChildren = childIds.slice(0, 5);
  const hiddenParentCount = Math.max(0, parentIds.length - 5);
  const hiddenChildCount = Math.max(0, childIds.length - 5);

  return (
    <div className="flex flex-col items-center gap-4 py-6 px-4">
      {/* ── Teachers ── */}
      {visibleParents.length > 0 && (
        <>
          <Divider label={lang === 'ar' ? 'الأساتذة' : 'Teachers'} />
          <NodeRow
            nodeIds={visibleParents}
            nodeMap={nodeMap}
            variant="teacher"
            darkMode={darkMode}
            lang={lang}
            onNodeClick={onNodeClick}
          />
          {hiddenParentCount > 0 && onViewMore && (
            <button
              onClick={() => onViewMore(centerId, 'up')}
              className="text-xs text-sky-600 dark:text-sky-400 font-medium hover:underline mt-1"
            >
              +{hiddenParentCount} more teachers →
            </button>
          )}
        </>
      )}

      {/* ── Center Node ── */}
      <div className="my-2">
        <PreviewNodeCard
          node={centerNode}
          variant="center"
          darkMode={darkMode}
          lang={lang}
          onClick={() => onNodeClick(centerNode)}
        />
      </div>

      {/* ── Students ── */}
      {visibleChildren.length > 0 && (
        <>
          <Divider label={lang === 'ar' ? 'الطلاب' : 'Students'} />
          <NodeRow
            nodeIds={visibleChildren}
            nodeMap={nodeMap}
            variant="student"
            darkMode={darkMode}
            lang={lang}
            onNodeClick={onNodeClick}
          />
          {hiddenChildCount > 0 && onViewMore && (
            <button
              onClick={() => onViewMore(centerId, 'down')}
              className="text-xs text-emerald-600 dark:text-emerald-400 font-medium hover:underline mt-1"
            >
              +{hiddenChildCount} more students →
            </button>
          )}
        </>
      )}

      {/* ── Empty state helpers ── */}
      {visibleParents.length === 0 && visibleChildren.length === 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
          No teachers or students recorded for this narrator.
        </p>
      )}
    </div>
  );
}
