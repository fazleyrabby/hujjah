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
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { clsx } from 'clsx';

import { MapNode } from './MapNode';
import { MapEdge } from './MapEdge';
import type { NarratorNode, NarratorEdge } from '@hujjah/ui';

interface ChainMapViewProps {
  initialNarratorId?: number;
  lang?: 'en' | 'bn' | 'ar';
  darkMode?: boolean;
  onNodeClick?: (node: NarratorNode) => void;
}

interface GraphNeighborResponse {
  nodes: NarratorNode[];
  edges: NarratorEdge[];
}

const MAP_I18N = {
  en: {
    searchPlaceholder: 'Search narrator...',
    noResults: 'No narrator found',
    expand: 'Double-click node to expand',
    spread: 'Spread',
    zoom: 'Zoom',
    levels: 'Levels',
  },
  bn: {
    searchPlaceholder: 'রাবী খুঁজুন...',
    noResults: 'রাবী পাওয়া যায়নি',
    expand: 'প্রতিবেশী দেখতে নোডে ডাবল ক্লিক করুন',
    spread: 'স্প্রেড',
    zoom: 'জুম',
    levels: 'স্তর',
  },
  ar: {
    searchPlaceholder: 'ابحث عن الراوي...',
    noResults: 'لم يُعثر على راوٍ',
    expand: 'انقر نقراً مزدوجاً لتوسيع الجيران',
    spread: 'الانتشار',
    zoom: 'تكبير',
    levels: 'مستويات',
  },
};

interface GraphState {
  nodes: Map<number, { x: number; y: number; data: NarratorNode; level: number }>;
  edges: Map<string, { source: number; target: number; data: NarratorEdge }>;
  loadingNodeIds: Set<number>;
  hoveredNodeId: number | null;
}

function GraphContent({ initialNarratorId, lang = 'en', darkMode = false, onNodeClick }: ChainMapViewProps) {
  const router = useRouter();
  const searchParams = useNextSearchParams();
  const [graphState, setGraphState] = useState<GraphState>({
    nodes: new Map(),
    edges: new Map(),
    loadingNodeIds: new Set(),
    hoveredNodeId: null,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NarratorNode[]>([]);
  const [searching, setSearching] = useState(false);
  const [centerId, setCenterId] = useState<number | null>(null);
  const [spread, setSpread] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [levels, setLevels] = useState(2);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { fitView } = useReactFlow();

  const t = MAP_I18N[lang];

  // Load graph with specified depth and limit
  const loadGraph = useCallback(async (narratorId: number, clearExisting: boolean = false, depth: number = 2) => {
    if (clearExisting) {
      setGraphState({
        nodes: new Map(),
        edges: new Map(),
        loadingNodeIds: new Set(),
        hoveredNodeId: null,
      });
    }

    setGraphState(prev => ({
      ...prev,
      loadingNodeIds: new Set([...prev.loadingNodeIds, narratorId]),
    }));

    try {
      const [narratorRes, neighborsRes] = await Promise.all([
        fetch(`/api/chain?action=narrator&id=${narratorId}`),
        fetch(`/api/chain?action=neighbors&id=${narratorId}&depth=${depth}&limit=20`),
      ]);

      const narrator: NarratorNode = await narratorRes.json();
      const neighbors: GraphNeighborResponse = await neighborsRes.json();

      if (!narrator) {
        console.error('Narrator not found:', narratorId);
        return;
      }

      const newNodes = new Map<number, { x: number; y: number; data: NarratorNode; level: number }>();
      const newEdges = new Map<string, { source: number; target: number; data: NarratorEdge }>();

      // Center node at (0, 0)
      const centerX = 0;
      const centerY = 0;
      newNodes.set(narrator.id, { x: centerX, y: centerY, data: narrator, level: 0 });
      setCenterId(narrator.id);

      // Separate nodes by level
      const neighborsToAdd = neighbors.nodes.filter(n => n.id !== narratorId);
      
      // Level 1: direct neighbors
      const teacherIds = new Set<number>();
      const studentIds = new Set<number>();
      for (const edge of neighbors.edges) {
        if (edge.to_narrator_id === narratorId) teacherIds.add(edge.from_narrator_id);
        if (edge.from_narrator_id === narratorId) studentIds.add(edge.to_narrator_id);
      }

      const level1Nodes = neighborsToAdd.filter(n => teacherIds.has(n.id) || studentIds.has(n.id));
      const level2Nodes = neighborsToAdd.filter(n => !teacherIds.has(n.id) && !studentIds.has(n.id));

      const baseRadius = 100 * spread;

      // Position level 1 nodes in inner ring
      const l1Radius = baseRadius;
      level1Nodes.forEach((node, i) => {
        const angle = (2 * Math.PI * i) / level1Nodes.length - Math.PI / 2;
        const x = centerX + l1Radius * Math.cos(angle);
        const y = centerY + l1Radius * Math.sin(angle);
        newNodes.set(node.id, { x, y, data: node, level: 1 });
      });

      // Position level 2 nodes in outer ring
      const l2Radius = baseRadius * 2;
      level2Nodes.forEach((node, i) => {
        const angle = (2 * Math.PI * i) / (level2Nodes.length || 1) - Math.PI / 2;
        const x = centerX + l2Radius * Math.cos(angle);
        const y = centerY + l2Radius * Math.sin(angle);
        newNodes.set(node.id, { x, y, data: node, level: 2 });
      });

      // Add edges
      for (const edge of neighbors.edges) {
        const key = `${edge.from_narrator_id}-${edge.to_narrator_id}`;
        newEdges.set(key, {
          source: edge.from_narrator_id,
          target: edge.to_narrator_id,
          data: edge,
        });
      }

      setGraphState(prev => {
        const updatedNodes = new Map(prev.nodes);
        const updatedEdges = new Map(prev.edges);

        for (const [id, node] of newNodes) {
          if (!updatedNodes.has(id)) {
            updatedNodes.set(id, node);
          }
        }

        for (const [key, edge] of newEdges) {
          if (!updatedEdges.has(key)) {
            updatedEdges.set(key, edge);
          }
        }

        const loadingNodeIds = new Set(prev.loadingNodeIds);
        loadingNodeIds.delete(narratorId);

        return {
          nodes: updatedNodes,
          edges: updatedEdges,
          loadingNodeIds,
          hoveredNodeId: prev.hoveredNodeId,
        };
      });
    } catch (err) {
      console.error('Failed to load graph:', err);
    }
  }, [spread]);

  // Load initial narrator
  useEffect(() => {
    const id = initialNarratorId ?? (searchParams.get('id') ? Number(searchParams.get('id')) : null);
    if (!id) return;
    loadGraph(id, true, levels);
  }, [initialNarratorId, searchParams, loadGraph, levels]);

  // Reload when levels or spread changes
  useEffect(() => {
    if (!centerId) return;
    loadGraph(centerId, true, levels);
  }, [levels, spread, centerId]);

  // Center on first load
  useEffect(() => {
    if (graphState.nodes.size > 0) {
      setTimeout(() => fitView({ padding: 0.3, duration: 500 }), 100);
    }
  }, [graphState.nodes.size, fitView]);

  // Convert to React Flow format
  const flowNodes = useMemo((): Node[] => {
    return Array.from(graphState.nodes.entries()).map(([id, node]) => {
      const isHovered = graphState.hoveredNodeId === id;
      const isFocused = centerId === id;
      const isLoading = graphState.loadingNodeIds.has(id);

      // Scale position by spread factor
      const scaledX = node.x * spread;
      const scaledY = node.y * spread;

      return {
        id: String(id),
        position: { x: scaledX, y: scaledY },
        data: {
          ...node.data,
          isHovered,
          isFocused,
          isLoading,
          level: node.level,
          lang,
          darkMode,
          onHover: (hoverId: number | null) => {
            setGraphState(prev => ({ ...prev, hoveredNodeId: hoverId }));
          },
          onClick: () => {
            onNodeClick?.(node.data);
          },
          onExpand: () => {
            loadGraph(id);
          },
        },
        draggable: true,
        type: 'mapNode',
      };
    });
  }, [graphState, centerId, spread, lang, darkMode, onNodeClick, loadGraph]);

  const flowEdges = useMemo((): Edge[] => {
    return Array.from(graphState.edges.values()).map(edge => {
      const isRelated = graphState.hoveredNodeId !== null && (
        edge.source === graphState.hoveredNodeId || edge.target === graphState.hoveredNodeId
      );

      return {
        id: `${edge.source}-${edge.target}`,
        source: String(edge.source),
        target: String(edge.target),
        type: 'mapEdge',
        data: {
          hadithCount: edge.data.hadith_count || 0,
          isRelated,
          darkMode,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 15,
          height: 15,
          color: darkMode ? '#52525b' : '#9ca3af',
        },
      };
    });
  }, [graphState, darkMode]);

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
    setSearchResults([]);
    setSearchQuery('');
    router.push(`/chain/map?id=${n.id}`);
    loadGraph(n.id, true, levels);
  }, [router, loadGraph, levels]);

  const nodeTypes: NodeTypes = useMemo(() => ({ mapNode: MapNode as any }), []);
  const edgeTypes: EdgeTypes = useMemo(() => ({ mapEdge: MapEdge as any }), []);

  const nodeColor = useCallback((node: any) => {
    if (node.id === String(centerId)) return darkMode ? '#0d9488' : '#14b8a6';
    if (node.id === String(graphState.hoveredNodeId)) return darkMode ? '#0f766e' : '#0d9488';
    if (node.data?.level === 2) return darkMode ? '#6366f1' : '#818cf8'; // Level 2 nodes - indigo
    return darkMode ? '#3f3f46' : '#d1d5db';
  }, [centerId, graphState.hoveredNodeId, darkMode]);

  return (
    <div className="w-full h-full relative" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.2}
        maxZoom={3}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        proOptions={{ hideAttribution: true }}
        className={darkMode ? 'dark' : ''}
        style={{ width: '100%', height: '100%' }}
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
          nodeColor={nodeColor}
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
              className={clsx(
                'w-full px-4 py-2.5 pl-10 rounded-xl border text-sm shadow-lg',
                'focus:outline-none focus:ring-2 focus:ring-teal-500',
                darkMode ? 'bg-zinc-900 border-zinc-700 text-white placeholder-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'
              )}
            />
            <svg className={clsx('absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4', darkMode ? 'text-gray-500' : 'text-gray-400')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searching && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />}
          </div>

          {searchResults.length > 0 && (
            <div className={clsx('mt-1 rounded-xl border shadow-xl overflow-hidden', darkMode ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-gray-200')}>
              {searchResults.map(n => (
                <button key={n.id} onClick={() => handleSelectSearchResult(n)} className={clsx('w-full px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors border-b border-gray-100 dark:border-zinc-800 last:border-0', darkMode ? 'text-white' : 'text-gray-900')}>
                  <p className="font-medium text-sm" dir="rtl">{n.name_ar}</p>
                  {(n as any).name_en && <p className={clsx('text-xs', darkMode ? 'text-gray-400' : 'text-gray-500')}>{(n as any).name_en}</p>}
                </button>
              ))}
            </div>
          )}
        </Panel>

        {/* Controls panel */}
        <Panel position="top-right" className="p-3">
          <div className={clsx('rounded-xl border shadow-lg p-3 space-y-3', darkMode ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-gray-200')}>
            <div className="space-y-1">
              <label className={clsx('text-xs font-medium', darkMode ? 'text-gray-400' : 'text-gray-500')}>{t.levels}: {levels}</label>
              <input
                type="range"
                min="1"
                max="3"
                value={levels}
                onChange={e => setLevels(Number(e.target.value))}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-teal-600"
              />
            </div>
            <div className="space-y-1">
              <label className={clsx('text-xs font-medium', darkMode ? 'text-gray-400' : 'text-gray-500')}>{t.spread}: {spread.toFixed(1)}x</label>
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.1"
                value={spread}
                onChange={e => setSpread(Number(e.target.value))}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-teal-600"
              />
            </div>
          </div>
        </Panel>

        {/* Legend */}
        <Panel position="bottom-left" className="p-2">
          <div className={clsx('text-[10px] space-y-1', darkMode ? 'text-gray-400' : 'text-gray-500')}>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-teal-500" />
              <span>Center</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-gray-400" />
              <span>Level 1</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-indigo-400" />
              <span>Level 2</span>
            </div>
          </div>
        </Panel>
      </ReactFlow>

      {graphState.loadingNodeIds.size > 0 && (
        <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs">
          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
          Loading...
        </div>
      )}
    </div>
  );
}

function GraphContentWrapper(props: ChainMapViewProps) {
  return (
    <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" /></div>}>
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
