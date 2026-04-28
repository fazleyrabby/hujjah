'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import type { NarratorNode, NarratorEdge } from './types';
import { clsx } from 'clsx';

function normalizeArabic(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u064B-\u0652\u0670]/g, '')
    .replace(/[إأآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ـ/g, '')
    .trim()
    .toLowerCase();
}

function mergeDuplicateNarrators(nodes: NarratorNode[]) {
  const groups = new Map<string, NarratorNode[]>();
  for (const n of nodes) {
    const key = normalizeArabic(n.name_ar);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(n);
  }
  const merged: NarratorNode[] = [];
  const idMap = new Map<number, number>();
  for (const [, group] of groups) {
    group.sort((a, b) => Number(a.id) - Number(b.id));
    const canonical = group.reduce((best, n) => {
      if (!best) return n;
      if (n.name_en && !best.name_en) return n;
      if (n.name_bn && !best.name_bn) return n;
      if (n.reliability && !best.reliability) return n;
      return best;
    }, null as NarratorNode | null);
    if (canonical) {
      merged.push(canonical);
      for (let i = 1; i < group.length; i++) {
        idMap.set(Number(group[i].id), Number(canonical.id));
      }
    }
  }
  return { mergedNodes: merged, idMap };
}

function rebuildEdges(edges: NarratorEdge[], idMap: Map<number, number>) {
  const seen = new Set<string>();
  const cleaned: NarratorEdge[] = [];
  for (const e of edges) {
    let from = Number(e.from_narrator_id);
    let to = Number(e.to_narrator_id);
    while (idMap.has(from)) from = idMap.get(from)!;
    while (idMap.has(to)) to = idMap.get(to)!;
    if (from === to) continue;
    const key = `${from}->${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push({ ...e, from_narrator_id: from, to_narrator_id: to });
  }
  return cleaned;
}

const INVALID_NAMES = new Set(['ابيه', 'امه', 'رجل', 'امراه']);

function isValidNarrator(node: NarratorNode): boolean {
  const norm = normalizeArabic(node.name_ar);
  if (norm.length < 3) return false;
  if (INVALID_NAMES.has(norm)) return false;
  return true;
}

interface ViewNode {
  id: number;
  node: NarratorNode;
  parentIds: number[];
  childIds: number[];
  childCount: number;
  parentCount: number;
  hadithCount: number;
}

interface Props {
  nodes: NarratorNode[];
  edges: NarratorEdge[];
  centerId: number;
  darkMode: boolean;
  lang: 'en' | 'bn' | 'ar';
  onNodeClick: (node: NarratorNode) => void;
}

const INITIAL_SHOW = 5;

function buildViewModel(
  nodes: NarratorNode[],
  edges: NarratorEdge[],
  centerId: number
): { viewNodes: Map<number, ViewNode>; nodeMap: Map<number, NarratorNode>; totalNodes: number; totalEdges: number } {
  const nodeMap = new Map<number, NarratorNode>(nodes.map(n => [Number(n.id), n]));
  const outgoing = new Map<number, number[]>();
  const incoming = new Map<number, number[]>();
  const hadithCount = new Map<number, number>();

  for (const e of edges) {
    const from = Number(e.from_narrator_id);
    const to = Number(e.to_narrator_id);
    if (!outgoing.has(from)) outgoing.set(from, []);
    outgoing.get(from)!.push(to);
    if (!incoming.has(to)) incoming.set(to, []);
    incoming.get(to)!.push(from);
    hadithCount.set(from, (hadithCount.get(from) ?? 0) + (e.hadith_count ?? 1));
    hadithCount.set(to, (hadithCount.get(to) ?? 0) + (e.hadith_count ?? 1));
  }

  const viewNodes = new Map<number, ViewNode>();

  function getViewNode(id: number): ViewNode | null {
    const n = nodeMap.get(id);
    if (!n) return null;
    if (viewNodes.has(id)) return viewNodes.get(id)!;
    const parents = incoming.get(id) || [];
    const children = outgoing.get(id) || [];
    const vn: ViewNode = {
      id,
      node: n,
      parentIds: parents,
      childIds: children,
      parentCount: parents.length,
      childCount: children.length,
      hadithCount: hadithCount.get(id) ?? 0,
    };
    viewNodes.set(id, vn);
    return vn;
  }

  // Center node
  getViewNode(centerId);

  // Initial: show top parents and children sorted by hadith count
  const center = nodeMap.get(centerId);
  if (center) {
    const parents = (incoming.get(centerId) || [])
      .map(id => ({ id, count: hadithCount.get(id) ?? 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, INITIAL_SHOW)
      .map(x => x.id);
    const children = (outgoing.get(centerId) || [])
      .map(id => ({ id, count: hadithCount.get(id) ?? 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, INITIAL_SHOW)
      .map(x => x.id);

    for (const id of [...parents, ...children]) {
      getViewNode(id);
    }
  }

  return {
    viewNodes,
    nodeMap,
    totalNodes: nodes.length,
    totalEdges: edges.length,
  };
}

function NodeComponent({
  viewNode,
  viewNodes,
  nodeMap,
  expanded,
  toggleExpand,
  depth,
  isLast,
  continuations,
  onNodeClick,
  darkMode,
  lang,
}: {
  viewNode: ViewNode;
  viewNodes: Map<number, ViewNode>;
  nodeMap: Map<number, NarratorNode>;
  expanded: Set<number>;
  toggleExpand: (id: number) => void;
  depth: number;
  isLast: boolean;
  continuations: boolean[];
  onNodeClick: (node: NarratorNode) => void;
  darkMode: boolean;
  lang: 'en' | 'bn' | 'ar';
}) {
  const hasChildren = viewNode.childIds.length > 0;
  const hasParents = viewNode.parentIds.length > 0;
  const isExpanded = expanded.has(viewNode.id);
  const isRoot = depth === 0;
  const hiddenChildren = isExpanded ? 0 : Math.max(0, viewNode.childIds.length - INITIAL_SHOW);
  const shownChildren = isExpanded ? viewNode.childIds : viewNode.childIds.slice(0, INITIAL_SHOW);

  const name = viewNode.node.name_ar;
  const subname = lang === 'bn'
    ? (viewNode.node.name_bn ?? viewNode.node.name_en)
    : (viewNode.node.name_en ?? viewNode.node.name_bn);

  return (
    <div className="flex flex-col">
      <div className="flex items-center">
        {depth > 0 && (
          <div className="flex items-center">
            {continuations.slice(0, depth - 1).map((cont, i) => (
              <span key={i} className="select-none text-[10px] text-gray-400 dark:text-gray-500 leading-6 pr-1 w-4 text-center">
                {cont ? '│' : ' '}
              </span>
            ))}
            <span className="select-none text-[10px] text-gray-400 dark:text-gray-500 leading-6 pr-1 w-4 text-center">
              {isLast ? '└' : '├'}
            </span>
            <span className="select-none text-[10px] text-gray-400 dark:text-gray-500 leading-6 pr-1'>
              ──
            </span>
          </div>
        )}
        <button
          onClick={() => onNodeClick(viewNode.node)}
          className={clsx(
            'relative px-3 py-1.5 rounded-lg border transition-all text-xs flex flex-col items-center min-w-[90px]',
            isRoot ? 'bg-teal-500 text-white font-semibold' :
              darkMode ? 'bg-zinc-800 text-gray-100 border-zinc-700' : 'bg-white text-gray-900 border-gray-200',
          )}
        >
          <span dir="rtl" className={isRoot ? 'font-bold text-sm' : 'text-[11px]'}>{name}</span>
          <span className={clsx('text-[8px] opacity-70', isRoot ? 'text-white/80' : darkMode ? 'text-gray-400' : 'text-gray-500')}>
            {subname}
          </span>
        </button>
        {hasChildren && (
          <button
            onClick={() => toggleExpand(viewNode.id)}
            className={clsx(
              'ml-1 w-5 h-5 rounded-full text-[10px] flex items-center justify-center transition-colors',
              isExpanded ? 'bg-amber-400 text-zinc-900' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
            )}
          >
            {isExpanded ? '▼' : '▶'}
          </button>
        )}
        {hiddenChildren > 0 && !isExpanded && (
          <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
            +{hiddenChildren} more
          </span>
        )}
      </div>

      {isExpanded && shownChildren.map((childId, idx) => {
        const childVn = viewNodes.get(childId);
        if (!childVn) return null;
        const childIsLast = idx === shownChildren.length - 1;
        const newContinuations = [...continuations, !childIsLast];
        return (
          <NodeComponent
            key={childId}
            viewNode={childVn}
            viewNodes={viewNodes}
            nodeMap={nodeMap}
            expanded={expanded}
            toggleExpand={toggleExpand}
            depth={depth + 1}
            isLast={childIsLast}
            continuations={newContinuations}
            onNodeClick={onNodeClick}
            darkMode={darkMode}
            lang={lang}
          />
        );
      })}
    </div>
  );
}

export default function NarratorGraph({
  nodes: rawNodes, edges: rawEdges, centerId, darkMode, lang, onNodeClick,
}: Props) {
  const [processed, setProcessed] = useState<{ nodes: NarratorNode[]; edges: NarratorEdge[] } | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    let nodes = rawNodes.filter(isValidNarrator);
    const { mergedNodes, idMap } = mergeDuplicateNarrators(nodes);
    nodes = mergedNodes;
    const edges = rebuildEdges(rawEdges, idMap);
    setProcessed({ nodes, edges });
    setExpanded(new Set());
  }, [rawNodes, rawEdges, centerId]);

  const nodes = processed?.nodes ?? rawNodes;
  const edges = processed?.edges ?? rawEdges;

  const { viewNodes, nodeMap, totalNodes, totalEdges } = useMemo(
    () => buildViewModel(nodes, edges, centerId),
    [nodes, edges, centerId]
  );

  const centerVn = viewNodes.get(Number(centerId));

  const toggleExpand = useCallback((id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (!centerVn) {
    return (
      <div className={clsx(
        'bg-gray-50 dark:bg-zinc-950 overflow-auto rounded-2xl border border-gray-200 dark:border-zinc-800',
        'w-full p-4'
      )}>
        <div className="text-center text-gray-500 dark:text-gray-400 py-8">
          No chains found
        </div>
      </div>
    );
  }

  return (
    <div className={clsx(
      'bg-gray-50 dark:bg-zinc-950 overflow-auto rounded-2xl border border-gray-200 dark:border-zinc-800',
      'w-full p-4'
    )}>
      <div className="mb-3 text-xs text-gray-500 dark:text-gray-400">
        Showing {viewNodes.size} of {totalNodes} narrators · {totalEdges} transmission links
      </div>
      <NodeComponent
        viewNode={centerVn}
        viewNodes={viewNodes}
        nodeMap={nodeMap}
        expanded={expanded}
        toggleExpand={toggleExpand}
        depth={0}
        isLast={true}
        continuations={[]}
        onNodeClick={onNodeClick}
        darkMode={darkMode}
        lang={lang}
      />
    </div>
  );
}
