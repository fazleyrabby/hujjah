'use client';

/**
 * components/NarratorGraph.tsx
 * 
 * A clean, horizontally-scrollable hierarchical visualizer with Zoom & Pan.
 * Prevents overcrowding by using fixed spacing and a dynamic canvas width.
 */

import { useMemo, useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
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
  thiqah: 'bg-emerald-400 border-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.4)]',
  saduq:  'bg-blue-400 border-blue-300 shadow-[0_0_10px_rgba(96,165,250,0.4)]',
  daif:   'bg-orange-400 border-orange-300 shadow-[0_0_10px_rgba(251,146,60,0.4)]',
  mawdu:  'bg-rose-500 border-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.4)]',
};

const NODE_WIDTH = 120;
const NODE_HEIGHT = 45;
const VERTICAL_GAP = 120;
const HORIZONTAL_GAP = 60;

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
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Helper for consistent name display
  const getDisplayName = (node: NarratorNode) => {
    if (lang === 'bn') return node.name_bn ?? node.name_en ?? '';
    return node.name_en ?? '';
  };

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
    const calculatedWidth = Math.max(activeWidth * 1.5, maxNodesInLayer * (NODE_WIDTH + HORIZONTAL_GAP) + 200);
    const calculatedHeight = Math.max(activeHeight, (layers.length + 1) * VERTICAL_GAP + 100);
    
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
          stroke={isRelatedToCenter ? 'rgba(20, 184, 166, 0.5)' : (darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)')}
          strokeWidth={isRelatedToCenter ? 2.5 : 1.2}
          markerEnd={isRelatedToCenter ? "url(#arrow-active)" : "url(#arrow-subtle)"}
          className="transition-all duration-300"
        />
      );
    });
  }, [edges, nodePositions, centerId, darkMode]);

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
      <TransformWrapper
        initialScale={0.8}
        centerOnInit
        minScale={0.2}
        maxScale={3}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            {/* Fixed UI Overlay */}
            <div className="absolute inset-0 pointer-events-none z-[70]">
              {/* Controls Bar */}
              <div className="absolute top-4 right-4 flex flex-col gap-2 pointer-events-auto">
                <button
                  onClick={() => setIsFullScreen(!isFullScreen)}
                  className="flex items-center justify-center w-10 h-10 bg-white/95 dark:bg-zinc-900/95 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-lg hover:bg-gray-50 dark:hover:bg-zinc-800 transition-all text-gray-500 dark:text-gray-400 backdrop-blur-md"
                  title={isFullScreen ? "Exit Fullscreen" : "Fullscreen View"}
                >
                  {isFullScreen ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                  )}
                </button>

                <div className="flex flex-col bg-white/95 dark:bg-zinc-900/95 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-lg backdrop-blur-md overflow-hidden">
                  <button onClick={() => zoomIn()} className="p-2.5 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-zinc-800" title="Zoom In">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                  </button>
                  <button onClick={() => zoomOut()} className="p-2.5 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-zinc-800" title="Zoom Out">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" /></svg>
                  </button>
                  <button onClick={() => resetTransform()} className="p-2.5 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors text-gray-500 dark:text-gray-400" title="Reset View">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  </button>
                </div>
              </div>

              {/* Bottom Left: Legend */}
              <div className="absolute bottom-6 left-6 inline-flex flex-col gap-2.5 bg-white/95 dark:bg-zinc-900/95 p-4 rounded-2xl border border-gray-200 dark:border-zinc-800 text-[10px] shadow-2xl backdrop-blur-md pointer-events-auto">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-teal-500 shadow-[0_0_12px_rgba(20,184,166,0.6)]" />
                  <span className="text-gray-800 dark:text-gray-200 font-bold tracking-tight">SELECTED NARRATOR</span>
                </div>
                <div className="h-px bg-gray-100 dark:bg-zinc-800/50 my-1" />
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]" />
                  <span className="text-gray-600 dark:text-gray-400 font-medium">Trustworthy (Thiqa)</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.4)]" />
                  <span className="text-gray-600 dark:text-gray-400 font-medium">Weak (Daif)</span>
                </div>
                <div className="mt-1 pt-2 border-t border-gray-100 dark:border-zinc-800 text-[9px] text-gray-400 font-semibold uppercase tracking-widest">
                  {isFullScreen ? "ESC TO EXIT • PINCH TO ZOOM" : "DRAG • SCROLL • ZOOM"}
                </div>
              </div>
            </div>

            <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
              <div style={{ width: totalWidth, height: totalHeight, position: 'relative' }}>
                <svg width={totalWidth} height={totalHeight} className="absolute inset-0 pointer-events-none">
                  <defs>
                    <marker id="arrow-subtle" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill={darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'} />
                    </marker>
                    <marker id="arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(20, 184, 166, 0.6)" />
                    </marker>
                  </defs>
                  {edgePaths}
                </svg>

                {nodes.map(node => {
                  const pos = nodePositions.get(node.id);
                  if (!pos) return null;
                  
                  const isCenter = node.id === centerId;
                  const reliabilityStyles = node.reliability ? RELIABILITY_COLORS[node.reliability] : 'bg-gray-300 dark:bg-zinc-700';

                  return (
                    <button
                      key={node.id}
                      onClick={() => onNodeClick(node)}
                      className={clsx(
                        "absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group transition-all duration-300 hover:z-[90]",
                        isCenter ? "z-[80]" : "z-[20]"
                      )}
                      style={{ left: pos.x, top: pos.y }}
                    >
                      {/* Node Bubble */}
                      <div className={clsx(
                        "w-11 h-11 rounded-full flex items-center justify-center border-2 transition-all group-hover:scale-125 shadow-xl",
                        isCenter 
                          ? "bg-teal-500 border-teal-300 scale-110 shadow-teal-500/30" 
                          : clsx("bg-white dark:bg-zinc-800", reliabilityStyles)
                      )}>
                        <div className={clsx(
                          "w-2.5 h-2.5 rounded-full",
                          isCenter ? "bg-white animate-pulse" : "bg-white/90 shadow-sm"
                        )} />
                      </div>

                      {/* Label */}
                      <div className="mt-3 text-center pointer-events-none">
                        <div className={clsx(
                          "font-arabic text-[13px] leading-none whitespace-nowrap px-3 py-1.5 rounded-lg shadow-sm border transition-all",
                          isCenter 
                            ? "bg-teal-500 text-white border-teal-400 font-bold scale-105" 
                            : "bg-white/95 dark:bg-zinc-900/95 text-gray-900 dark:text-gray-50 border-gray-100 dark:border-zinc-800"
                        )}>
                          {node.name_ar}
                        </div>
                        {getDisplayName(node) && (
                          <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5 font-medium tracking-tight whitespace-nowrap max-w-[140px] truncate bg-white/50 dark:bg-zinc-900/50 px-1 rounded">
                            {getDisplayName(node)}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  );

  if (!mounted) return null;

  if (isFullScreen) {
    return createPortal(content, document.body);
  }

  return content;
}