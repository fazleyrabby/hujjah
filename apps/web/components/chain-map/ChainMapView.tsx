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

interface GraphNodeData extends NarratorNode {
  isHovered: boolean;
  isFocused: boolean;
  isLoading: boolean;
  lang: 'en' | 'bn' | 'ar';
  darkMode: boolean;
  onHover: (id: number | null) => void;
  onClick: () => void;
  onExpand: () => void;
}

interface GraphEdgeData {
  hadithCount: number;
  isRelated: boolean;
  darkMode: boolean;
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
  },
  bn: {
    searchPlaceholder: 'রাবী খুঁজুন...',
    noResults: 'রাবী পাওয়া যায়নি',
    expand: 'প্রতিবেশী দেখতে নোডে ডাবল ক্লিক করুন',
  },
  ar: {
    searchPlaceholder: 'ابحث عن الراوي...',
    noResults: 'لم يُعثر على راوٍ',
    expand: 'انقر نقراً مزدوجاً لتوسيع الجيران',
  },
};

interface GraphState {
  nodes: Map<number, { x: number; y: number; data: NarratorNode }>;
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
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { fitView, setCenter } = useReactFlow();

  const t = MAP_I18N[lang];

  // Load initial narrator and neighbors
  const loadGraph = useCallback(async (narratorId: number, clearExisting: boolean = false) => {
    // Clear existing graph when centering on a new node
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
      // Fetch narrator and neighbors in parallel
      const [narratorRes, neighborsRes] = await Promise.all([
        fetch(`/api/chain?action=narrator&id=${narratorId}`),
        fetch(`/api/chain?action=neighbors&id=${narratorId}&depth=1&limit=15`),
      ]);

      const narrator: NarratorNode = await narratorRes.json();
      const neighbors: GraphNeighborResponse = await neighborsRes.json();

      if (!narrator) {
        console.error('Narrator not found:', narratorId);
        return;
      }

      // Position nodes with teachers above, students below
      const centerX = 0;
      const centerY = 0;

      const newNodes = new Map<number, { x: number; y: number; data: NarratorNode }>();
      const newEdges = new Map<string, { source: number; target: number; data: NarratorEdge }>();

      // Add center node
      newNodes.set(narrator.id, { x: centerX, y: centerY, data: narrator });
      setCenterId(narrator.id);

      // Separate teachers (who narrated TO this narrator) and students (who narrated FROM this narrator)
      const neighborsToAdd = neighbors.nodes.filter(n => n.id !== narratorId);
      
      // Find teachers and students from edges
      const teacherIds = new Set<number>();
      const studentIds = new Set<number>();
      for (const edge of neighbors.edges) {
        if (edge.to_narrator_id === narratorId) {
          teacherIds.add(edge.from_narrator_id);
        }
        if (edge.from_narrator_id === narratorId) {
          studentIds.add(edge.to_narrator_id);
        }
      }

      const teachers = neighborsToAdd.filter(n => teacherIds.has(n.id));
      const students = neighborsToAdd.filter(n => studentIds.has(n.id));
      const others = neighborsToAdd.filter(n => !teacherIds.has(n.id) && !studentIds.has(n.id));

      const horizontalSpread = 150;
      const verticalSpread = 180;

      // Position teachers in upper row
      teachers.forEach((node, i) => {
        const count = teachers.length;
        const x = centerX + horizontalSpread * (i - (count - 1) / 2);
        const y = centerY - verticalSpread;
        newNodes.set(node.id, { x, y, data: node });
      });

      // Position students in lower row  
      students.forEach((node, i) => {
        const count = students.length;
        const x = centerX + horizontalSpread * (i - (count - 1) / 2);
        const y = centerY + verticalSpread;
        newNodes.set(node.id, { x, y, data: node });
      });

      // Position other neighbors on sides
      others.forEach((node, i) => {
        const side = i % 2 === 0 ? -1 : 1;
        const row = Math.floor(i / 2);
        const x = centerX + side * horizontalSpread * 2;
        const y = centerY + (row * verticalSpread * 0.6 - verticalSpread * 0.3);
        newNodes.set(node.id, { x, y, data: node });
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

        // Merge new nodes
        for (const [id, node] of newNodes) {
          if (!updatedNodes.has(id)) {
            updatedNodes.set(id, node);
          }
        }

        // Merge new edges
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
  }, []);

  // Load initial narrator
  useEffect(() => {
    const id = initialNarratorId ?? (searchParams.get('id') ? Number(searchParams.get('id')) : null);
    if (!id) return;
    loadGraph(id, true); // clearExisting = true for initial load
  }, [initialNarratorId, searchParams, loadGraph]);

  // Center on first load
  useEffect(() => {
    if (graphState.nodes.size > 0) {
      setTimeout(() => fitView({ padding: 0.2, duration: 500 }), 100);
    }
  }, [graphState.nodes.size, fitView]);

  // Convert to React Flow format
  const flowNodes = useMemo((): Node[] => {
    return Array.from(graphState.nodes.entries()).map(([id, node]) => {
      const isHovered = graphState.hoveredNodeId === id;
      const isFocused = centerId === id;
      const isLoading = graphState.loadingNodeIds.has(id);

      return {
        id: String(id),
        position: { x: node.x, y: node.y },
        data: {
          ...node.data,
          isHovered,
          isFocused,
          isLoading,
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
  }, [graphState, centerId, lang, darkMode, onNodeClick, loadGraph]);

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
    loadGraph(n.id);
  }, [router, loadGraph]);

  const nodeTypes: NodeTypes = useMemo(() => ({ mapNode: MapNode as any }), []);
  const edgeTypes: EdgeTypes = useMemo(() => ({ mapEdge: MapEdge as any }), []);

  const nodeColor = useCallback((node: any) => {
    if (node.id === String(centerId)) return darkMode ? '#0d9488' : '#14b8a6';
    if (node.id === String(graphState.hoveredNodeId)) return darkMode ? '#0f766e' : '#0d9488';
    return darkMode ? '#3f3f46' : '#d1d5db';
  }, [centerId, graphState.hoveredNodeId, darkMode]);

  return (
    <div className="w-full h-full" style={{ minHeight: '800px' }} ref={reactFlowWrapper}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.2}
        maxZoom={2}
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
                darkMode
                  ? 'bg-zinc-900 border-zinc-700 text-white placeholder-gray-500'
                  : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'
              )}
            />
            <svg
              className={clsx(
                'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4',
                darkMode ? 'text-gray-500' : 'text-gray-400'
              )}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
            )}
          </div>

          {/* Search results dropdown */}
          {searchResults.length > 0 && (
            <div className={clsx(
              'mt-1 rounded-xl border shadow-xl overflow-hidden',
              darkMode ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-gray-200'
            )}>
              {searchResults.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleSelectSearchResult(n)}
                  className={clsx(
                    'w-full px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors border-b border-gray-100 dark:border-zinc-800 last:border-0',
                    darkMode ? 'text-white' : 'text-gray-900'
                  )}
                >
                  <p className="font-medium text-sm" dir="rtl">{n.name_ar}</p>
                  {(n as any).name_en && (
                    <p className={clsx('text-xs', darkMode ? 'text-gray-400' : 'text-gray-500')}>
                      {(n as any).name_en}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </Panel>

        {/* Legend / Hint */}
        <Panel position="bottom-left" className="p-2">
          <div className={clsx('text-[10px]', darkMode ? 'text-gray-400' : 'text-gray-500')}>
            {t.expand}
          </div>
        </Panel>
      </ReactFlow>

      {/* Loading overlay */}
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
    <Suspense fallback={
      <div className="w-full h-full flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
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
