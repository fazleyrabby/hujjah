'use client';

import { useCallback, useEffect, useRef, useState, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams as useNextSearchParams } from 'next/navigation';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  BackgroundVariant,
  Panel,
  useReactFlow,
  ReactFlowProvider,
  type NodeTypes,
  type EdgeTypes,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useGraphStore } from './useGraphStore';
import { MapNode } from './MapNode';
import { MapEdge } from './MapEdge';
import type { NarratorNode } from '@hujjah/ui';

interface ChainMapViewProps {
  initialNarratorId?: number;
  lang?: 'en' | 'bn' | 'ar';
  darkMode?: boolean;
  onNodeClick?: (node: NarratorNode) => void;
}

const MAP_I18N = {
  en: {
    searchPlaceholder: 'Search narrator...',
    searching: 'Searching...',
    noResults: 'No narrator found',
    expand: 'Click node to expand neighbors',
    teachers: 'Teachers',
    students: 'Students',
  },
  bn: {
    searchPlaceholder: 'রাবী খুঁজুন...',
    searching: 'খুঁজছি...',
    noResults: 'রাবী পাওয়া যায়নি',
    expand: 'প্রতিবেশী দেখতে নোডে ক্লিক করুন',
    teachers: 'শায়খগণ',
    students: 'ছাত্রগণ',
  },
  ar: {
    searchPlaceholder: 'ابحث عن الراوي...',
    searching: 'جارٍ البحث...',
    noResults: 'لم يُعثر على راوٍ',
    expand: 'انقر على العقدة لتوسيع الجيران',
    teachers: 'الشيوخ',
    students: 'التلاميذ',
  },
};

function GraphContent({ initialNarratorId, lang = 'en', darkMode = false, onNodeClick }: ChainMapViewProps) {
  const router = useRouter();
  const searchParams = useNextSearchParams();
  const [narratorId, setNarratorId] = useState<number | null>(null);
  const [centerNode, setCenterNode] = useState<NarratorNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NarratorNode[]>([]);
  const [searching, setSearching] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { fitView, setCenter, getViewport } = useReactFlow();

  const {
    nodes: storeNodes,
    edges: storeEdges,
    loading,
    loadingNodeIds,
    hoveredNodeId,
    focusedNodeId,
    expandedNodes,
    loadNeighbors,
    setHoveredNode,
    setFocusedNode,
    initGraph,
    clearGraph,
  } = useGraphStore();

  const t = MAP_I18N[lang];

  // Convert store nodes/edges to React Flow format
  const flowNodes = useMemo((): Node[] => {
    return Array.from(storeNodes.values()).map(n => {
      const isHovered = hoveredNodeId === n.id;
      const isFocused = focusedNodeId === n.id;
      const isLoading = loadingNodeIds.has(n.id);
      const isExpanded = expandedNodes.has(n.id);

      return {
        id: String(n.id),
        position: { x: n.x ?? 0, y: n.y ?? 0 },
        data: {
          ...n,
          isHovered,
          isFocused,
          isLoading,
          isExpanded,
          lang,
          darkMode,
          onHover: setHoveredNode,
          onClick: () => {
            setFocusedNode(n.id);
            onNodeClick?.(n);
          },
          onExpand: async () => {
            if (!expandedNodes.has(n.id) && !loadingNodeIds.has(n.id)) {
              const pos = { x: n.x ?? 0, y: n.y ?? 0 };
              await loadNeighbors(n.id, pos.x, pos.y, 1);
            }
          },
        },
        draggable: true,
        type: 'mapNode',
      };
    });
  }, [storeNodes, hoveredNodeId, focusedNodeId, loadingNodeIds, expandedNodes, lang, darkMode, setHoveredNode, setFocusedNode, loadNeighbors, onNodeClick]);

  const flowEdges = useMemo((): Edge[] => {
    return Array.from(storeEdges.values()).map(e => {
      const isRelated = hoveredNodeId !== null && (
        e.source === hoveredNodeId || e.target === hoveredNodeId
      );

      return {
        id: `${e.source}-${e.target}`,
        source: String(e.source),
        target: String(e.target),
        type: 'mapEdge',
        data: {
          hadithCount: e.hadith_count,
          isRelated,
          darkMode,
        },
        animated: false,
        style: {
          strokeWidth: isRelated ? 2.5 : 1,
        },
      };
    });
  }, [storeEdges, hoveredNodeId, darkMode]);

  // Load initial narrator
  useEffect(() => {
    const id = initialNarratorId ?? (searchParams.get('id') ? Number(searchParams.get('id')) : null);
    if (!id) return;
    setNarratorId(id);

    fetch(`/api/chain?action=narrator&id=${id}`)
      .then(r => r.json())
      .then(async (n: NarratorNode) => {
        if (!n) return;
        setCenterNode(n);

        // Load neighbors
        const data = await fetch(`/api/chain?action=neighbors&id=${id}&depth=1&limit=15`).then(r => r.json());
        initGraph(n, data, 0, 0);
      })
      .catch(console.error);
  }, [initialNarratorId, searchParams, initGraph]);

  // Center on focused node
  useEffect(() => {
    if (!focusedNodeId) return;
    const node = storeNodes.get(focusedNodeId);
    if (!node || !reactFlowWrapper.current) return;

    setCenter(node.x ?? 0, node.y ?? 0, { zoom: 1, duration: 500 });
  }, [focusedNodeId, storeNodes, setCenter]);

  // Handle search
  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); return; }

    setSearching(true);
    try {
      const res = await fetch(`/api/chain?action=search&q=${encodeURIComponent(q)}&limit=8`);
      const rows: NarratorNode[] = await res.json();
      setSearchResults(rows);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSelectSearchResult = useCallback(async (n: NarratorNode) => {
    setCenterNode(n);
    setNarratorId(n.id);
    setSearchResults([]);
    setSearchQuery('');
    router.push(`/chain/map?id=${n.id}`);

    // Load neighbors for new narrator
    const data = await fetch(`/api/chain?action=neighbors&id=${n.id}&depth=1&limit=15`).then(r => r.json());
    clearGraph();
    initGraph(n, data, 0, 0);
    
    setTimeout(() => fitView({ padding: 0.2, duration: 500 }), 100);
  }, [router, initGraph, clearGraph, fitView]);

  const nodeTypes: NodeTypes = useMemo(() => ({ mapNode: MapNode as unknown as NodeTypes['mapNode'] }), []);
  const edgeTypes: EdgeTypes = useMemo(() => ({ mapEdge: MapEdge as unknown as EdgeTypes['mapEdge'] }), []);

  return (
    <div className="w-full h-full relative" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        proOptions={{ hideAttribution: true }}
        className={darkMode ? 'dark' : ''}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color={darkMode ? '#3f3f46' : '#e5e7eb'}
        />
        <Controls className="!rounded-lg !shadow-lg border border-gray-200 dark:border-zinc-700" />
        <MiniMap
          className="!rounded-lg !shadow-lg border border-gray-200 dark:border-zinc-700"
          nodeColor={(n) => {
            if (n.id === String(focusedNodeId)) return darkMode ? '#0d9488' : '#14b8a6';
            if (n.id === String(hoveredNodeId)) return darkMode ? '#0f766e' : '#0d9488';
            return darkMode ? '#3f3f46' : '#d1d5db';
          }}
          maskColor={darkMode ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.1)'}
        />

        {/* Top search bar */}
        <Panel position="top-left" className="w-full max-w-sm p-2">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              placeholder={t.searchPlaceholder}
              className={`w-full px-4 py-2.5 pl-10 rounded-xl border text-sm shadow-lg
                ${darkMode
                  ? 'bg-zinc-900 border-zinc-700 text-white placeholder-gray-500'
                  : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'
                } focus:outline-none focus:ring-2 focus:ring-teal-500`}
            />
            <svg
              className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searching && (
              <div className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin`} />
            )}
          </div>

          {/* Search results dropdown */}
          {searchResults.length > 0 && (
            <div className={`mt-1 rounded-xl border shadow-xl overflow-hidden ${
              darkMode ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-gray-200'
            }`}>
              {searchResults.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleSelectSearchResult(n)}
                  className={`w-full px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors border-b border-gray-100 dark:border-zinc-800 last:border-0 ${
                    darkMode ? 'text-white' : 'text-gray-900'
                  }`}
                >
                  <p className="font-medium text-sm" dir="rtl">{n.name_ar}</p>
                  {(n as any).name_en && (
                    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{(n as any).name_en}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </Panel>

        {/* Legend / Hint */}
        <Panel position="bottom-left" className="p-2">
          <div className={`text-[10px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {t.expand}
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

function GraphContentWrapper(props: ChainMapViewProps) {
  return (
    <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" /></div>}>
      <GraphContent {...props} />
    </Suspense>
  );
}

export default function ChainMapView(props: ChainMapViewProps) {
  return (
    <ReactFlowProvider>
      <GraphContentWrapper {...props} />
    </ReactFlowProvider>
  );
}
