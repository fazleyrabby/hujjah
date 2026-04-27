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
  const incoming = new Map<number, NarratorEdge[]>();
  for (const e of edges) {
    const to = Number(e.to_narrator_id);
    if (!incoming.has(to)) incoming.set(to, []);
    incoming.get(to)!.push(e);
  }
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

const NODE_W = 180;
const NODE_H = 70;
const ROW_GAP = 100;
const COL_GAP = 20;

const REL_BORDER: Record<string, string> = {
  thiqah: '#34d399',
  saduq:  '#60a5fa',
  daif:   '#fb923c',
  mawdu:  '#f43f5e',
};

const CHAR_MAP: Record<string, string> = {
  'ا':'a','أ':'a','إ':'i','آ':'a','ء':"'",'ب':'b','ت':'t','ث':'th',
  'ج':'j','ح':'h','خ':'kh','د':'d','ذ':'dh','ر':'r','ز':'z','س':'s',
  'ش':'sh','ص':'s','ض':'d','ط':'t','ظ':'z','ع':"'",'غ':'gh','ف':'f',
  'ق':'q','ك':'k','ل':'l','م':'m','ن':'n','ه':'h','و':'w','ي':'y',
  'ى':'a','ة':'a',
};

function transliterate(text: string): string {
  const clean = text.replace(/[\u064B-\u0652\u0670\u0640]/g, '').trim();
  return [...clean].map(c => CHAR_MAP[c] ?? c).join('');
}

interface TreeNode {
  id: number;
  node: NarratorNode;
  children: Map<number, TreeNode>;
}

function buildTree(chains: NarratorNode[][]): { root: TreeNode | null; allNodes: Map<number, TreeNode> } {
  if (chains.length === 0) return { root: null, allNodes: new Map() };
  const nodeMap = new Map<number, NarratorNode>();
  for (const chain of chains) {
    for (const n of chain) nodeMap.set(Number(n.id), n);
  }
  const rootNode = chains[0][0];
  const rootId = Number(rootNode.id);
  const root: TreeNode = { id: rootId, node: rootNode, children: new Map() };
  const allNodes = new Map<number, TreeNode>();
  allNodes.set(rootId, root);

  for (const chain of chains) {
    let parent = root;
    for (let i = 1; i < chain.length; i++) {
      const n = chain[i];
      const nid = Number(n.id);
      if (!parent.children.has(nid)) {
        const treeNode: TreeNode = { id: nid, node: n, children: new Map() };
        parent.children.set(nid, treeNode);
        allNodes.set(nid, treeNode);
      }
      parent = allNodes.get(nid)!;
    }
  }
  return { root, allNodes };
}

function flattenTree(
  node: TreeNode,
  expanded: Set<number>,
  result: { node: TreeNode; depth: number }[]
): void {
  result.push({ node, depth: result.length });
  if (expanded.has(node.id)) {
    for (const child of node.children.values()) {
      flattenTree(child, expanded, result);
    }
  }
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
  const [selectedId, setSelectedId] = useState<number | null>(null);
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
    () => extractChains(nodes, edges, centerId, 15),
    [nodes, edges, centerId]
  );

  const expandState = React.useRef(new Set<number>());

  const { root: treeRoot, allNodes } = useMemo(() => chains ? buildTree(chains) : { root: null, allNodes: new Map() }, [chains]);

  const defaultExpanded = React.useMemo(() => {
    if (!treeRoot) return new Set<number>();
    const ids = new Set<number>();
    for (const child of treeRoot.children.values()) ids.add(child.id);
    return ids;
  }, [treeRoot]);

  const [expanded, setExpanded] = useState<Set<number>>(() => defaultExpanded);

  const flatNodes = useMemo(() => {
    if (!treeRoot) return [];
    const result: { node: TreeNode; depth: number }[] = [];
    function recurse(n: TreeNode, depth: number) {
      result.push({ node: n, depth });
      if (expanded.has(n.id)) {
        for (const child of n.children.values()) recurse(child, depth + 1);
      }
    }
    recurse(treeRoot, 0);
    return result;
  }, [treeRoot, expanded]);

const toggleExpand = (id: number) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  const renderNode = (item: { node: TreeNode; depth: number }) => {
    const treeNode = item.node;
    const n = treeNode.node;
    const depth = item.depth;
    const hasChildren = treeNode.children.size > 0;
    const isExpanded = expanded.has(treeNode.id);
    const isRoot = depth === 0;

    return (
      <div key={`${depth}-${n.id}`}>
        <div className="flex items-center gap-1">
          {depth > 0 && <span className="w-4 text-center text-gray-400 dark:text-gray-500 text-sm">├──</span>}
          <button
            onClick={() => hasChildren && toggleExpand(treeNode.id)}
            className={clsx(
              'relative px-3 py-2 rounded-lg border-2 transition-all text-xs flex flex-col items-center min-w-[100px] shadow-sm',
              isRoot ? 'bg-teal-500 text-white font-semibold cursor-default' : 
                darkMode ? 'bg-zinc-800 text-gray-100' : 'bg-white text-gray-900',
              hasChildren ? 'cursor-pointer' : 'cursor-default'
            )}
            style={{ borderColor: n.reliability ? REL_BORDER[n.reliability] : (darkMode ? '#3f3f46' : '#e5e7eb') }}
          >
            <span dir="rtl" className={isRoot ? 'font-bold' : ''}>{n.name_ar}</span>
            <span className={clsx('text-[9px] mt-0.5 opacity-75', isRoot ? 'text-white' : darkMode ? 'text-gray-400' : 'text-gray-500')}>
              {lang === 'bn' ? (n.name_bn ?? n.name_en) : (n.name_en ?? n.name_bn)}
            </span>
            {hasChildren && (
              <span className="absolute -right-3 -top-1 w-4 h-4 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-[8px] text-gray-600 dark:text-gray-300">
                {treeNode.children.size}
              </span>
            )}
          </button>
          {!hasChildren && (
            <button
              onClick={() => onNodeClick(n)}
              className="ml-1 w-6 h-6 rounded-full bg-teal-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-teal-600 hover:scale-110"
              title="View narrator"
            >
              ↗
            </button>
          )}
          {hasChildren && (
            <button
              onClick={() => toggleExpand(treeNode.id)}
              className={clsx(
                'ml-1 w-6 h-6 rounded-full text-xs flex items-center justify-center transition-all',
                isExpanded ? 'bg-amber-400 text-zinc-900' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 group-hover:opacity-100 opacity-0'
              )}
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div className="ml-6 pl-4 relative border-l-2 border-gray-200 dark:border-gray-700">
            {Array.from(treeNode.children.values()).map((child, idx) => 
              renderNode({ node: child, depth: depth + 1 })
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={clsx(
      'bg-gray-50 dark:bg-zinc-950 overflow-auto rounded-2xl border border-gray-200 dark:border-zinc-800',
      'w-full p-4'
    )}>
      {treeRoot ? (
        <div className="flex flex-col gap-0.5">
          {renderNode({ node: treeRoot, depth: 0 })}
        </div>
      ) : (
        <div className="text-center text-gray-500 dark:text-gray-400 py-8">
          No chains found
        </div>
      )}
    </div>
  );
}
