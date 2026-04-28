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

function convertToTree(edges: NarratorEdge[], nodes: NarratorNode[]) {
  const nodeSet = new Set(nodes.map(n => Number(n.id)));
  const treeEdges: NarratorEdge[] = [];
  const keptParents = new Set<number>();
  for (const e of edges) {
    const to = Number(e.to_narrator_id);
    const from = Number(e.from_narrator_id);
    if (!nodeSet.has(from) || !nodeSet.has(to)) continue;
    if (keptParents.has(to)) continue;
    treeEdges.push(e);
    keptParents.add(to);
  }
  return treeEdges;
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

function buildTree(chains: NarratorNode[][]): { root: TreeNode | null } {
  if (chains.length === 0) return { root: null };
  const nodeMap = new Map<number, NarratorNode>();
  for (const chain of chains) {
    for (const n of chain) nodeMap.set(Number(n.id), n);
  }
  const rootNode = chains[0][0];
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
  maxChains: number = 15
): NarratorNode[][] | null {
  const nodeMap = new Map(nodes.map(n => [Number(n.id), n]));
  const outgoing = new Map<number, number[]>();
  for (const e of edges) {
    const from = Number(e.from_narrator_id);
    const to = Number(e.to_narrator_id);
    if (!outgoing.has(from)) outgoing.set(from, []);
    outgoing.get(from)!.push(to);
  }
  const chains: NarratorNode[][] = [];
  const visitedInPath = new Set<number>();

  function dfs(currentId: number, path: NarratorNode[]): void {
    if (visitedInPath.has(currentId)) return;
    const current = nodeMap.get(currentId);
    if (!current) return;
    visitedInPath.add(currentId);
    const newPath = [...path, current];
    const children = outgoing.get(currentId) || [];
    if (children.length === 0) {
      chains.push(newPath);
    } else {
      for (const childId of children) {
        if (chains.length >= maxChains) return;
        dfs(childId, newPath);
      }
    }
    visitedInPath.delete(currentId);
  }

  dfs(Number(centerId), []);
  return chains.length > 0 ? chains : null;
}

export default function NarratorGraph({
  nodes: rawNodes, edges: rawEdges, centerId, darkMode, lang, onNodeClick,
}: Props) {
  const [processed, setProcessed] = useState<{ nodes: NarratorNode[]; edges: NarratorEdge[] } | null>(null);

  useEffect(() => {
    let nodes = rawNodes.filter(isValidNarrator);
    const { mergedNodes, idMap } = mergeDuplicateNarrators(nodes);
    nodes = mergedNodes;
    const edges = rebuildEdges(rawEdges, idMap);
    const treeEdges = convertToTree(edges, nodes);
    setProcessed({ nodes, edges: treeEdges });
  }, [rawNodes, rawEdges]);

  const nodes = processed?.nodes ?? rawNodes;
  const edges = processed?.edges ?? rawEdges;

  const chains = useMemo(
    () => extractChains(nodes, edges, centerId, 50),
    [nodes, edges, centerId]
  );

  const { root: treeRoot } = useMemo(() => chains ? buildTree(chains) : { root: null }, [chains]);

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

  function TreeNodeComponent({ treeNode, depth, isLast, continuations }: { treeNode: TreeNode; depth: number; isLast: boolean; continuations: boolean[] }) {
    const n = treeNode.node;
    const hasChildren = treeNode.children.size > 0;
    const isExpanded = expanded.has(treeNode.id);
    const isRoot = depth === 0;
    const childrenArray = Array.from(treeNode.children.values());

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
              <span className="select-none text-[10px] text-gray-400 dark:text-gray-500 leading-6 pr-1">
                ──
              </span>
            </div>
          )}
          <button
            onClick={() => hasChildren && toggleExpand(treeNode.id)}
            className={clsx(
              'relative px-3 py-1.5 rounded-lg border transition-all text-xs flex flex-col items-center min-w-[90px]',
              isRoot ? 'bg-teal-500 text-white font-semibold' :
                darkMode ? 'bg-zinc-800 text-gray-100 border-zinc-700' : 'bg-white text-gray-900 border-gray-200',
              hasChildren ? 'cursor-pointer' : 'cursor-default'
            )}
          >
            <span dir="rtl" className={isRoot ? 'font-bold text-sm' : 'text-[11px]'}>{n.name_ar}</span>
            <span className={clsx('text-[8px] opacity-70', isRoot ? 'text-white/80' : darkMode ? 'text-gray-400' : 'text-gray-500')}>
              {lang === 'bn' ? (n.name_bn ?? n.name_en) : (n.name_en ?? n.name_bn)}
            </span>
          </button>
          {!hasChildren && (
            <button
              onClick={() => onNodeClick(n)}
              className="ml-1 w-5 h-5 rounded-full bg-teal-500 text-white text-[10px] flex items-center justify-center hover:bg-teal-600 transition-colors"
              title="View narrator"
            >
              ↗
            </button>
          )}
          {hasChildren && (
            <button
              onClick={() => toggleExpand(treeNode.id)}
              className={clsx(
                'ml-1 w-5 h-5 rounded-full text-[10px] flex items-center justify-center transition-colors',
                isExpanded ? 'bg-amber-400 text-zinc-900' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
              )}
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div className="flex flex-col gap-1 mt-1">
            {childrenArray.map((child, idx) => {
              const childIsLast = idx === childrenArray.length - 1;
              const newContinuations = [...continuations, !childIsLast];
              return (
                <TreeNodeComponent
                  key={child.id}
                  treeNode={child}
                  depth={depth + 1}
                  isLast={childIsLast}
                  continuations={newContinuations}
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
        <TreeNodeComponent treeNode={treeRoot} depth={0} isLast={true} continuations={[]} />
      ) : (
        <div className="text-center text-gray-500 dark:text-gray-400 py-8">
          No chains found
        </div>
      )}
    </div>
  );
}
