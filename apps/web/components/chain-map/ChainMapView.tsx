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
    directConnections: 'Showing direct connections only',
  },
  bn: {
    searchPlaceholder: 'রাবী খুঁজুন...',
    noResults: 'রাবী পাওয়া যায়নি',
    expand: 'প্রতিবেশী দেখতে নোডে ডাবল ক্লিক করুন',
    spread: 'স্প্রেড',
    directConnections: 'শুধুমাত্র সরাসরি সংযোগগুলো দেখাচ্ছে',
  },
  ar: {
    searchPlaceholder: 'ابحث عن الراوي...',
    noResults: 'لم يُعثر على راوٍ',
    expand: 'انقر نقراً مزدوجاً لتوسيع الجيران',
    spread: 'الانتشار',
    directConnections: 'إظهار الاتصالات المباشرة فقط',
  },
};

// Tabaqah (generation) layers
const TABAQAH_LAYERS: Record<number, { label: string; radius: number }> = {
  1: { label: 'Sahaba', radius: 0 },         // Companions - center
  2: { label: "Tabi'un", radius: 1 },      // Followers
  3: { label: "Tabi' al-Tabi'in", radius: 2 }, // Followers of followers
  4: { label: 'Later Scholars', radius: 3 }, // Later scholars
};

// Normalize Arabic name for comparison
function normalizeArabicName(name: string): string {
  if (!name) return '';
  return name
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '') // Remove diacritics
    .replace(/[أإآٱ]/g, 'ا') // Normalize alif
    .replace(/ى/g, 'ي') // Persian ya to Arabic
    .replace(/ة/g, 'ه') // Ta marbuta to ha
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Get tabaqah radius multiplier
function getTabaqahRadius(tabaqah: number | null | undefined): number {
  return TABAQAH_LAYERS[tabaqah ?? 4]?.radius ?? 3;
}

// Generate jitter for node position
function addJitter(value: number, amount: number = 8): number {
  return value + (Math.random() - 0.5) * amount * 2;
}

interface GraphState {
  nodes: Map<number, { 
    x: number; 
    y: number; 
    data: NarratorNode;
    tabaqah: number;
    normalizedName: string;
  }>;
  edges: Map<string, { 
    source: number; 
    target: number; 
    data: NarratorEdge;
    isTeacherEdge: boolean; // true if target is center narrator (teacher)
  }>;
  loadingNodeIds: Set<number>;
  hoveredNodeId: number | null;
  nameFrequency: Map<string, number>; // Track duplicate names
}

function GraphContent({ initialNarratorId, lang = 'en', darkMode = false, onNodeClick }: ChainMapViewProps) {
  const router = useRouter();
  const searchParams = useNextSearchParams();
  const [graphState, setGraphState] = useState<GraphState>({
    nodes: new Map(),
    edges: new Map(),
    loadingNodeIds: new Set(),
    hoveredNodeId: null,
    nameFrequency: new Map(),
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NarratorNode[]>([]);
  const [searching, setSearching] = useState(false);
  const [centerId, setCenterId] = useState<number | null>(null);
  const [spread, setSpread] = useState(2);
  const spreadRef = useRef(2);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { fitView } = useReactFlow();

  const t = MAP_I18N[lang];

  // Load graph with generational layering
  const loadGraph = useCallback(async (narratorId: number, clearExisting: boolean = false) => {
    if (clearExisting) {
      setGraphState({
        nodes: new Map(),
        edges: new Map(),
        loadingNodeIds: new Set(),
        hoveredNodeId: null,
        nameFrequency: new Map(),
      });
    }

    setGraphState(prev => ({
      ...prev,
      loadingNodeIds: new Set([...prev.loadingNodeIds, narratorId]),
    }));

    try {
      const [narratorRes, neighborsRes] = await Promise.all([
        fetch(`/api/chain?action=narrator&id=${narratorId}`),
        fetch(`/api/chain?action=neighbors&id=${narratorId}&depth=1&limit=20`),
      ]);

      const narrator: NarratorNode = await narratorRes.json();
      const neighbors: GraphNeighborResponse = await neighborsRes.json();

      if (!narrator) {
        console.error('Narrator not found:', narratorId);
        return;
      }

      const newNodes = new Map<number, { x: number; y: number; data: NarratorNode; tabaqah: number; normalizedName: string }>();
      const newEdges = new Map<string, { source: number; target: number; data: NarratorEdge; isTeacherEdge: boolean }>();
      const nameFrequency = new Map<string, number>();

      // Track name frequency for duplicate detection
      const centerNormName = normalizeArabicName(narrator.name_ar || '');
      nameFrequency.set(centerNormName, (nameFrequency.get(centerNormName) || 0) + 1);

      // Position center node at (0, 0)
      const centerX = 0;
      const centerY = 0;
      const narratorTabaqah = narrator.tabaqah ?? 4;
      newNodes.set(narrator.id, { 
        x: centerX, 
        y: centerY, 
        data: narrator, 
        tabaqah: narratorTabaqah,
        normalizedName: centerNormName,
      });
      setCenterId(narrator.id);

      // Get neighbors grouped by tabaqah
      const neighborsToAdd = neighbors.nodes.filter(n => n.id !== narratorId);
      
      // Group neighbors by tabaqah for generational layout
      const byTabaqah = new Map<number, typeof neighborsToAdd>();
      for (const node of neighborsToAdd) {
        const tabaqah = node.tabaqah ?? 4;
        if (!byTabaqah.has(tabaqah)) byTabaqah.set(tabaqah, []);
        byTabaqah.get(tabaqah)!.push(node);
        
        // Track name frequency
        const normName = normalizeArabicName(node.name_ar || '');
        nameFrequency.set(normName, (nameFrequency.get(normName) || 0) + 1);
      }

      // Calculate base spacing - more spread out
      const baseRingRadius = 150 * spread;
      const ringSpacing = 80 * spread;
      const baseAngleJitter = 0.05; // less jitter for cleaner layout

      // Position neighbors by tabaqah rings
      for (const [tabaqah, nodes] of byTabaqah) {
        const layerRadius = getTabaqahRadius(tabaqah);
        const ringRadius = baseRingRadius + layerRadius * ringSpacing;
        
        nodes.forEach((node, i) => {
          // Calculate angle with some jitter to reduce overlap
          const baseAngle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
          const angleJitter = (Math.random() - 0.5) * baseAngleJitter;
          const angle = baseAngle + angleJitter;
          
          const x = centerX + ringRadius * Math.cos(angle) + addJitter(0, 5);
          const y = centerY + ringRadius * Math.sin(angle) + addJitter(0, 5);
          
          newNodes.set(node.id, { 
            x, 
            y, 
            data: node, 
            tabaqah,
            normalizedName: normalizeArabicName(node.name_ar || ''),
          });
        });
      }

      // Calculate dynamic spread based on node count
      const totalNodes = Array.from(newNodes.values()).length;
      let dynamicSpread = spreadRef.current;
      if (totalNodes > 30) dynamicSpread = 3.0;
      else if (totalNodes > 20) dynamicSpread = 2.5;
      else if (totalNodes > 12) dynamicSpread = 2.0;
      else dynamicSpread = 1.5;

      // Recalculate positions with dynamic spread
      if (dynamicSpread !== spreadRef.current) {
        spreadRef.current = dynamicSpread;
        for (const [id, node] of newNodes) {
          const layerRadius = getTabaqahRadius(node.tabaqah);
          const originalRadius = baseRingRadius / spreadRef.current + layerRadius * ringSpacing / spreadRef.current;
          const newRadius = baseRingRadius / dynamicSpread + layerRadius * ringSpacing / dynamicSpread;
          // Keep same angle
          const angle = Math.atan2(node.y, node.x);
          node.x = newRadius * Math.cos(angle);
          node.y = newRadius * Math.sin(angle);
        }
      }

      // Add edges with direction info
      for (const edge of neighbors.edges) {
        const key = `${edge.from_narrator_id}-${edge.to_narrator_id}`;
        const isTeacherEdge = edge.to_narrator_id === narratorId; // teacher → narrator
        newEdges.set(key, {
          source: edge.from_narrator_id,
          target: edge.to_narrator_id,
          data: edge,
          isTeacherEdge,
        });
      }

      setGraphState(prev => {
        const updatedNodes = new Map(prev.nodes);
        const updatedEdges = new Map(prev.edges);
        const updatedFrequency = new Map([...prev.nameFrequency, ...nameFrequency]);

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
          nameFrequency: updatedFrequency,
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
    loadGraph(id, true);
  }, [initialNarratorId, searchParams, loadGraph]);

  // Reload when spread changes
  useEffect(() => {
    if (!centerId) return;
    loadGraph(centerId, true);
  }, [spread, centerId]);

  // Center on first load
  useEffect(() => {
    if (graphState.nodes.size > 0) {
      setTimeout(() => fitView({ padding: 0.3, duration: 500 }), 100);
    }
  }, [graphState.nodes.size, fitView]);

  // Get connected neighbor IDs (for hover focus effect)
  const connectedNeighborIds = useMemo(() => {
    if (!graphState.hoveredNodeId) return new Set<number>();
    const connected = new Set<number>();
    connected.add(graphState.hoveredNodeId);
    for (const edge of graphState.edges.values()) {
      if (edge.source === graphState.hoveredNodeId) connected.add(edge.target);
      if (edge.target === graphState.hoveredNodeId) connected.add(edge.source);
    }
    return connected;
  }, [graphState.hoveredNodeId, graphState.edges]);

  // Convert to React Flow format
  const flowNodes = useMemo((): Node[] => {
    return Array.from(graphState.nodes.entries()).map(([id, node]) => {
      const isHovered = graphState.hoveredNodeId === id;
      const isFocused = centerId === id;
      const isLoading = graphState.loadingNodeIds.has(id);
      const isDuplicate = (graphState.nameFrequency.get(node.normalizedName) || 0) > 1;
      const isConnected = connectedNeighborIds.has(id);
      const opacity = graphState.hoveredNodeId ? (isConnected ? 1 : 0.2) : 1;

      return {
        id: String(id),
        position: { x: node.x, y: node.y },
        style: {
          zIndex: isHovered ? 9999 : isFocused ? 100 : 1,
          opacity,
        },
        data: {
          ...node.data,
          isHovered,
          isFocused,
          isLoading,
          isDuplicate,
          tabaqah: node.tabaqah,
          tabaqahLabel: TABAQAH_LAYERS[node.tabaqah]?.label || 'Later',
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

  // Convert edges with arrows
  const flowEdges = useMemo((): Edge[] => {
    return Array.from(graphState.edges.values()).map(edge => {
      const isRelated = graphState.hoveredNodeId !== null && (
        edge.source === graphState.hoveredNodeId || edge.target === graphState.hoveredNodeId
      );

      const isRelatedEdge = graphState.hoveredNodeId !== null && (
        edge.source === graphState.hoveredNodeId || edge.target === graphState.hoveredNodeId
      );
      const edgeOpacity = graphState.hoveredNodeId ? (isRelatedEdge ? 1 : 0.15) : 0.7;
      return {
        id: `${edge.source}-${edge.target}`,
        source: String(edge.source),
        target: String(edge.target),
        type: 'mapEdge',
        style: { opacity: edgeOpacity },
        data: {
          hadithCount: edge.data.hadith_count || 0,
          isRelated: isRelatedEdge,
          isTeacherEdge: edge.isTeacherEdge,
          darkMode,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 12,
          height: 12,
          color: edge.isTeacherEdge 
            ? (darkMode ? '#f59e0b' : '#d97706')  // Amber for teacher edges
            : (darkMode ? '#14b8a6' : '#0d9488'), // Teal for student edges
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
    loadGraph(n.id, true);
  }, [router, loadGraph]);

  const nodeTypes: NodeTypes = useMemo(() => ({ mapNode: MapNode as any }), []);
  const edgeTypes: EdgeTypes = useMemo(() => ({ mapEdge: MapEdge as any }), []);

  const nodeColor = useCallback((node: any) => {
    if (node.id === String(centerId)) return darkMode ? '#0d9488' : '#14b8a6';
    if (node.id === String(graphState.hoveredNodeId)) return darkMode ? '#0f766e' : '#0d9488';
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
            <div className={clsx('text-[10px]', darkMode ? 'text-gray-500' : 'text-gray-400')}>
              {t.directConnections}
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
