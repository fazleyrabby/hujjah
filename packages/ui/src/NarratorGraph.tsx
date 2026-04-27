'use client';

/**
 * NarratorGraph.tsx
 *
 * Horizontal sanad tree — grandteachers (left) → center → grandstudents (right).
 * Level assignment: edge-based first, tabaqah-based fallback.
 * Uses Number() coercion on all ID comparisons to avoid type-mismatch bugs.
 */

import { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import type { NarratorNode, NarratorEdge } from './types';
import { clsx } from 'clsx';

interface Props {
  nodes: NarratorNode[];
  edges: NarratorEdge[];
  centerId: number;
  darkMode: boolean;
  lang: 'en' | 'bn' | 'ar';
  onNodeClick: (node: NarratorNode) => void;
  width?: number;
  height?: number;
}

// ─── Layout ───────────────────────────────────────────────────────────────────
const NODE_W   = 190;
const NODE_H   = 76;
const CENTER_W = 220;
const CENTER_H = 84;
const H_STEP   = 270;  // horizontal distance between column centres
const V_STEP   = 16;   // vertical gap between nodes in the same column
const PAD_X    = 60;
const PAD_Y    = 52;
const MAX_COL  = 20;   // max nodes shown per column

// ─── Colors ───────────────────────────────────────────────────────────────────
const REL_BORDER: Record<string, string> = {
  thiqah: '#34d399', // emerald-400
  saduq:  '#60a5fa', // blue-400
  daif:   '#fb923c', // orange-400
  mawdu:  '#f43f5e', // rose-500
};
const REL_GLOW: Record<string, string> = {
  thiqah: 'rgba(52,211,153,0.35)',
  saduq:  'rgba(96,165,250,0.35)',
  daif:   'rgba(251,146,60,0.35)',
  mawdu:  'rgba(244,63,94,0.35)',
};
const REL_LABEL: Record<string, { en: string; bn: string }> = {
  thiqah: { en: 'Trustworthy', bn: 'নির্ভরযোগ্য' },
  saduq:  { en: 'Truthful',    bn: 'সত্যবাদী' },
  daif:   { en: 'Weak',        bn: 'দুর্বল' },
  mawdu:  { en: 'Fabricated',  bn: 'জাল' },
};

// ─── Transliteration ──────────────────────────────────────────────────────────
const WORD_MAP: Record<string, string> = {
  'محمد':'Muhammad','أحمد':'Ahmad','علي':'Ali','عمر':'Umar','عثمان':'Uthman',
  'أبو':'Abu','أبي':'Abi','ابن':'Ibn','بن':'ibn','بنت':'bint','عبد':'Abd',
  'الله':'Allah','عبدالله':'Abdullah','الرحمن':'al-Rahman','يحيى':'Yahya',
  'موسى':'Musa','سفيان':'Sufyan','مالك':'Malik','أنس':'Anas','سعيد':"Sa'id",
  'حماد':'Hammad','إبراهيم':'Ibrahim','إسحاق':'Ishaq','يوسف':'Yusuf',
  'داود':'Dawud','سليمان':'Sulayman','جعفر':"Ja'far",'خالد':'Khalid',
  'زيد':'Zayd','عائشة':"A'isha",'فاطمة':'Fatima','هريرة':'Hurairah',
  'بكر':'Bakr','عمرو':'Amr','قتيبة':'Qutayba','شعبة':"Shu'ba",
  'وكيع':"Waki'",'يزيد':'Yazid','حسن':'Hasan','حسين':'Husayn',
  'نافع':"Nafi'",'الزهري':'al-Zuhri','البخاري':'al-Bukhari','مسلم':'Muslim',
  'الترمذي':'al-Tirmidhi','النسائي':"al-Nasa'i",'حنبل':'Hanbal',
  'الشافعي':"al-Shafi'i",'ماجه':'Majah',
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
  return clean.split(/\s+/).map(w => {
    if (WORD_MAP[w]) return WORD_MAP[w];
    if (w.startsWith('ال') && w.length > 2) return 'al-' + [...w.slice(2)].map(c => CHAR_MAP[c] ?? c).join('');
    return [...w].map(c => CHAR_MAP[c] ?? c).join('');
  }).join(' ');
}

function getLabel(node: NarratorNode, lang: 'en' | 'bn' | 'ar') {
  if (lang === 'ar') return { primary: node.name_ar, secondary: null };
  const local = lang === 'bn' ? (node.name_bn ?? node.name_en) : node.name_en;
  if (local) return { primary: local, secondary: node.name_ar };
  return { primary: transliterate(node.name_ar), secondary: node.name_ar };
}

// ─── Level assignment ─────────────────────────────────────────────────────────
/**
 * CONFIRMED edge semantics (from actual data):
 *   from_narrator_id = TEACHER (earlier generation, left side)
 *   to_narrator_id   = STUDENT (later generation, right side)
 *
 * Example: Aisha (Companion, tabaqah=1) is FROM; her students (tabaqah=3) are TO.
 *
 * Level convention: teacher side = negative (left), student side = positive (right).
 *   grandteachers=-2, teachers=-1, center=0, students=+1, grandstudents=+2
 */
function buildLevelMap(
  nodes: NarratorNode[],
  edges: NarratorEdge[],
  centerId: number
): Map<number, number> {
  const cId = Number(centerId);
  const centerNode = nodes.find(n => Number(n.id) === cId);
  const centerTabaqah = centerNode?.tabaqah ?? null;

  const level = new Map<number, number>();
  level.set(cId, 0);

  // Seed direct neighbors, skipping self-loops
  for (const e of edges) {
    const from = Number(e.from_narrator_id), to = Number(e.to_narrator_id);
    if (from === to) continue;
    // center is FROM (teacher) → to is student = +1 (right)
    if (from === cId && !level.has(to)) level.set(to,   1);
    // center is TO (student) → from is teacher = -1 (left)
    if (to   === cId && !level.has(from)) level.set(from, -1);
  }

  // BFS outward from all seeded neighbors
  const queue: number[] = [...level.keys()].filter(id => id !== cId);
  while (queue.length) {
    const curr = queue.shift()!;
    const currLevel = level.get(curr)!;
    for (const e of edges) {
      const from = Number(e.from_narrator_id), to = Number(e.to_narrator_id);
      if (from === to) continue;
      // curr is FROM (teacher) → to is student = one step right
      if (from === curr && !level.has(to)) {
        level.set(to, Math.min(2, currLevel + 1));
        queue.push(to);
      }
      // curr is TO (student) → from is teacher = one step left
      if (to === curr && !level.has(from)) {
        level.set(from, Math.max(-2, currLevel - 1));
        queue.push(from);
      }
    }
  }

  // Tabaqah fallback for nodes unreachable via edges from center
  // higher tabaqah = later generation = student side (+)
  if (centerTabaqah) {
    for (const n of nodes) {
      if (level.has(Number(n.id)) || !n.tabaqah) continue;
      const diff = n.tabaqah - centerTabaqah;
      level.set(Number(n.id), Math.max(-2, Math.min(2, diff)));
    }
  }

  // Final fallback
  for (const n of nodes) {
    if (!level.has(Number(n.id))) level.set(Number(n.id), 0);
  }

  return level;
}

// ─── Level metadata ───────────────────────────────────────────────────────────
const LEVEL_META: Record<number, { en: string; bn: string; color: string; darkColor: string }> = {
  '-2': { en: 'Grandteachers', bn: 'উস্তাদের উস্তাদ', color: 'text-teal-700 bg-teal-50 border-teal-200', darkColor: 'dark:text-teal-400 dark:bg-teal-900/20 dark:border-teal-800' },
  '-1': { en: 'Teachers',      bn: 'শায়খগণ',          color: 'text-teal-600 bg-teal-50 border-teal-100', darkColor: 'dark:text-teal-400 dark:bg-teal-900/10 dark:border-teal-900' },
   '0': { en: 'Selected',      bn: 'নির্বাচিত',        color: 'text-gray-700 bg-gray-50 border-gray-200',  darkColor: 'dark:text-gray-300 dark:bg-zinc-800 dark:border-zinc-700' },
   '1': { en: 'Students',      bn: 'ছাত্রগণ',          color: 'text-purple-600 bg-purple-50 border-purple-100', darkColor: 'dark:text-purple-400 dark:bg-purple-900/10 dark:border-purple-900' },
   '2': { en: 'Grandstudents', bn: 'ছাত্রের ছাত্র',    color: 'text-purple-700 bg-purple-50 border-purple-200', darkColor: 'dark:text-purple-400 dark:bg-purple-900/20 dark:border-purple-800' },
};

// ─── Controls ─────────────────────────────────────────────────────────────────
function GraphControls({
  zoomIn, zoomOut, resetTransform, isFullScreen, setIsFullScreen,
}: {
  zoomIn: () => void; zoomOut: () => void; resetTransform: () => void;
  isFullScreen: boolean; setIsFullScreen: (v: boolean) => void;
}) {
  return (
    <div className="fixed top-3 right-3 flex flex-col gap-2 z-[9999]">
      <button
        onClick={() => setIsFullScreen(!isFullScreen)}
        className="flex items-center justify-center w-10 h-10 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
        title={isFullScreen ? 'Exit fullscreen' : 'Fullscreen'}
      >
        {isFullScreen
          ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
        }
      </button>
      <div className="flex flex-col bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-lg overflow-hidden">
        <button onClick={zoomIn} className="p-2.5 hover:bg-gray-50 dark:hover:bg-zinc-800 text-gray-600 dark:text-gray-400 border-b border-gray-100 dark:border-zinc-800 transition-colors" title="Zoom in">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
        </button>
        <button onClick={zoomOut} className="p-2.5 hover:bg-gray-50 dark:hover:bg-zinc-800 text-gray-600 dark:text-gray-400 border-b border-gray-100 dark:border-zinc-800 transition-colors" title="Zoom out">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4"/></svg>
        </button>
        <button onClick={resetTransform} className="p-2.5 hover:bg-gray-50 dark:hover:bg-zinc-800 text-gray-600 dark:text-gray-400 transition-colors" title="Reset view">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function NarratorGraph({
  nodes, edges, centerId, darkMode, lang, onNodeClick,
  width: _containerWidth = 800,
  height: _containerHeight = 600,
}: Props) {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    document.body.style.overflow = isFullScreen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isFullScreen]);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setIsFullScreen(false); setSelectedId(null); }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);
  useEffect(() => { if (isFullScreen) setIsFullScreen(false); }, [centerId]);

  const zoomIn  = useCallback(() => transformRef.current?.zoomIn(0.25), []);
  const zoomOut = useCallback(() => transformRef.current?.zoomOut(0.25), []);
  const resetFn = useCallback(() => transformRef.current?.resetTransform(0.3), []);

  // ── Level assignment ──
  const levelMap = useMemo(() => buildLevelMap(nodes, edges, centerId), [nodes, edges, centerId]);

  const LEVELS = [-2, -1, 0, 1, 2] as const;

  // ── Group nodes by level ──
  const levelGroups = useMemo(() => {
    const g = new Map<number, NarratorNode[]>();
    LEVELS.forEach(l => g.set(l, []));
    for (const n of nodes) {
      const l = levelMap.get(Number(n.id)) ?? 0;
      const capped = Math.max(-2, Math.min(2, l));
      g.get(capped)!.push(n);
    }
    return g;
  }, [nodes, levelMap]);

  const activeLevels = useMemo(
    () => LEVELS.filter(l => (levelGroups.get(l)?.length ?? 0) > 0),
    [levelGroups]
  );

  // ── Node positions (LTR columns) ──
  const { positions, canvasW, canvasH } = useMemo(() => {
    const pos = new Map<number, { x: number; y: number; isCenter: boolean }>();

    // Canvas height — driven by the tallest column
    const maxColCount = Math.max(...activeLevels.map(l => Math.min(levelGroups.get(l)!.length, MAX_COL)), 1);
    const cH = Math.max(maxColCount * (NODE_H + V_STEP) - V_STEP, CENTER_H);
    const cW = activeLevels.length * H_STEP + PAD_X * 2;
    const midY = cH / 2;

    activeLevels.forEach((lvl, colIdx) => {
      const colNodes = levelGroups.get(lvl)!.slice(0, MAX_COL);
      const isLvlCenter = lvl === 0;
      const nW = isLvlCenter ? CENTER_W : NODE_W;
      const nH = isLvlCenter ? CENTER_H : NODE_H;

      // Column X: centre of node in this column
      const x = PAD_X + colIdx * H_STEP + nW / 2;

      // Stack nodes vertically, centred around midY
      const totalH = colNodes.length * nH + (colNodes.length - 1) * V_STEP;
      const startY  = midY - totalH / 2 + nH / 2;

      colNodes.forEach((n, rowIdx) => {
        pos.set(Number(n.id), {
          x,
          y: startY + rowIdx * (nH + V_STEP),
          isCenter: Number(n.id) === Number(centerId),
        });
      });
    });

    return { positions: pos, canvasW: cW, canvasH: cH };
  }, [levelGroups, activeLevels, centerId]);

  // ── Highlighted node connections ──
  const connectedIds = useMemo(() => {
    if (selectedId === null) return new Set<number>();
    const ids = new Set<number>();
    for (const e of edges) {
      const from = Number(e.from_narrator_id), to = Number(e.to_narrator_id);
      if (from === selectedId || to === selectedId) { ids.add(from); ids.add(to); }
    }
    return ids;
  }, [selectedId, edges]);

  // ── Edge rendering ──
  const edgePaths = useMemo(() => {
    return edges.map((edge, i) => {
      const from = Number(edge.from_narrator_id), to = Number(edge.to_narrator_id);
      const s = positions.get(from), e = positions.get(to);
      if (!s || !e) return null;

      const cId = Number(centerId);
      // from=TEACHER, to=STUDENT
      const isStudentEdge = from === cId;  // center is teacher → to is student (right)
      const isTeacherEdge = to === cId;    // center is student → from is teacher (left)
      const isDirect = isTeacherEdge || isStudentEdge;

      // Skip self-loops
      if (from === to) return null;

      // Determine highlight state
      const isHighlighted = selectedId !== null && (from === selectedId || to === selectedId);
      const isDimmed = selectedId !== null && !isHighlighted;

      // Horizontal S-curve: from exits right edge, to enters left edge
      // from=teacher (left column), to=student (right column) → curve goes left-to-right
      const sHalfW = (s.isCenter ? CENTER_W : NODE_W) / 2;
      const eHalfW = (e.isCenter ? CENTER_W : NODE_W) / 2;
      const startX = s.x + sHalfW;  // right edge of teacher (source)
      const endX   = e.x - eHalfW;  // left edge of student (target)
      const midX   = (startX + endX) / 2;
      // Same-column guard: bow the curve so nodes in same column don't get straight lines
      const dy = Math.abs(e.y - s.y);
      const bow = dy < 8 ? 60 : 0;
      const path = `M ${startX} ${s.y} C ${midX + bow} ${s.y}, ${midX - bow} ${e.y}, ${endX} ${e.y}`;

      let stroke: string;
      let strokeWidth: number;
      let opacity: number;

      if (isDimmed) {
        stroke = darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
        strokeWidth = 1;
        opacity = 1;
      } else if (isHighlighted) {
        stroke = 'rgba(251,191,36,1)'; // amber highlight
        strokeWidth = 3;
        opacity = 1;
      } else if (isTeacherEdge) {
        stroke = 'rgba(20,184,166,0.85)';
        strokeWidth = isDirect ? 3 : 1.5;
        opacity = 1;
      } else if (isStudentEdge) {
        stroke = 'rgba(168,85,247,0.85)';
        strokeWidth = isDirect ? 3 : 1.5;
        opacity = 1;
      } else {
        stroke = darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)';
        strokeWidth = 1.5;
        opacity = 1;
      }

      const markerId = isHighlighted ? 'arr-hl'
        : isTeacherEdge ? 'arr-teacher'
        : isStudentEdge ? 'arr-student'
        : isDimmed ? 'arr-dim'
        : 'arr-other';

      return (
        <path
          key={`e-${i}`}
          d={path}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeOpacity={opacity}
          markerEnd={`url(#${markerId})`}
          className="transition-all duration-200"
        />
      );
    });
  }, [edges, positions, centerId, selectedId, darkMode]);

  // ── Level band backgrounds (vertical columns) ──
  const levelBands = useMemo(() => {
    return activeLevels.map((lvl, colIdx) => {
      const nW = lvl === 0 ? CENTER_W : NODE_W;
      const x = PAD_X + colIdx * H_STEP;
      const isTeacher = lvl < 0;
      const isStudent = lvl > 0;
      return { lvl, x, nW, isTeacher, isStudent };
    });
  }, [activeLevels]);

  if (!mounted) return null;

  const graphContent = (
    <div className="relative w-full h-full select-none" onClick={() => setSelectedId(null)}>

      {/* Legend — bottom-left */}
      <div className="absolute bottom-3 left-3 z-[999] flex flex-col gap-1.5 bg-white/95 dark:bg-zinc-900/95 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 shadow-md pointer-events-none">
        <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Legend</p>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-teal-500 flex-shrink-0"/>
          <span className="text-[10px] text-gray-600 dark:text-gray-400">Selected narrator</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full border-2 flex-shrink-0" style={{ borderColor: REL_BORDER.thiqah }}/>
          <span className="text-[10px] text-gray-600 dark:text-gray-400">Trustworthy (thiqah)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full border-2 flex-shrink-0" style={{ borderColor: REL_BORDER.saduq }}/>
          <span className="text-[10px] text-gray-600 dark:text-gray-400">Truthful (saduq)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full border-2 flex-shrink-0" style={{ borderColor: REL_BORDER.daif }}/>
          <span className="text-[10px] text-gray-600 dark:text-gray-400">Weak (daif)</span>
        </div>
        <div className="h-px bg-gray-100 dark:bg-zinc-700 my-0.5"/>
        <div className="flex items-center gap-2">
          <svg width="22" height="8" className="flex-shrink-0">
            <line x1="0" y1="4" x2="16" y2="4" stroke="rgba(20,184,166,0.9)" strokeWidth="2"/>
            <polygon points="14,1.5 22,4 14,6.5" fill="rgba(20,184,166,0.9)"/>
          </svg>
          <span className="text-[10px] text-gray-600 dark:text-gray-400">Teacher → center</span>
        </div>
        <div className="flex items-center gap-2">
          <svg width="22" height="8" className="flex-shrink-0">
            <line x1="0" y1="4" x2="16" y2="4" stroke="rgba(168,85,247,0.9)" strokeWidth="2"/>
            <polygon points="14,1.5 22,4 14,6.5" fill="rgba(168,85,247,0.9)"/>
          </svg>
          <span className="text-[10px] text-gray-600 dark:text-gray-400">Center → student</span>
        </div>
        <p className="text-[9px] text-gray-400 dark:text-gray-600 mt-0.5">Tap to highlight · Tap again to open</p>
      </div>

<TransformWrapper 
        ref={transformRef} 
        initialScale={0.85} 
        centerOnInit 
        minScale={0.2} 
        maxScale={3}
      >
        <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
          <div style={{ width: canvasW, height: canvasH, position: 'relative' }}>

            {/* Level band backgrounds (vertical columns) */}
            {levelBands.map(({ lvl, x, nW, isTeacher, isStudent }) => (
              <div
                key={`band-${lvl}`}
                className="absolute top-0 bottom-0 pointer-events-none"
                style={{
                  left: x - 12,
                  width: nW + 24,
                  background: isTeacher
                    ? 'rgba(20,184,166,0.04)'
                    : isStudent
                    ? 'rgba(168,85,247,0.04)'
                    : 'transparent',
                  borderLeft:  isTeacher ? '1px solid rgba(20,184,166,0.12)' : isStudent ? '1px solid rgba(168,85,247,0.12)' : 'none',
                  borderRight: isTeacher ? '1px solid rgba(20,184,166,0.12)' : isStudent ? '1px solid rgba(168,85,247,0.12)' : 'none',
                }}
              />
            ))}

            {/* Level labels — top of each column */}
            {activeLevels.map((lvl, colIdx) => {
              const nW = lvl === 0 ? CENTER_W : NODE_W;
              const cx = PAD_X + colIdx * H_STEP + nW / 2;
              const meta = LEVEL_META[lvl];
              const label = lang === 'bn' ? meta.bn : meta.en;
              const count = levelGroups.get(lvl)!.length;
              const truncated = count > MAX_COL;
              return (
                <div
                  key={`lbl-${lvl}`}
                  className="absolute pointer-events-none flex flex-col items-center gap-0.5"
                  style={{ left: cx - 56, top: 8, width: 112 }}
                >
                  <span className={clsx(
                    'text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-md border w-full text-center',
                    meta.color, meta.darkColor
                  )}>
                    {label}
                  </span>
                  {truncated && (
                    <span className="text-[8px] text-gray-400 dark:text-gray-600">
                      +{count - MAX_COL} more
                    </span>
                  )}
                </div>
              );
            })}

            {/* Edges SVG */}
            <svg
              width={canvasW}
              height={canvasH}
              className="absolute inset-0 pointer-events-none"
              style={{ overflow: 'visible' }}
            >
              <defs>
                <marker id="arr-teacher" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0 2 L10 6 L0 10z" fill="rgba(20,184,166,0.9)"/>
                </marker>
                <marker id="arr-student" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0 2 L10 6 L0 10z" fill="rgba(168,85,247,0.9)"/>
                </marker>
                <marker id="arr-hl" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0 2 L10 6 L0 10z" fill="rgba(251,191,36,1)"/>
                </marker>
                <marker id="arr-other" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                  <path d="M0 2 L10 6 L0 10z" fill={darkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.18)'}/>
                </marker>
                <marker id="arr-dim" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                  <path d="M0 2 L10 6 L0 10z" fill={darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}/>
                </marker>
              </defs>
              {edgePaths}
            </svg>

            {/* Nodes */}
            {nodes.map(node => {
              const nId = Number(node.id);
              const pos = positions.get(nId);
              if (!pos) return null;

              const isCenter = nId === Number(centerId);
              const isSelected = nId === selectedId;
              const isConnected = selectedId !== null && connectedIds.has(nId);
              const isDimmed = selectedId !== null && !isSelected && !isConnected;
              const rel = node.reliability ?? (node.tabaqah === 1 ? 'thiqah' : null);
              const { primary, secondary } = getLabel(node, lang);
              const primaryIsArabic = /[\u0600-\u06FF]/.test(primary);

              const nW = isCenter ? CENTER_W : NODE_W;
              const nH = isCenter ? CENTER_H : NODE_H;

              const borderColor = isSelected
                ? '#fbbf24' // amber
                : isConnected
                ? '#fbbf24'
                : isCenter
                ? '#5eead4' // teal-300
                : rel
                ? REL_BORDER[rel]
                : (darkMode ? '#3f3f46' : '#e5e7eb');

              const glowColor = isSelected || isConnected
                ? 'rgba(251,191,36,0.35)'
                : isCenter
                ? 'rgba(20,184,166,0.4)'
                : rel
                ? REL_GLOW[rel]
                : 'transparent';

              return (
                <button
                  key={nId}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    if (isSelected) {
                      onNodeClick(node);
                    } else {
                      setSelectedId(nId);
                    }
                  }}
                  className={clsx(
                    'absolute flex flex-col items-center justify-center rounded-2xl border-2',
                    'transition-all duration-200 focus:outline-none',
                    isCenter
                      ? 'bg-teal-500 text-white z-[80]'
                      : darkMode
                      ? 'bg-zinc-900 text-gray-100 z-[20]'
                      : 'bg-white text-gray-900 z-[20]',
                    isDimmed ? 'opacity-25' : 'opacity-100',
                    !isDimmed && 'hover:scale-105 active:scale-95',
                  )}
                  style={{
                    left: pos.x - nW / 2,
                    top:  pos.y - nH / 2,
                    width: nW,
                    height: nH,
                    borderColor,
                    boxShadow: isDimmed
                      ? 'none'
                      : `0 0 0 ${isSelected || isConnected ? 3 : 0}px ${glowColor}, 0 4px 16px ${glowColor}, 0 1px 4px rgba(0,0,0,0.08)`,
                    padding: '6px 10px',
                  }}
                >
                  {/* Arabic name */}
                  <span
                    className={clsx(
                      'font-arabic text-center w-full leading-tight',
                      isCenter ? 'text-[14px] text-white font-semibold' : 'text-[12px]',
                      !isCenter && (darkMode ? 'text-gray-100' : 'text-gray-900')
                    )}
                    dir="rtl"
                    style={{ maxWidth: nW - 20, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {node.name_ar}
                  </span>

                  {/* Transliterated / local name */}
                  {primary && !primaryIsArabic && (
                    <span
                      className={clsx(
                        'text-center w-full leading-tight mt-0.5',
                        isCenter ? 'text-[10px] text-teal-100' : 'text-[9px]',
                        !isCenter && (darkMode ? 'text-gray-400' : 'text-gray-500')
                      )}
                      style={{ maxWidth: nW - 20, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {primary}
                    </span>
                  )}

                  {/* Death year */}
                  {node.death_year && (
                    <span className={clsx(
                      'text-[8px] mt-0.5',
                      isCenter ? 'text-teal-200' : (darkMode ? 'text-gray-500' : 'text-gray-400')
                    )}>
                      d. {node.death_year} AH
                    </span>
                  )}

                  {/* Reliability dot — top-right */}
                  {rel && !isCenter && (
                    <span
                      className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full border-2 border-white dark:border-zinc-900"
                      style={{ background: REL_BORDER[rel] }}
                    />
                  )}

                  {/* Duplicate indicator — top-left */}
                  {(node as any)._hasDuplicates && !isCenter && (
                    <span className="absolute -top-1.5 -left-1.5 w-3 h-3 rounded-full bg-amber-400 border-2 border-white dark:border-zinc-900" title="Multiple entries"/>
                  )}

                </button>
              );
            })}
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );

  const containerCls = clsx(
    'bg-gray-50 dark:bg-zinc-950 transition-all overflow-hidden',
    isFullScreen ? 'fixed inset-0 z-[100] w-screen h-screen' : 'relative rounded-2xl border border-gray-200 dark:border-zinc-800 w-full'
  );

  const containerEl = (
    <div className={containerCls}>
      {graphContent}
    </div>
  );

  return (
    <>
      {mounted && (
        <GraphControls
          zoomIn={zoomIn} zoomOut={zoomOut} resetTransform={resetFn}
          isFullScreen={isFullScreen} setIsFullScreen={setIsFullScreen}
        />
      )}
      {isFullScreen ? createPortal(containerEl, document.body) : containerEl}
    </>
  );
}
