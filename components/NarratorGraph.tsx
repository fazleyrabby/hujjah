'use client';

/**
 * components/NarratorGraph.tsx
 *
 * Force-directed graph for sanad chain visualization.
 * Nodes colored by tabaqah (generation), sized by degree.
 * Uses react-force-graph-2d, loaded dynamically (SSR-safe).
 */

import dynamic from 'next/dynamic';
import { useRef, useCallback, useMemo } from 'react';
import type { NarratorNode, NarratorEdge } from '@/lib/chain-db';

// SSR-safe dynamic import
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

// ─── Tabaqah config ───────────────────────────────────────────────────────────

const TABAQAH_COLORS: Record<number, string> = {
  1: '#10b981', // Sahaba — teal/green
  2: '#3b82f6', // Tabi'un — blue
  3: '#8b5cf6', // Tabi' al-Tabi'in — purple
  4: '#f59e0b', // Later scholars — amber
};
const TABAQAH_LABELS: Record<number, string> = {
  1: "Sahaba",
  2: "Tabi'un",
  3: "Tabi' al-Tabi'in",
  4: "Later Scholar",
};
const DEFAULT_NODE_COLOR = '#6b7280'; // gray for unknown

// ─── Types ───────────────────────────────────────────────────────────────────

interface GraphNode extends NarratorNode {
  // react-force-graph adds x/y at runtime
  x?: number;
  y?: number;
  degree?: number;
}

interface GraphLink {
  source: number;
  target: number;
  hadith_count: number;
}

interface Props {
  nodes: NarratorNode[];
  edges: NarratorEdge[];
  centerId: number;
  darkMode: boolean;
  onNodeClick: (node: NarratorNode) => void;
  width?: number;
  height?: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function NarratorGraph({
  nodes,
  edges,
  centerId,
  darkMode,
  onNodeClick,
  width = 600,
  height = 420,
}: Props) {
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Compute degree map for node sizing
  const degreeMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const e of edges) {
      m.set(e.from_narrator_id, (m.get(e.from_narrator_id) ?? 0) + 1);
      m.set(e.to_narrator_id, (m.get(e.to_narrator_id) ?? 0) + 1);
    }
    return m;
  }, [edges]);

  // Build graph data for react-force-graph
  const graphData = useMemo(() => ({
    nodes: nodes.map((n) => ({ ...n, degree: degreeMap.get(n.id) ?? 1 })) as GraphNode[],
    links: edges.map((e) => ({
      source: e.from_narrator_id,
      target: e.to_narrator_id,
      hadith_count: e.hadith_count,
    })) as GraphLink[],
  }), [nodes, edges, degreeMap]);

  // Node color by tabaqah
  const nodeColor = useCallback((node: GraphNode) => {
    if (node.id === centerId) return '#0d9488'; // teal for center
    return TABAQAH_COLORS[node.tabaqah ?? 0] ?? DEFAULT_NODE_COLOR;
  }, [centerId]);

  // Node size by degree
  const nodeSize = useCallback((node: GraphNode) => {
    if (node.id === centerId) return 8;
    return 4 + Math.sqrt(node.degree ?? 1);
  }, [centerId]);

  // Edge width by hadith count
  const linkWidth = useCallback((link: GraphLink) => {
    return Math.max(1, Math.log(link.hadith_count + 1));
  }, []);

  // Tooltip on hover
  const handleNodeHover = useCallback((node: GraphNode | null) => {
    const tip = tooltipRef.current;
    if (!tip) return;
    if (!node) {
      tip.style.display = 'none';
      return;
    }
    const tabLabel = node.tabaqah ? TABAQAH_LABELS[node.tabaqah] ?? '' : '';
    const deathStr = node.death_year ? `d. ${node.death_year} AH` : '';
    const bnName = node.name_bn ? `<div class="text-teal-400 text-xs mt-0.5">${node.name_bn}</div>` : '';
    const sourceBadge = node.data_source ? `<span class="text-gray-500 text-[10px] ml-1">(${node.data_source})</span>` : '';
    const metaParts = [tabLabel, deathStr].filter(Boolean);
    tip.innerHTML = `
      <div class="font-semibold text-right" dir="rtl">${node.name_ar}${sourceBadge}</div>
      ${node.name_en ? `<div class="text-gray-300 text-xs mt-0.5">${node.name_en}</div>` : ''}
      ${bnName}
      ${metaParts.length ? `<div class="text-gray-400 text-xs mt-0.5">${metaParts.join(' · ')}</div>` : ''}
    `;
    tip.style.display = 'block';
  }, []);

  const handleNodeClick = useCallback((node: GraphNode) => {
    onNodeClick(node);
  }, [onNodeClick]);

  const bg = darkMode ? '#18181b' : '#f9fafb';
  const linkColor = darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';

  return (
    <div className="relative" style={{ width, height }}>
      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="hidden absolute z-10 bg-zinc-800 text-white text-xs px-3 py-2 rounded-lg shadow-lg pointer-events-none max-w-[200px]"
        style={{ top: 8, left: 8 }}
      />

      {/* Legend */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1 bg-white/80 dark:bg-zinc-900/80 rounded-lg px-2 py-1.5 text-xs backdrop-blur-sm">
        {Object.entries(TABAQAH_LABELS).map(([k, label]) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: TABAQAH_COLORS[Number(k)] }} />
            <span className="text-gray-600 dark:text-gray-400">{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: DEFAULT_NODE_COLOR }} />
          <span className="text-gray-600 dark:text-gray-400">Unknown</span>
        </div>
      </div>

      <ForceGraph2D
        graphData={graphData}
        width={width}
        height={height}
        backgroundColor={bg}
        nodeVal={nodeSize as (node: object) => number}
        nodeColor={nodeColor as (node: object) => string}
        nodeLabel=""
        linkWidth={linkWidth as (link: object) => number}
        linkColor={() => linkColor}
        onNodeClick={handleNodeClick as (node: object) => void}
        onNodeHover={handleNodeHover as (node: object | null) => void}
        cooldownTicks={80}
        enableNodeDrag
        enableZoomInteraction
      />
    </div>
  );
}
