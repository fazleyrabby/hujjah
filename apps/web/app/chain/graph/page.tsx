'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import { AppNav, useTheme, SanadExplorer } from '@hujjah/ui';
import type { NarratorNode, NarratorEdge } from '@hujjah/ui';

type Lang = 'en' | 'bn' | 'ar';
type ViewMode = 'tree' | 'chain' | 'radial';

const GRAPH_I18N = {
  en: {
    back: '← Back to Chain Explorer',
    loading: 'Loading sanad...',
    notFound: 'Narrator not found',
    notFoundDesc: 'Go back to search for a narrator.',
    views: { tree: 'Tree', chain: 'Chain', radial: 'Radial' },
    teachers: 'Teachers',
    students: 'Students',
    died: 'd.',
  },
  bn: {
    back: '← চেইন এক্সপ্লোরারে ফিরুন',
    loading: 'সনদ লোড হচ্ছে...',
    notFound: 'রাবী পাওয়া যায়নি',
    notFoundDesc: 'ফিরে গিয়ে রাবী খুঁজুন।',
    views: { tree: 'ট্রি', chain: 'চেইন', radial: 'রেডিয়াল' },
    teachers: 'শায়খগণ',
    students: 'ছাত্রগণ',
    died: 'মৃ.',
  },
  ar: {
    back: '← العودة إلى مستكشف الإسناد',
    loading: 'جاري تحميل السند...',
    notFound: 'لم يتم العثور على الراوي',
    notFoundDesc: 'ارجع للبحث عن راوٍ.',
    views: { tree: 'شجرة', chain: 'سلسلة', radial: 'شعاعي' },
    teachers: 'الشيوخ',
    students: 'التلاميذ',
    died: 'وف.',
  },
};

/* ─── Helpers ─── */
function getLocalName(n: NarratorNode, lang: Lang) {
  return lang === 'bn' ? (n.name_bn ?? n.name_en ?? null) : (n.name_en ?? n.name_bn ?? null);
}

function getAdj(edges: NarratorEdge[]) {
  const parents = new Map<number, number[]>(); // student → teachers
  const children = new Map<number, number[]>(); // teacher → students
  for (const e of edges) {
    const student = Number(e.from_narrator_id);
    const teacher = Number(e.to_narrator_id);
    if (student === teacher) continue;
    if (!parents.has(student)) parents.set(student, []);
    parents.get(student)!.push(teacher);
    if (!children.has(teacher)) children.set(teacher, []);
    children.get(teacher)!.push(student);
  }
  return { parents, children };
}

/* ─── Chain View ─── */
function ChainView({ nodes, edges, centerId, darkMode, lang, onNodeClick }: {
  nodes: NarratorNode[];
  edges: NarratorEdge[];
  centerId: number;
  darkMode: boolean;
  lang: Lang;
  onNodeClick: (n: NarratorNode) => void;
}) {
  const t = GRAPH_I18N[lang];
  const nodeMap = new Map(nodes.map(n => [Number(n.id), n]));
  const { parents, children } = getAdj(edges);

  const directTeachers = (parents.get(centerId) || [])
    .slice(0, 12)
    .map(id => nodeMap.get(id))
    .filter(Boolean) as NarratorNode[];

  const directStudents = (children.get(centerId) || [])
    .slice(0, 12)
    .map(id => nodeMap.get(id))
    .filter(Boolean) as NarratorNode[];

  const center = nodeMap.get(centerId);
  if (!center) return null;

  const Dot = () => (
    <div className="flex justify-center my-1">
      <div className="flex flex-col items-center gap-0.5">
        <div className="w-px h-4 bg-gray-300 dark:bg-zinc-600" />
        <div className="w-2 h-2 rounded-full border-2 border-gray-400 dark:border-zinc-500" />
        <div className="w-px h-4 bg-gray-300 dark:bg-zinc-600" />
      </div>
    </div>
  );

  return (
    <div className="max-w-md mx-auto py-6 px-4">
      {/* Teachers section */}
      {directTeachers.length > 0 && (
        <div className="mb-2">
          <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider text-center mb-2">
            ↑ {t.teachers} ({directTeachers.length})
          </p>
          <div className="space-y-1">
            {directTeachers.map(n => (
              <button
                key={n.id}
                onClick={() => onNodeClick(n)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-amber-100 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/20 transition-colors text-right"
              >
                <span className="text-[9px] text-amber-600 dark:text-amber-500 flex-shrink-0">
                  {n.death_year ? `${t.died}${n.death_year}` : ''}
                </span>
                <div className="flex flex-col items-end min-w-0">
                  <span dir="rtl" className="text-sm text-gray-900 dark:text-white font-medium truncate max-w-[200px]">{n.name_ar}</span>
                  {getLocalName(n, lang) && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[200px]">{getLocalName(n, lang)}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
          <Dot />
        </div>
      )}

      {/* Center node */}
      <div className="px-4 py-3 rounded-xl border-2 border-teal-500 bg-teal-50 dark:bg-teal-900/20 text-center">
        <p dir="rtl" className="font-bold text-teal-800 dark:text-teal-300 text-base">{center.name_ar}</p>
        {getLocalName(center, lang) && (
          <p className="text-xs text-teal-600 dark:text-teal-500 mt-0.5">{getLocalName(center, lang)}</p>
        )}
        {center.death_year && (
          <p className="text-[10px] text-teal-500 dark:text-teal-600 mt-0.5">{t.died} {center.death_year} AH</p>
        )}
      </div>

      {/* Students section */}
      {directStudents.length > 0 && (
        <div className="mt-2">
          <Dot />
          <p className="text-[10px] font-semibold text-teal-600 dark:text-teal-400 uppercase tracking-wider text-center mb-2">
            ↓ {t.students} ({directStudents.length})
          </p>
          <div className="space-y-1">
            {directStudents.map(n => (
              <button
                key={n.id}
                onClick={() => onNodeClick(n)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-teal-100 dark:border-teal-900/30 bg-teal-50/50 dark:bg-teal-950/30 hover:bg-teal-100 dark:hover:bg-teal-900/20 transition-colors text-right"
              >
                <span className="text-[9px] text-teal-600 dark:text-teal-500 flex-shrink-0">
                  {n.death_year ? `${t.died}${n.death_year}` : ''}
                </span>
                <div className="flex flex-col items-end min-w-0">
                  <span dir="rtl" className="text-sm text-gray-900 dark:text-white font-medium truncate max-w-[200px]">{n.name_ar}</span>
                  {getLocalName(n, lang) && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[200px]">{getLocalName(n, lang)}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Tree View ─── */
function TreeView({ nodes, edges, centerId, darkMode, lang, onNodeClick }: {
  nodes: NarratorNode[];
  edges: NarratorEdge[];
  centerId: number;
  darkMode: boolean;
  lang: Lang;
  onNodeClick: (n: NarratorNode) => void;
}) {
  const nodeMap = new Map(nodes.map(n => [Number(n.id), n]));
  const { parents, children } = getAdj(edges);
  const t = GRAPH_I18N[lang];

  const visited = new Set<number>();

  const buildTree = (id: number, depth: number): { node: NarratorNode; children: any[] } | null => {
    if (visited.has(id)) return null;
    visited.add(id);
    if (depth > 3) return null;
    const node = nodeMap.get(id);
    if (!node) return null;
    const childIds = children.get(id) || [];
    const kids = childIds.slice(0, 5).map(cid => buildTree(cid, depth + 1)).filter(Boolean);
    return { node, children: kids };
  };

  const tree = buildTree(centerId, 0);
  if (!tree) return null;

  function renderNode(item: { node: NarratorNode; children: any[] } | null, depth: number) {
    if (!item) return null;
    const { node, children: kids } = item;
    const localName = getLocalName(node, lang);

    return (
      <div key={node.id} className="py-1">
        <button
          onClick={() => onNodeClick(node)}
          className={clsx(
            'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-right transition-colors',
            node.id === centerId
              ? 'bg-teal-100 dark:bg-teal-900/30 border border-teal-300 dark:border-teal-700'
              : 'hover:bg-gray-50 dark:hover:bg-zinc-800',
            darkMode ? 'text-white' : 'text-gray-900'
          )}
          style={{ paddingLeft: `${depth * 20 + 12}px` }}
        >
          <span className={clsx(
            'text-xs px-1.5 py-0.5 rounded font-mono',
            darkMode ? 'bg-zinc-700 text-gray-400' : 'bg-gray-200 text-gray-500'
          )}>
            {node.death_year ? `${node.death_year}` : '?'}
          </span>
          <span className="flex-1 text-sm font-medium" dir="rtl">
            {node.name_ar}
          </span>
          {localName && (
            <span className="text-xs text-gray-500">{localName}</span>
          )}
        </button>
        {kids.map(kid => renderNode(kid, depth + 1))}
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-6 px-4">
      {renderNode(tree, 0)}
    </div>
  );
}

/* ─── Radial View ─── */
function RadialView({ nodes, edges, centerId, darkMode, lang, onNodeClick }: {
  nodes: NarratorNode[];
  edges: NarratorEdge[];
  centerId: number;
  darkMode: boolean;
  lang: Lang;
  onNodeClick: (n: NarratorNode) => void;
}) {
  const t = GRAPH_I18N[lang];
  const W = 760, H = 560;
  const CX = W / 2, CY = H / 2;
  const INNER_R = 160;

  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const nodeMap = new Map(nodes.map(n => [Number(n.id), n]));
  const { parents, children } = getAdj(edges);

  const directTeachers = (parents.get(centerId) || []).slice(0, 8);
  const directStudents = (children.get(centerId) || []).slice(0, 8);

  function arcPositions(ids: number[], startDeg: number, endDeg: number, r: number) {
    if (ids.length === 0) return [];
    const step = ids.length === 1 ? 0 : (endDeg - startDeg) / (ids.length - 1);
    return ids.map((id, i) => {
      const deg = ids.length === 1 ? (startDeg + endDeg) / 2 : startDeg + step * i;
      const rad = (deg * Math.PI) / 180;
      return { id, x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
    });
  }

  const teacherPos = arcPositions(directTeachers, -160, -20, INNER_R);
  const studentPos = arcPositions(directStudents, 20, 160, INNER_R);
  const allPos = [...teacherPos, ...studentPos];

  const center = nodeMap.get(centerId);
  if (!center) return null;

  const truncate = (s: string, len = 10) => s.length > len ? s.slice(0, len) + '…' : s;
  const hasHover = hoveredId !== null;

  // Tooltip data
  const hoveredNode = hoveredId !== null ? nodeMap.get(hoveredId) : null;
  const hoveredPos = hoveredId !== null ? allPos.find(p => p.id === hoveredId) : null;
  const isHoveredTeacher = hoveredId !== null && directTeachers.includes(hoveredId);

  function RadialNode({ pos, node, isTeacher }: { pos: { id: number; x: number; y: number }; node: NarratorNode; isTeacher: boolean }) {
    const isHovered = hoveredId === pos.id;
    const dimmed = hasHover && !isHovered;

    const fillDark = isTeacher ? '#78350f' : '#0c2929';
    const fillLight = isTeacher ? '#fef3c7' : '#f0fdfa';
    const strokeDark = isTeacher ? '#d97706' : '#0d9488';
    const strokeLight = isTeacher ? '#f59e0b' : '#14b8a6';
    const textDark = isTeacher ? '#fcd34d' : '#5eead4';
    const textLight = isTeacher ? '#92400e' : '#0f766e';

    return (
      <g
        onClick={() => onNodeClick(node)}
        onMouseEnter={() => setHoveredId(pos.id)}
        onMouseLeave={() => setHoveredId(null)}
        style={{
          cursor: 'pointer',
          transformOrigin: `${pos.x}px ${pos.y}px`,
          transform: isHovered ? 'scale(1.3)' : 'scale(1)',
          transition: 'transform 0.2s ease, opacity 0.15s ease',
          opacity: dimmed ? 0.25 : 1,
        }}
      >
        <circle
          cx={pos.x} cy={pos.y} r={44}
          fill={darkMode ? fillDark : fillLight}
          stroke={isHovered
            ? (isTeacher ? '#f59e0b' : '#14b8a6')
            : (darkMode ? strokeDark : strokeLight)}
          strokeWidth={isHovered ? 3 : 1.5}
        />
        <text x={pos.x} y={pos.y - 8} textAnchor="middle" fontSize={12} fontFamily="serif"
          fill={darkMode ? textDark : textLight} fontWeight="600"
        >
          {truncate(node.name_ar, 9)}
        </text>
        {getLocalName(node, lang) && (
          <text x={pos.x} y={pos.y + 6} textAnchor="middle" fontSize={8}
            fill={darkMode ? '#9ca3af' : '#6b7280'}
          >
            {truncate(getLocalName(node, lang) || '', 12)}
          </text>
        )}
        {node.death_year && (
          <text x={pos.x} y={pos.y + 18} textAnchor="middle" fontSize={8}
            fill={darkMode ? '#6b7280' : '#9ca3af'}
          >
            {t.died}{node.death_year}
          </text>
        )}
      </g>
    );
  }

  return (
    <div className="relative overflow-x-auto py-4">
      <svg
        width={W} height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="mx-auto block"
        style={{ maxWidth: '100%' }}
      >
        {/* Lines: center → teachers */}
        {teacherPos.map(pos => {
          const isHov = hoveredId === pos.id;
          return (
            <line key={`tl-${pos.id}`}
              x1={CX} y1={CY} x2={pos.x} y2={pos.y}
              stroke={isHov
                ? (darkMode ? 'rgba(251,191,36,0.9)' : 'rgba(217,119,6,0.8)')
                : (darkMode ? 'rgba(251,191,36,0.35)' : 'rgba(217,119,6,0.25)')}
              strokeWidth={isHov ? 2.5 : 1.5}
              strokeDasharray={isHov ? 'none' : '4 3'}
              style={{ transition: 'stroke 0.15s ease, stroke-width 0.15s ease', opacity: hasHover && !isHov ? 0.15 : 1 }}
            />
          );
        })}
        {/* Lines: center → students */}
        {studentPos.map(pos => {
          const isHov = hoveredId === pos.id;
          return (
            <line key={`sl-${pos.id}`}
              x1={CX} y1={CY} x2={pos.x} y2={pos.y}
              stroke={isHov
                ? (darkMode ? 'rgba(45,212,191,0.9)' : 'rgba(13,148,136,0.8)')
                : (darkMode ? 'rgba(45,212,191,0.35)' : 'rgba(13,148,136,0.25)')}
              strokeWidth={isHov ? 2.5 : 1.5}
              style={{ transition: 'stroke 0.15s ease, stroke-width 0.15s ease', opacity: hasHover && !isHov ? 0.15 : 1 }}
            />
          );
        })}

        {/* Subtle dashed ring */}
        <ellipse cx={CX} cy={CY} rx={INNER_R - 10} ry={INNER_R - 10}
          fill="none"
          stroke={darkMode ? 'rgba(63,63,70,0.4)' : 'rgba(209,213,219,0.5)'}
          strokeWidth={1} strokeDasharray="6 6"
        />

        {/* Teacher nodes */}
        {teacherPos.map(pos => {
          const n = nodeMap.get(pos.id);
          if (!n) return null;
          return <RadialNode key={pos.id} pos={pos} node={n} isTeacher={true} />;
        })}

        {/* Student nodes */}
        {studentPos.map(pos => {
          const n = nodeMap.get(pos.id);
          if (!n) return null;
          return <RadialNode key={pos.id} pos={pos} node={n} isTeacher={false} />;
        })}

        {/* Center node */}
        <g
          onClick={() => onNodeClick(center)}
          style={{ cursor: 'pointer', opacity: hasHover ? 0.7 : 1, transition: 'opacity 0.15s ease' }}
        >
          <circle cx={CX} cy={CY} r={58}
            fill={darkMode ? '#134e4a' : '#0d9488'}
            stroke={darkMode ? '#2dd4bf' : 'rgba(255,255,255,0.8)'}
            strokeWidth={3}
          />
          <text x={CX} y={CY - 10} textAnchor="middle" fontSize={14} fontFamily="serif"
            fill="white" fontWeight="bold"
          >
            {truncate(center.name_ar, 10)}
          </text>
          {getLocalName(center, lang) && (
            <text x={CX} y={CY + 7} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.75)">
              {truncate(getLocalName(center, lang) || '', 14)}
            </text>
          )}
          {center.death_year && (
            <text x={CX} y={CY + 22} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.55)">
              {t.died} {center.death_year} AH
            </text>
          )}
        </g>

        {/* Direction labels */}
        <text x={CX} y={18} textAnchor="middle" fontSize={9} fill={darkMode ? '#d97706' : '#92400e'} fontWeight="600">
          ↑ {t.teachers}
        </text>
        <text x={CX} y={H - 8} textAnchor="middle" fontSize={9} fill={darkMode ? '#0d9488' : '#0f766e'} fontWeight="600">
          ↓ {t.students}
        </text>

        {/* Legend */}
        <circle cx={16} cy={H - 14} r={5} fill={darkMode ? '#d97706' : '#f59e0b'} />
        <text x={26} y={H - 10} fontSize={9} fill={darkMode ? '#9ca3af' : '#6b7280'}>{t.teachers}</text>
        <circle cx={100} cy={H - 14} r={5} fill={darkMode ? '#0d9488' : '#14b8a6'} />
        <text x={110} y={H - 10} fontSize={9} fill={darkMode ? '#9ca3af' : '#6b7280'}>{t.students}</text>
      </svg>

      {/* Hover tooltip card */}
      {hoveredNode && hoveredPos && (
        <div
          className={clsx(
            'absolute pointer-events-none z-20 px-3 py-2 rounded-xl shadow-xl border text-left min-w-[160px] max-w-[220px]',
            darkMode
              ? 'bg-zinc-900 border-zinc-700 text-white'
              : 'bg-white border-gray-200 text-gray-900'
          )}
          style={{
            // position relative to SVG — convert SVG coords to %, then offset
            left: `calc(${(hoveredPos.x / W) * 100}% + ${hoveredPos.x > CX ? -230 : 60}px)`,
            top: `calc(${(hoveredPos.y / H) * 100}% - 40px)`,
          }}
        >
          <p dir="rtl" className="font-arabic font-semibold text-sm leading-snug mb-1">
            {hoveredNode.name_ar}
          </p>
          {getLocalName(hoveredNode, lang) && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{getLocalName(hoveredNode, lang)}</p>
          )}
          <div className="flex flex-wrap gap-1 mt-1">
            <span className={clsx(
              'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
              isHoveredTeacher
                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                : 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400'
            )}>
              {isHoveredTeacher ? t.teachers : t.students}
            </span>
            {hoveredNode.death_year && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400">
                {t.died} {hoveredNode.death_year} AH
              </span>
            )}
            {hoveredNode.reliability && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 font-medium">
                {hoveredNode.reliability}
              </span>
            )}
          </div>
          <p className="text-[10px] text-teal-600 dark:text-teal-400 mt-1.5 font-medium">Click to explore →</p>
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ─── */
function GraphPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [lang, setLang] = useState<Lang>('en');
  const { darkMode, toggleDarkMode } = useTheme();
  const [narratorId, setNarratorId] = useState<number | null>(null);
  const [graphData, setGraphData] = useState<{ nodes: NarratorNode[]; edges: NarratorEdge[] } | null>(null);
  const [centerNarrator, setCenterNarrator] = useState<NarratorNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('tree');
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const MIN_ZOOM = 0.4;
  const MAX_ZOOM = 2.5;
  const STEP = 0.15;

  const applyZoom = useCallback((delta: number) => {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomRef.current + delta));
    zoomRef.current = next;
    setZoom(next);
  }, []);

  // Wheel-to-zoom on the content area
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return; // only Ctrl/Cmd + scroll
      e.preventDefault();
      applyZoom(e.deltaY < 0 ? STEP : -STEP);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyZoom]);

  const t = GRAPH_I18N[lang];

  useEffect(() => {
    setMounted(true);
    const savedLang = localStorage.getItem('hujjah-lang') as Lang | null;
    if (savedLang && ['en', 'bn', 'ar'].includes(savedLang)) setLang(savedLang);
    const savedView = localStorage.getItem('hujjah-graph-view') as ViewMode | null;
    if (savedView && ['tree', 'chain', 'radial'].includes(savedView)) setView(savedView);
  }, []);

  useEffect(() => {
    const id = searchParams.get('id');
    if (!id) { setNarratorId(null); return; }
    const numId = Number(id);
    setNarratorId(numId);
    setLoading(true);
    fetch(`/api/chain?action=graph&id=${numId}&depth=2`)
      .then(r => r.json())
      .then((data) => {
        setGraphData(data);
        const center = data.nodes?.find((n: NarratorNode) => Number(n.id) === numId) ?? null;
        setCenterNarrator(center);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [searchParams]);

  const handleNodeClick = (node: NarratorNode) => {
    router.push(`/chain?id=${node.id}`);
  };

  const handleLangChange = (l: Lang) => {
    setLang(l);
    localStorage.setItem('hujjah-lang', l);
  };

  const handleViewChange = (v: ViewMode) => {
    setView(v);
    localStorage.setItem('hujjah-graph-view', v);
    // reset zoom on view switch
    zoomRef.current = 1;
    setZoom(1);
  };

  if (!mounted) return null;

  const views: ViewMode[] = ['tree', 'chain', 'radial'];

  return (
    <div className={clsx('min-h-screen bg-base', darkMode && 'dark')}>
      <header className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 sticky top-0 z-50 overflow-visible">
        <AppNav
          lang={lang}
          onLangChange={(l) => handleLangChange(l as Lang)}
          langs={[{ code: 'en', label: 'EN' }, { code: 'bn', label: 'বাং' }]}
          darkMode={darkMode}
          onDarkModeToggle={toggleDarkMode}
          hiddenRoutes={['/chat']}
          icon={<img src="/hujjah.png" alt="Hujjah" className="w-5 h-5" />}
        />
      </header>

      {/* Sub-nav: back link + narrator info + view switcher */}
      <div className="bg-white dark:bg-zinc-900 border-b border-gray-100 dark:border-zinc-800 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center gap-3 flex-wrap">
          <button
            onClick={() => router.push('/chain')}
            className="text-sm font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors whitespace-nowrap flex-shrink-0"
          >
            {t.back}
          </button>
          {centerNarrator && (
            <>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-sm font-semibold text-gray-900 dark:text-white truncate" dir="rtl">
                  {centerNarrator.name_ar}
                </span>
                {centerNarrator.name_en && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate hidden sm:block">
                    {centerNarrator.name_en}
                  </span>
                )}
                {centerNarrator.death_year && (
                  <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                    d. {centerNarrator.death_year} AH
                  </span>
                )}
              </div>
            </>
          )}

          {/* View switcher */}
          <div className="flex items-center gap-1 ml-auto bg-gray-100 dark:bg-zinc-800 rounded-lg p-0.5">
            {views.map(v => (
              <button
                key={v}
                onClick={() => handleViewChange(v)}
                className={clsx(
                  'px-3 py-1 rounded-md text-xs font-medium transition-all',
                  view === v
                    ? 'bg-white dark:bg-zinc-700 text-teal-700 dark:text-teal-400 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                )}
              >
                {t.views[v]}
              </button>
            ))}
          </div>
        </div>
      </div>


      {/* ── Graph Content ─────────────────────────────────────────── */}
      {loading && (
        <div className="flex flex-col items-center justify-center min-h-[65vh]">
          <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">{t.loading}</p>
        </div>
      )}

      {!loading && graphData && (
        <div ref={containerRef} className="overflow-auto">
          {view === 'chain' && (
            <ChainView
              nodes={graphData.nodes}
              edges={graphData.edges}
              centerId={narratorId!}
              darkMode={darkMode}
              lang={lang}
              onNodeClick={handleNodeClick}
            />
          )}
          {view === 'radial' && (
            <RadialView
              nodes={graphData.nodes}
              edges={graphData.edges}
              centerId={narratorId!}
              darkMode={darkMode}
              lang={lang}
              onNodeClick={handleNodeClick}
            />
          )}
          {view === 'tree' && (
            <SanadExplorer
              nodes={graphData.nodes}
              edges={graphData.edges}
              centerId={narratorId!}
              darkMode={darkMode}
              lang={lang}
              onNodeClick={handleNodeClick}
            />
          )}
        </div>
      )}

      {!loading && !graphData && (
        <div className="flex flex-col items-center justify-center min-h-[65vh] text-center px-6">
          <p className="text-gray-500 dark:text-gray-400">{t.notFound}</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">{t.notFoundDesc}</p>
          <button
            onClick={() => router.push('/chain')}
            className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {lang === 'bn' ? 'চেইন এক্সপ্লোরারে যান' : 'Go to Chain Explorer'}
          </button>
        </div>
      )}
    </div>
  );
}


export default function GraphPageWrap() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-base flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <GraphPage />
    </Suspense>
  );
}
