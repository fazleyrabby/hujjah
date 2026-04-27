'use client';

/**
 * components/NarratorGraph.tsx
 *
 * Vertical sanad tree: grandteachers → teachers → selected → students → grandstudents.
 * Knowledge flows top-to-bottom, mirroring how hadith was transmitted.
 * Missing EN/BN names are auto-transliterated from Arabic.
 */

import { useMemo, useEffect, useState } from 'react';
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
  width?: number;
  height?: number;
}

// ─── Layout constants ──────────────────────────────────────────────────────────

const NODE_W    = 148;  // px — wide enough for English names
const NODE_H    = 56;   // px — two text lines
const H_GAP     = 18;   // horizontal gap between sibling nodes
const V_GAP     = 170;  // vertical gap between levels
const PAD_X     = 80;   // canvas horizontal padding
const PAD_Y     = 60;   // canvas vertical padding
const MAX_ROW   = 12;   // max nodes shown per level before truncation

// ─── Reliability colours ──────────────────────────────────────────────────────

const RELIABILITY_RING: Record<string, string> = {
  thiqah: 'border-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.45)]',
  saduq:  'border-blue-400   shadow-[0_0_10px_rgba(96,165,250,0.45)]',
  daif:   'border-orange-400 shadow-[0_0_10px_rgba(251,146,60,0.45)]',
  mawdu:  'border-rose-500   shadow-[0_0_10px_rgba(244,63,94,0.45)]',
};

const RELIABILITY_DOT: Record<string, string> = {
  thiqah: 'bg-emerald-400',
  saduq:  'bg-blue-400',
  daif:   'bg-orange-400',
  mawdu:  'bg-rose-500',
};

// ─── Arabic → Latin transliteration ──────────────────────────────────────────

/** Well-known Islamic name words mapped directly to their standard romanisation. */
const WORD_MAP: Record<string, string> = {
  'محمد':'Muhammad','أحمد':'Ahmad','حمد':'Hamad','علي':'Ali','عليّ':'Ali',
  'عمر':'Umar','عثمان':'Uthman','أبو':'Abu','أبي':'Abi','أم':'Umm',
  'ابن':'Ibn','بن':'ibn','بنت':'bint','عبد':'Abd','الله':'Allah',
  'عبدالله':'Abdullah','عبد الله':'Abd Allah','الرحمن':'al-Rahman',
  'يحيى':'Yahya','موسى':'Musa','عيسى':'Isa','سفيان':'Sufyan',
  'مالك':'Malik','أنس':'Anas','سعيد':'Sa\'id','حماد':'Hammad',
  'إبراهيم':'Ibrahim','إسحاق':'Ishaq','يوسف':'Yusuf','داود':'Dawud',
  'سليمان':'Sulayman','جعفر':'Ja\'far','خالد':'Khalid','زيد':'Zayd',
  'عائشة':'A\'isha','فاطمة':'Fatima','حفصة':'Hafsa','خديجة':'Khadija',
  'هريرة':'Huraira','هريرة':'Hurairah','بكر':'Bakr','عمرو':'Amr',
  'معاذ':'Mu\'adh','بلال':'Bilal','صهيب':'Suhayb','عبيد':'Ubayd',
  'قتيبة':'Qutayba','شعبة':'Shu\'ba','وكيع':'Waki\'','يزيد':'Yazid',
  'حسن':'Hasan','حسين':'Husayn','عطاء':'Ata\'','طاوس':'Tawus',
  'مجاهد':'Mujahid','نافع':'Nafi\'','زهري':'Zuhri','زهرة':'Zahra',
  'الزهري':'al-Zuhri','البخاري':'al-Bukhari','مسلم':'Muslim',
  'الترمذي':'al-Tirmidhi','النسائي':'al-Nasa\'i','ماجه':'Majah',
  'داود':'Dawud','حنبل':'Hanbal','الشافعي':'al-Shafi\'i',
};

/** Character-level fallback map (strips diacritics first). */
const CHAR_MAP: Record<string, string> = {
  'ا':'a','أ':'a','إ':'i','آ':'a','ٱ':'a','ء':"'",'ئ':'i','ؤ':'w',
  'ب':'b','ت':'t','ث':'th','ج':'j','ح':'h','خ':'kh',
  'د':'d','ذ':'dh','ر':'r','ز':'z','س':'s','ش':'sh',
  'ص':'s','ض':'d','ط':'t','ظ':'z','ع':"'",'غ':'gh',
  'ف':'f','ق':'q','ك':'k','ل':'l','م':'m','ن':'n',
  'ه':'h','و':'w','ي':'y','ى':'a','ة':'a',
};

function charTranslit(word: string): string {
  let out = '';
  for (const ch of word) out += CHAR_MAP[ch] ?? ch;
  return out ? out[0].toUpperCase() + out.slice(1) : out;
}

export function transliterateArabic(text: string): string {
  if (!text) return '';
  // Strip diacritics
  const clean = text.replace(/[\u064B-\u0652\u0670\u0640]/g, '').trim();

  return clean.split(/\s+/).map(word => {
    if (WORD_MAP[word]) return WORD_MAP[word];

    // Handle ال prefix (definite article)
    if (word.startsWith('ال') && word.length > 2) {
      const rest = word.slice(2);
      // Sun letters assimilate: ت ث د ذ ر ز س ش ص ض ط ظ ل ن
      const sunLetters = new Set(['ت','ث','د','ذ','ر','ز','س','ش','ص','ض','ط','ظ','ل','ن']);
      const first = rest[0] ?? '';
      const prefix = sunLetters.has(first) ? 'al-' : 'al-';
      return prefix + charTranslit(rest);
    }

    return charTranslit(word);
  }).join(' ');
}

// ─── Label helper ─────────────────────────────────────────────────────────────

function getNodeLabels(
  node: NarratorNode,
  lang: 'en' | 'bn' | 'ar'
): { primary: string; secondary: string | null; transliterated: boolean } {
  if (lang === 'ar') return { primary: node.name_ar, secondary: null, transliterated: false };

  const local = lang === 'bn' ? (node.name_bn ?? node.name_en) : node.name_en;
  if (local) return { primary: local, secondary: node.name_ar, transliterated: false };

  // Transliterate Arabic → readable Latin
  const translit = transliterateArabic(node.name_ar);
  return { primary: translit, secondary: node.name_ar, transliterated: true };
}

// ─── Level assignment ─────────────────────────────────────────────────────────

/**
 * Assign each node a vertical level relative to center:
 *  -2 grandteacher, -1 teacher, 0 center, +1 student, +2 grandstudent
 */
function buildLevelMap(
  nodes: NarratorNode[],
  edges: NarratorEdge[],
  centerId: number
): Map<number, number> {
  const level = new Map<number, number>();
  level.set(centerId, 0);

  // Direct teachers: X → center
  edges.forEach(e => {
    if (e.to_narrator_id === centerId && !level.has(e.from_narrator_id))
      level.set(e.from_narrator_id, -1);
  });
  // Direct students: center → X
  edges.forEach(e => {
    if (e.from_narrator_id === centerId && !level.has(e.to_narrator_id))
      level.set(e.to_narrator_id, 1);
  });

  const teacherIds  = new Set([...level.entries()].filter(([,l]) => l === -1).map(([id]) => id));
  const studentIds  = new Set([...level.entries()].filter(([,l]) => l ===  1).map(([id]) => id));

  // Grandteachers: X → teacher
  edges.forEach(e => {
    if (teacherIds.has(e.to_narrator_id) && !level.has(e.from_narrator_id))
      level.set(e.from_narrator_id, -2);
  });
  // Grandstudents: student → X
  edges.forEach(e => {
    if (studentIds.has(e.from_narrator_id) && !level.has(e.to_narrator_id))
      level.set(e.to_narrator_id, 2);
  });

  // Any remaining node: assign by tabaqah proximity
  nodes.forEach(n => {
    if (!level.has(n.id)) level.set(n.id, 0);
  });

  return level;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NarratorGraph({
  nodes,
  edges,
  centerId,
  darkMode,
  lang,
  onNodeClick,
  width: containerWidth = 672,
  height = 560,
}: Props) {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    document.body.style.overflow = isFullScreen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isFullScreen]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsFullScreen(false); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  // ── Level assignment ──
  const levelMap = useMemo(
    () => buildLevelMap(nodes, edges, centerId),
    [nodes, edges, centerId]
  );

  // ── Group by level, cap per row ──
  const LEVEL_ORDER = [-2, -1, 0, 1, 2] as const;
  const LEVEL_LABELS: Record<number, { en: string; bn: string }> = {
    '-2': { en: 'Grandteachers', bn: 'পরোক্ষ শায়খ' },
    '-1': { en: 'Teachers',      bn: 'শায়খগণ' },
     '0': { en: 'Selected',      bn: 'নির্বাচিত' },
     '1': { en: 'Students',      bn: 'ছাত্রগণ' },
     '2': { en: 'Grandstudents', bn: 'পরোক্ষ ছাত্র' },
  };

  const levelGroups = useMemo(() => {
    const groups = new Map<number, NarratorNode[]>();
    LEVEL_ORDER.forEach(l => groups.set(l, []));
    nodes.forEach(n => {
      const l = levelMap.get(n.id) ?? 0;
      const capped = Math.max(-2, Math.min(2, l));
      groups.get(capped)!.push(n);
    });
    // Sort each level: center first, then by hadith connection count
    return groups;
  }, [nodes, levelMap]);

  // ── Compute node positions (top-down tree) ──
  const { nodePositions, totalWidth, totalHeight } = useMemo(() => {
    const pos = new Map<number, { x: number; y: number }>();

    // Only include levels that have nodes
    const activeLevels = LEVEL_ORDER.filter(l => (levelGroups.get(l)?.length ?? 0) > 0);
    const maxRowNodes = Math.max(...activeLevels.map(l => Math.min(levelGroups.get(l)!.length, MAX_ROW)), 1);

    const canvasW = Math.max(
      containerWidth,
      maxRowNodes * (NODE_W + H_GAP) + PAD_X * 2
    );
    const canvasH = activeLevels.length * V_GAP + PAD_Y * 2 + NODE_H;

    activeLevels.forEach((level, lIdx) => {
      const rawNodes = levelGroups.get(level)!;
      const rowNodes = rawNodes.slice(0, MAX_ROW);
      const y = PAD_Y + lIdx * V_GAP + NODE_H / 2;

      const rowW = rowNodes.length * NODE_W + (rowNodes.length - 1) * H_GAP;
      const startX = (canvasW - rowW) / 2;

      rowNodes.forEach((node, nIdx) => {
        pos.set(node.id, { x: startX + nIdx * (NODE_W + H_GAP) + NODE_W / 2, y });
      });
    });

    return { nodePositions: pos, totalWidth: canvasW, totalHeight: canvasH };
  }, [levelGroups, containerWidth, isFullScreen]);

  // ── Edge paths ──
  const edgePaths = useMemo(() => {
    return edges.map((edge, i) => {
      const s = nodePositions.get(edge.from_narrator_id);
      const e = nodePositions.get(edge.to_narrator_id);
      if (!s || !e) return null;

      // Vertical bezier: control points push curve outward
      const midY = (s.y + e.y) / 2;
      const path = `M ${s.x} ${s.y + NODE_H / 2} C ${s.x} ${midY}, ${e.x} ${midY}, ${e.x} ${e.y - NODE_H / 2}`;

      const isTeacher = edge.to_narrator_id === centerId;
      const isStudent = edge.from_narrator_id === centerId;
      const isDirect  = isTeacher || isStudent;

      const stroke = isTeacher
        ? 'rgba(20,184,166,0.7)'
        : isStudent
        ? 'rgba(168,85,247,0.7)'
        : darkMode ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';

      const marker = isTeacher ? 'url(#arr-teacher)' : isStudent ? 'url(#arr-student)' : 'url(#arr-subtle)';

      return (
        <path
          key={`e-${i}`}
          d={path}
          fill="none"
          stroke={stroke}
          strokeWidth={isDirect ? 2.5 : 1}
          markerEnd={marker}
        />
      );
    });
  }, [edges, nodePositions, centerId, darkMode]);

  // ── Level row labels ──
  const rowLabels = useMemo(() => {
    const activeLevels = LEVEL_ORDER.filter(l => (levelGroups.get(l)?.length ?? 0) > 0);
    return activeLevels.map((level, lIdx) => {
      const y = PAD_Y + lIdx * V_GAP + NODE_H / 2;
      const label = LEVEL_LABELS[level][lang === 'bn' ? 'bn' : 'en'];
      const count = levelGroups.get(level)!.length;
      const truncated = count > MAX_ROW;
      return { level, y, label, count, truncated };
    });
  }, [levelGroups, lang]);

  const content = (
    <div className={clsx(
      'bg-white dark:bg-zinc-950 border-gray-100 dark:border-zinc-800 transition-all overflow-hidden',
      isFullScreen
        ? 'fixed inset-0 z-[100] w-screen h-screen'
        : 'relative rounded-xl border w-full'
    )}
      style={!isFullScreen ? { height } : {}}
    >
      <TransformWrapper initialScale={0.85} centerOnInit minScale={0.2} maxScale={3}>
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            {/* ── UI overlay ── */}
            <div className="absolute inset-0 pointer-events-none z-[70]">

              {/* Controls */}
              <div className="absolute top-3 right-3 flex flex-col gap-2 pointer-events-auto">
                <button
                  onClick={() => setIsFullScreen(f => !f)}
                  className="flex items-center justify-center w-9 h-9 bg-white/95 dark:bg-zinc-900/95 border border-gray-200 dark:border-zinc-800 rounded-lg shadow-md hover:bg-gray-50 dark:hover:bg-zinc-800 text-gray-500 dark:text-gray-400 backdrop-blur-md transition-colors"
                  title={isFullScreen ? 'Exit fullscreen' : 'Fullscreen'}
                >
                  {isFullScreen
                    ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                    : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
                  }
                </button>
                <div className="flex flex-col bg-white/95 dark:bg-zinc-900/95 border border-gray-200 dark:border-zinc-800 rounded-lg shadow-md backdrop-blur-md overflow-hidden">
                  <button onClick={() => zoomIn()} className="p-2 hover:bg-gray-50 dark:hover:bg-zinc-800 text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-zinc-800 transition-colors" title="Zoom in">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                  </button>
                  <button onClick={() => zoomOut()} className="p-2 hover:bg-gray-50 dark:hover:bg-zinc-800 text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-zinc-800 transition-colors" title="Zoom out">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4"/></svg>
                  </button>
                  <button onClick={() => resetTransform()} className="p-2 hover:bg-gray-50 dark:hover:bg-zinc-800 text-gray-500 dark:text-gray-400 transition-colors" title="Reset view">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                  </button>
                </div>
              </div>

              {/* Legend */}
              <div className="absolute bottom-4 left-4 flex flex-col gap-1.5 bg-white/95 dark:bg-zinc-900/95 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-800 text-[10px] shadow-xl backdrop-blur-md pointer-events-auto">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-500"/>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">Selected</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"/>
                  <span className="text-gray-500 dark:text-gray-400">Trustworthy</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-400"/>
                  <span className="text-gray-500 dark:text-gray-400">Weak (Da'if)</span>
                </div>
                <div className="h-px bg-gray-100 dark:bg-zinc-800"/>
                <div className="flex items-center gap-2">
                  <svg width="22" height="8" className="flex-shrink-0">
                    <line x1="0" y1="4" x2="16" y2="4" stroke="rgba(20,184,166,0.9)" strokeWidth="1.5"/>
                    <polygon points="16,1 22,4 16,7" fill="rgba(20,184,166,0.9)"/>
                  </svg>
                  <span className="text-gray-500 dark:text-gray-400">Taught selected</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg width="22" height="8" className="flex-shrink-0">
                    <line x1="0" y1="4" x2="16" y2="4" stroke="rgba(168,85,247,0.9)" strokeWidth="1.5"/>
                    <polygon points="16,1 22,4 16,7" fill="rgba(168,85,247,0.9)"/>
                  </svg>
                  <span className="text-gray-500 dark:text-gray-400">Learned from selected</span>
                </div>
                <div className="text-[9px] text-gray-400 dark:text-gray-600 font-medium pt-0.5">
                  {isFullScreen ? 'ESC • PINCH TO ZOOM' : 'DRAG • SCROLL • ZOOM'}
                </div>
              </div>
            </div>

            {/* ── Canvas ── */}
            <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
              <div style={{ width: totalWidth, height: totalHeight, position: 'relative' }}>

                {/* Row labels on left edge */}
                {rowLabels.map(({ level, y, label, count, truncated }) => (
                  <div
                    key={`lbl-${level}`}
                    className="absolute flex items-center gap-1.5 pointer-events-none"
                    style={{ left: 8, top: y - 10, transform: 'translateY(-50%)' }}
                  >
                    <span className={clsx(
                      'text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded',
                      level === 0
                        ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400'
                        : level < 0
                        ? 'bg-teal-50 text-teal-600 dark:bg-zinc-800 dark:text-teal-500'
                        : 'bg-purple-50 text-purple-600 dark:bg-zinc-800 dark:text-purple-400'
                    )}>
                      {label}
                    </span>
                    {truncated && (
                      <span className="text-[9px] text-gray-400">+{count - MAX_ROW}</span>
                    )}
                  </div>
                ))}

                {/* Edges */}
                <svg width={totalWidth} height={totalHeight} className="absolute inset-0 pointer-events-none overflow-visible">
                  <defs>
                    <marker id="arr-subtle"  viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                      <path d="M0 1.5 L8.5 5 L0 8.5z" fill={darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}/>
                    </marker>
                    <marker id="arr-teacher" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                      <path d="M0 1.5 L8.5 5 L0 8.5z" fill="rgba(20,184,166,0.95)"/>
                    </marker>
                    <marker id="arr-student" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                      <path d="M0 1.5 L8.5 5 L0 8.5z" fill="rgba(168,85,247,0.95)"/>
                    </marker>
                  </defs>
                  {edgePaths}
                </svg>

                {/* Nodes */}
                {nodes.map(node => {
                  const pos = nodePositions.get(node.id);
                  if (!pos) return null;

                  const isCenter = node.id === centerId;
                  const rel = node.reliability ?? (node.tabaqah === 1 ? 'thiqah' : null);
                  const { primary, secondary, transliterated } = getNodeLabels(node, lang);
                  const primaryIsArabic = /[\u0600-\u06FF]/.test(primary);

                  return (
                    <button
                      key={node.id}
                      onClick={() => onNodeClick(node)}
                      className={clsx(
                        'absolute group transition-all duration-200 hover:z-[90] focus:outline-none',
                        isCenter ? 'z-[80]' : 'z-[20]'
                      )}
                      style={{
                        left: pos.x - NODE_W / 2,
                        top:  pos.y - NODE_H / 2,
                        width: NODE_W,
                        height: NODE_H,
                      }}
                    >
                      <div className={clsx(
                        'w-full h-full rounded-xl border-2 flex flex-col items-center justify-center px-2 transition-all duration-200',
                        'group-hover:scale-105 group-hover:shadow-lg',
                        isCenter
                          ? 'bg-teal-500 border-teal-300 shadow-teal-500/40 shadow-lg'
                          : clsx(
                              'bg-white dark:bg-zinc-900',
                              rel ? RELIABILITY_RING[rel] : 'border-gray-200 dark:border-zinc-700'
                            )
                      )}>
                        {/* Primary name */}
                        <span className={clsx(
                          'leading-tight text-center w-full truncate',
                          primaryIsArabic ? 'font-arabic text-[12px]' : 'font-medium text-[11px] tracking-tight',
                          isCenter ? 'text-white font-bold' : 'text-gray-900 dark:text-gray-100',
                          transliterated && !isCenter ? 'italic' : ''
                        )}>
                          {primary}
                        </span>

                        {/* Secondary (Arabic) */}
                        {secondary && (
                          <span className={clsx(
                            'font-arabic text-[9px] mt-0.5 w-full text-center truncate',
                            isCenter ? 'text-teal-100' : 'text-gray-400 dark:text-gray-600'
                          )} dir="rtl">
                            {secondary}
                          </span>
                        )}

                        {/* Reliability dot */}
                        {rel && !isCenter && (
                          <span className={clsx(
                            'absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-zinc-900',
                            RELIABILITY_DOT[rel]
                          )}/>
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
  return isFullScreen ? createPortal(content, document.body) : content;
}
