'use client';

/**
 * components/NarratorGraph.tsx
 * 
 * A clean, horizontally-scrollable hierarchical visualizer.
 * Prevents overcrowding by using fixed spacing and a dynamic canvas width.
 */

import { useMemo, useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { NarratorNode, NarratorEdge } from '@/lib/chain-db';
import { clsx } from 'clsx';

interface Props {
  nodes: NarratorNode[];
  edges: NarratorEdge[];
  centerId: number;
  darkMode: boolean;
  lang: 'en' | 'bn' | 'ar';
  onNodeClick: (node: NarratorNode) => void;
  width?: number; // Base width of the container
  height?: number;
}

const RELIABILITY_COLORS: Record<string, string> = {
  thiqah: 'bg-emerald-500',
  saduq:  'bg-blue-500',
  daif:   'bg-amber-500',
  mawdu:  'bg-red-500',
};

const NODE_WIDTH = 120;
const NODE_HEIGHT = 45;
const VERTICAL_GAP = 100;
const HORIZONTAL_GAP = 40;

export default function NarratorGraph({
  nodes,
  edges,
  centerId,
  darkMode,
  lang,
  onNodeClick,
  width: containerWidth = 672,
  height = 480,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Helper for consistent name display
  const getDisplayName = (node: NarratorNode) => {
    if (lang === 'bn') return node.name_bn ?? node.name_en ?? '';
    return node.name_en ?? '';
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll when in fullscreen
  useEffect(() => {
    if (isFullScreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isFullScreen]);

  // 1. Group nodes by Tabaqah (Generation)
  const layers = useMemo(() => {
    const grouped: Record<number, NarratorNode[]> = {};
    nodes.forEach(n => {
      const tab = n.tabaqah || 4;
      if (!grouped[tab]) grouped[tab] = [];
      grouped[tab].push(n);
    });
    
    return Object.keys(grouped)
      .map(Number)
      .sort((a, b) => a - b)
      .map(key => ({
        tab: key,
        nodes: grouped[key]
      }));
  }, [nodes]);

  // 2. Calculate dynamic width and positions
  const { nodePositions, totalWidth, totalHeight } = useMemo(() => {
    const pos = new Map<number, { x: number; y: number }>();
    
    const activeWidth = isFullScreen ? (typeof window !== 'undefined' ? window.innerWidth : containerWidth) : containerWidth;
    const activeHeight = isFullScreen ? (typeof window !== 'undefined' ? window.innerHeight : height) : height;

    const maxNodesInLayer = Math.max(...layers.map(l => l.nodes.length), 1);
    const calculatedWidth = Math.max(activeWidth, maxNodesInLayer * (NODE_WIDTH + HORIZONTAL_GAP) + 100);
    const calculatedHeight = Math.max(activeHeight, layers.length * VERTICAL_GAP + 150);
    
    layers.forEach((layer, lIdx) => {
      const y = (lIdx + 1) * VERTICAL_GAP;
      const layerTotalWidth = layer.nodes.length * NODE_WIDTH + (layer.nodes.length - 1) * HORIZONTAL_GAP;
      const startX = (calculatedWidth - layerTotalWidth) / 2;

      layer.nodes.forEach((node, nIdx) => {
        pos.set(node.id, {
          x: startX + nIdx * (NODE_WIDTH + HORIZONTAL_GAP) + NODE_WIDTH / 2,
          y
        });
      });
    });

    return { nodePositions: pos, totalWidth: calculatedWidth, totalHeight: calculatedHeight };
  }, [layers, containerWidth, isFullScreen, height]);

  // 3. Render curved paths for edges
  const edgePaths = useMemo(() => {
    return edges.map((edge, i) => {
      const start = nodePositions.get(edge.from_narrator_id);
      const end = nodePositions.get(edge.to_narrator_id);
      if (!start || !end) return null;

      const cp1y = start.y + VERTICAL_GAP / 2;
      const cp2y = end.y - VERTICAL_GAP / 2;
      const path = `M ${start.x} ${start.y} C ${start.x} ${cp1y}, ${end.x} ${cp2y}, ${end.x} ${end.y}`;
      
      const isRelatedToCenter = edge.from_narrator_id === centerId || edge.to_narrator_id === centerId;

      return (
        <path
          key={`edge-${i}`}
          d={path}
          fill="none"
          stroke={isRelatedToCenter ? 'rgba(20, 184, 166, 0.4)' : (darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)')}
          strokeWidth={isRelatedToCenter ? 2 : 1}
          markerEnd={isRelatedToCenter ? "url(#arrow-active)" : "url(#arrow-subtle)"}
          className="transition-all duration-300"
        />
      );
    });
  }, [edges, nodePositions, centerId, darkMode]);

  // Scroll to center on mount/change
  useEffect(() => {
    if (containerRef.current) {
      const centerNode = nodePositions.get(centerId);
      if (centerNode) {
        const activeWidth = isFullScreen ? window.innerWidth : containerWidth;
        containerRef.current.scrollLeft = centerNode.x - activeWidth / 2;
      }
    }
  }, [centerId, nodePositions, containerWidth, isFullScreen]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullScreen(false);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const content = (
    <div 
      className={clsx(
        "bg-white dark:bg-[#0a0a0a] border-gray-100 dark:border-zinc-800 transition-all overflow-hidden",
        isFullScreen ? "fixed inset-0 z-[100] w-screen h-screen" : "relative rounded-xl border w-full h-[480px]"
      )}
      style={!isFullScreen ? { width: containerWidth, height } : {}}
    >
      {/* Fixed UI Overlay */}
      <div className="absolute inset-0 pointer-events-none z-[70]">
        <div className="absolute top-4 right-4 flex gap-2 pointer-events-auto">
          <button
            onClick={() => setIsFullScreen(!isFullScreen)}
            className="flex items-center gap-2 px-3 py-2 bg-white/95 dark:bg-zinc-900/95 border border-gray-200 dark:border-zinc-800 rounded-lg shadow-md hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors text-gray-500 dark:text-gray-400 backdrop-blur-md"
          >
            <span className="text-[10px] font-bold uppercase tracking-wider">
              {isFullScreen ? "Exit Fullscreen" : "Fullscreen View"}
            </span>
            {isFullScreen ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            )}
          </button>
        </div>

        <div className="absolute bottom-4 left-4 inline-flex flex-col gap-1.5 bg-white/95 dark:bg-zinc-900/95 p-3 rounded-xl border border-gray-200 dark:border-zinc-800 text-[10px] shadow-xl backdrop-blur-md pointer-events-auto">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.4)]" />
            <span className="text-gray-700 dark:text-gray-300 font-bold">Selected Narrator</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-gray-600 dark:text-gray-400">Trustworthy (Thiqa)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="text-gray-600 dark:text-gray-400">Weak (Daif)</span>
          </div>
          <div className="mt-1 pt-1.5 border-t border-gray-100 dark:border-zinc-800 text-[9px] text-gray-400 font-medium">
            {isFullScreen ? "ESC to exit" : "Drag or scroll to explore"}
          </div>
        </div>
      </div>

      <div 
        ref={containerRef}
        className="w-full h-full overflow-auto scroll-smooth"
      >
        <div style={{ width: totalWidth, height: totalHeight, position: 'relative' }}>
          <svg width={totalWidth} height={totalHeight} className="absolute inset-0 pointer-events-none">
            <defs>
              <marker id="arrow-subtle" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'} />
              </marker>
              <marker id="arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(20, 184, 166, 0.5)" />
              </marker>
            </defs>
            {edgePaths}
          </svg>

          {nodes.map(node => {
            const pos = nodePositions.get(node.id);
            if (!pos) return null;
            
            const isCenter = node.id === centerId;
            const reliabilityColor = node.reliability ? RELIABILITY_COLORS[node.reliability] : 'bg-gray-300 dark:bg-zinc-700';

            return (
              <button
                key={node.id}
                onClick={() => onNodeClick(node)}
                className={clsx(
                  "absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group transition-all hover:z-50",
                  isCenter ? "z-40" : "z-20"
                )}
                style={{ left: pos.x, top: pos.y }}
              >
                <div className={clsx(
                  "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-transform group-hover:scale-110 shadow-sm",
                  isCenter 
                    ? "bg-teal-500 border-teal-400 scale-110 shadow-teal-500/20" 
                    : "bg-white dark:bg-zinc-800 border-gray-100 dark:border-zinc-700"
                )}>
                  <div className={clsx(
                    "w-2 h-2 rounded-full",
                    isCenter ? "bg-white" : reliabilityColor
                  )} />
                </div>

                <div className="mt-2 text-center pointer-events-none">
                  <div className={clsx(
                    "font-arabic text-xs leading-none whitespace-nowrap px-2 py-1 rounded bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm",
                    isCenter ? "text-teal-600 dark:text-teal-400 font-bold" : "text-gray-900 dark:text-gray-100"
                  )}>
                    {node.name_ar}
                  </div>
                  {getDisplayName(node) && (
                    <div className="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5 truncate max-w-[100px]">
                      {getDisplayName(node)}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;

  if (isFullScreen) {
    return createPortal(content, document.body);
  }

  return content;
}
