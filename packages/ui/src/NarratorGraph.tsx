'use client';

import React, { useMemo, useState, useEffect } from 'react';
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

interface Props {
  nodes: NarratorNode[];
  edges: NarratorEdge[];
  centerId: number;
  darkMode: boolean;
  lang: 'en' | 'bn' | 'ar';
  onNodeClick: (node: NarratorNode) => void;
}

interface TreeNode {
  id: number;
  node: NarratorNode;
  children: Map<number, TreeNode>;
}

function buildTree(chains: NarratorNode[][], centerId: number): { root: TreeNode | null } {
  if (chains.length === 0) return { root: null };
  const nodeMap = new Map<number, NarratorNode>();
  for (const chain of chains) {
    for (const n of chain) nodeMap.set(Number(n.id), n);
  }
  const center = nodeMap.get(Number(centerId));
  const rootNode = center || chains[0][0];
  const rootId = Number(rootNode.id);
  const root: TreeNode = { id: rootId, node: rootNode, children: new Map() };

  for (const chain of chains) {
    let parent = root;
    for (let i = 1; i < chain.length; i++) {
      const n = chain[i];
      const nid = Number(n.id);
      if (!parent.children.has(nid)) {
        const treeNode: TreeNode = { id: nid, node: n, children: new Map() };
        parent.children.set(nid, treeNode);
      }
      parent = parent.children.get(nid)!;
    }
  }
  return { root };
}

function extractChains(
  nodes: NarratorNode[],
  edges: NarratorEdge[],
  centerId: number,
  maxChains: number = 50
): NarratorNode[][] | null {
  const nodeMap = new Map(nodes.map(n => [Number(n.id), n]));
  const outgoing = new Map<number, number[]>();
  const incoming = new Map<number, number[]>();
  for (const e of edges) {
    const from = Number(e.from_narrator_id);
    const to = Number(e.to_narrator_id);
    if (!outgoing.has(from)) outgoing.set(from, []);
    outgoing.get(from)!.push(to);
    if (!incoming.has(to)) incoming.set(to, []);
    incoming.get(to)!.push(from);
  }
  const chains: NarratorNode[][] = [];

  function dfs(currentId: number, path: NarratorNode[], followOutgoing: boolean, visited: Set<number>): void {
    if (visited.has(currentId)) return;
    if (chains.length >= maxChains) return;
    const current = nodeMap.get(currentId);
    if (!current) return;
    visited.add(currentId);
    const newPath = [...path, current];
    const children = followOutgoing
      ? (outgoing.get(currentId) || [])
      : (incoming.get(currentId) || []);
    if (children.length === 0) {
      chains.push(newPath);
    } else {
      for (const childId of children) {
        dfs(childId, newPath, followOutgoing, visited);
      }
    }
  }

  const visitedOut = new Set<number>();
  dfs(Number(centerId), [], true, visitedOut);
  const visitedIn = new Set<number>();
  dfs(Number(centerId), [], false, visitedIn);
  return chains.length > 0 ? chains : null;
}

export default function NarratorGraph({
  nodes: rawNodes, edges: rawEdges, centerId, darkMode, lang, onNodeClick,
}: Props) {
  const [processed, setProcessed] = useState<{ nodes: NarratorNode[]; edges: NarratorEdge[] } | null>(null);
  const [hoveredNode, setHoveredNode] = useState<number | null>(null);

  useEffect(() => {
    let nodes = rawNodes.filter(isValidNarrator);
    const { mergedNodes, idMap } = mergeDuplicateNarrators(nodes);
    nodes = mergedNodes;
    const edges = rebuildEdges(rawEdges, idMap);
    setProcessed({ nodes, edges });
  }, [rawNodes, rawEdges]);

  const nodes = processed?.nodes ?? rawNodes;
  const edges = processed?.edges ?? rawEdges;

  const chains = useMemo(
    () => extractChains(nodes, edges, centerId, 50),
    [nodes, edges, centerId]
  );

  const { root: treeRoot } = useMemo(() => chains ? buildTree(chains, centerId) : { root: null }, [chains, centerId]);

  const defaultExpanded = useMemo(() => {
    if (!treeRoot) return new Set<number>();
    const ids = new Set<number>();
    for (const child of treeRoot.children.values()) ids.add(child.id);
    return ids;
  }, [treeRoot]);

  const [expanded, setExpanded] = useState<Set<number>>(() => defaultExpanded);

  const toggleExpand = (id: number) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  function TreeNodeComponent({
    treeNode,
    depth,
    isLast,
    path,
  }: {
    treeNode: TreeNode;
    depth: number;
    isLast: boolean;
    path: number[];
  }) {
    const n = treeNode.node;
    const hasChildren = treeNode.children.size > 0;
    const isExpanded = expanded.has(treeNode.id);
    const isRoot = depth === 0;
    const childrenArray = Array.from(treeNode.children.values());
    const currentPath = [...path, treeNode.id];

    const isHovered = hoveredNode === treeNode.id;

    // highlight node + its ancestors when hovering descendant
    const isInPath =
      hoveredNode !== null &&
      (treeNode.id === hoveredNode || path.includes(hoveredNode));

    const isDimmed = hoveredNode !== null && !isHovered && !isInPath;

    return (
      <div className="flex flex-col">
        <div className="flex items-start">
          {/* Connector lines */}
          {depth > 0 && (
            <div className="relative flex items-start pt-3 mr-1">
              {/* Vertical line from parent */}
              <div
                className={clsx(
                  'absolute left-0 top-0 bottom-0 w-px -translate-x-1/2',
                  isHovered || isInPath
                    ? 'bg-amber-400'
                    : 'bg-gray-300 dark:bg-gray-700'
                )}
              />
              {/* Horizontal branch line */}
              <div
                className={clsx(
                  'absolute left-0 top-3 w-3 h-px -translate-x-1/2',
                  isHovered || isInPath
                    ? 'bg-amber-400'
                    : 'bg-gray-300 dark:bg-gray-700'
                )}
              />
              {/* Continuation line indicator for siblings below */}
              {!isLast && (
                <div
                  className={clsx(
                    'absolute left-0 top-3 bottom-0 w-px -translate-x-1/2',
                    isHovered || isInPath
                      ? 'bg-amber-400'
                      : 'bg-gray-300 dark:bg-gray-700'
                  )}
                />
              )}
              <div className="w-3" />
            </div>
          )}

          <div className="flex items-center">
            {/* Main node button */}
            <button
              onClick={() => onNodeClick(n)}
              onMouseEnter={() => setHoveredNode(treeNode.id)}
              onMouseLeave={() => setHoveredNode(null)}
              className={clsx(
                'relative px-3 py-1.5 rounded-lg border transition-all duration-200 text-xs flex flex-col items-center min-w-[90px]',
                isRoot
                  ? 'bg-teal-500 text-white font-semibold shadow-lg'
                  : isHovered
                    ? 'ring-2 ring-amber-400 scale-105 bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-zinc-700 shadow-md'
                    : isInPath
                      ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 shadow-sm'
                      : darkMode
                        ? 'bg-zinc-800 text-gray-100 border-zinc-700 hover:bg-zinc-700'
                        : 'bg-white text-gray-900 border-gray-200 hover:bg-gray-50',
                isDimmed && 'opacity-30',
              )}
            >
              <span dir="rtl" className={isRoot ? 'font-bold text-sm' : 'text-[11px]'}>
                {n.name_ar}
              </span>
              <span className={clsx(
                'text-[8px] opacity-70',
                isRoot ? 'text-white/80' : darkMode ? 'text-gray-400' : 'text-gray-500'
              )}>
                {lang === 'bn' ? (n.name_bn ?? n.name_en) : (n.name_en ?? n.name_bn)}
              </span>
            </button>

            {/* Expand toggle */}
            {hasChildren && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(treeNode.id);
                }}
                className={clsx(
                  'ml-1.5 w-5 h-5 rounded-full text-[10px] flex items-center justify-center transition-colors shrink-0',
                  isExpanded
                    ? 'bg-amber-400 text-zinc-900'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                )}
              >
                {isExpanded ? '▼' : '▶'}
              </button>
            )}
          </div>
        </div>

        {/* Children */}
        {hasChildren && (
          <div
            className={clsx(
              'overflow-hidden transition-all duration-200 ease-out',
              isExpanded ? 'max-h-[2000px] opacity-100 mt-1' : 'max-h-0 opacity-0'
            )}
          >
            {childrenArray.map((child, idx) => {
              const childIsLast = idx === childrenArray.length - 1;
              return (
                <TreeNodeComponent
                  key={child.id}
                  treeNode={child}
                  depth={depth + 1}
                  isLast={childIsLast}
                  path={currentPath}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={clsx(
      'bg-gray-50 dark:bg-zinc-950 overflow-auto rounded-2xl border border-gray-200 dark:border-zinc-800',
      'w-full p-4'
    )}>
      {treeRoot ? (
        <TreeNodeComponent treeNode={treeRoot} depth={0} isLast={true} path={[]} />
      ) : (
        <div className="text-center text-gray-500 dark:text-gray-400 py-8">
          No chains found
        </div>
      )}
    </div>
  );
}
