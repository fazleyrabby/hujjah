'use client';

import { memo, useCallback, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { clsx } from 'clsx';

interface MapNodeData {
  id: string;
  name_ar: string;
  name_en?: string;
  name_bn?: string;
  death_year?: number;
  tabaqah?: number;
  reliability?: string;
  city?: string;
  isHovered: boolean;
  isFocused: boolean;
  isLoading: boolean;
  isDuplicate?: boolean;
  tabaqahLabel?: string;
  lang: 'en' | 'bn' | 'ar';
  darkMode: boolean;
  onHover: (id: number | null) => void;
  onClick: () => void;
  onExpand: () => void;
}

const RELIABILITY_COLORS: Record<string, { bg: string; text: string }> = {
  thiqah:  { bg: 'bg-emerald-100', text: 'text-emerald-800' },
  saduq:   { bg: 'bg-blue-100', text: 'text-blue-800' },
  daif:    { bg: 'bg-amber-100', text: 'text-amber-800' },
  mawdu:   { bg: 'bg-red-100', text: 'text-red-800' },
  unknown: { bg: 'bg-gray-100', text: 'text-gray-500' },
};

// Tabaqah colors for background tint
const TABAQAH_COLORS: Record<number, { light: string; dark: string }> = {
  1: { light: '#fef3c7', dark: '#78350f' },      // Sahaba - gold
  2: { light: '#dbeafe', dark: '#1e3a8a' },      // Tabi'in - blue
  3: { light: '#dcfce7', dark: '#14532d' },      // Tabi' al-Tabi'in - green
  4: { light: '#f3e8ff', dark: '#581c87' },      // Later - purple
};

function MapNodeComponent({ data }: NodeProps) {
  const raw = data as unknown as MapNodeData;
  const {
    id, name_ar, name_en, name_bn, death_year, reliability, city, tabaqah,
    isHovered, isFocused, isLoading, isDuplicate, tabaqahLabel,
    lang, darkMode, onHover, onClick, onExpand,
  } = raw;

  const [showTooltip, setShowTooltip] = useState(false);

  const reliabilityColors = reliability ? RELIABILITY_COLORS[reliability] : RELIABILITY_COLORS.unknown;

  const handleClick = useCallback(() => {
    onClick();
  }, [onClick]);

  const handleMouseEnter = useCallback(() => {
    onHover(Number(id));
    setShowTooltip(true);
  }, [id, onHover]);

  const handleMouseLeave = useCallback(() => {
    onHover(null);
    setShowTooltip(false);
  }, [onHover]);

  const handleDoubleClick = useCallback(() => {
    onExpand();
  }, [onExpand]);

  // Background color based on state
  const bgColor = isFocused
    ? (darkMode ? '#134e4a' : '#0d9488')
    : isHovered
      ? (darkMode ? '#1e3a3a' : '#f0fdfa')
      : (darkMode ? '#27272a' : '#ffffff');

  const textColor = isFocused
    ? 'text-white'
    : isHovered
      ? (darkMode ? '#d1d5db' : '#1f2937')
      : (darkMode ? '#e4e4e7' : '#1f2937');

  const borderColor = isFocused
    ? (darkMode ? '#2dd4bf' : '#14b8a6')
    : isHovered
      ? (darkMode ? '#0f766e' : '#14b8a6')
      : (darkMode ? '#3f3f46' : '#d1d5db');

  // Get display name based on language
  const displayName = lang === 'bn' ? (name_bn || name_en || name_ar)
    : lang === 'ar' ? name_ar
    : (name_en || name_ar);

  // Disambiguation info
  const disambiguateInfo = [];
  if (death_year) disambiguateInfo.push(`d. ${death_year}`);
  if (city && lang !== 'ar') disambiguateInfo.push(city);
  if (isDuplicate) disambiguateInfo.push('duplicate');

  return (
    <div
      className={clsx(
        'relative px-2.5 py-2 rounded-xl border-2 transition-all duration-200 cursor-pointer',
        'min-w-[130px] max-w-[170px]',
        'hover:scale-105 active:scale-95',
        reliabilityColors.bg,
      )}
      style={{
        backgroundColor: bgColor,
        borderColor,
      }}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onDoubleClick={handleDoubleClick}
    >
      {/* Connection handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !rounded-full !border-2"
        style={{
          background: darkMode ? '#3f3f46' : '#d1d5db',
          borderColor: darkMode ? '#52525b' : '#9ca3af',
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !rounded-full !border-2"
        style={{
          background: darkMode ? '#3f3f46' : '#d1d5db',
          borderColor: darkMode ? '#52525b' : '#9ca3af',
        }}
      />

      {/* Node content with tooltip on hover */}
      <div className="relative">
        {/* Full name tooltip */}
        {showTooltip && (
          <div 
            className={clsx(
              'absolute z-[9999] bottom-full left-1/2 -translate-x-1/2 mb-2',
              'px-4 py-3 rounded-xl shadow-2xl border text-sm',
              'whitespace-nowrap',
              darkMode ? 'bg-zinc-800 border-zinc-600 text-white' : 'bg-white border-gray-200 text-gray-800'
            )}
            style={{ pointerEvents: 'none', minWidth: '200px', maxWidth: '400px' }}
          >
            <p className="font-arabic text-base text-right leading-relaxed mb-2" dir="rtl">{name_ar}</p>
            {name_en && <p className="text-gray-500 text-xs mb-1">{name_en}</p>}
            {tabaqahLabel && (
              <p className={clsx('text-[9px] inline-block px-1.5 py-0.5 rounded', 
                darkMode ? 'bg-zinc-700 text-gray-400' : 'bg-gray-100 text-gray-500'
              )}>
                {tabaqahLabel}
              </p>
            )}
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
              <div className={clsx('w-2 h-2 rotate-45 border-r border-b',
                darkMode ? 'bg-zinc-800 border-zinc-600' : 'bg-white border-gray-200'
              )} />
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="text-center space-y-1">
          {/* Name - line clamped */}
          <p
            className={clsx('font-medium text-xs leading-snug text-left', textColor)}
            dir="rtl"
            title={displayName}
          >
            {displayName}
          </p>

          {/* Disambiguation info */}
          {disambiguateInfo.length > 0 && (
            <div className="flex flex-wrap gap-1 justify-center">
              {death_year && (
                <span className={clsx('text-[9px] font-mono', darkMode ? 'text-gray-400' : 'text-gray-500')}>
                  {death_year}
                </span>
              )}
              {isDuplicate && (
                <span className="text-[8px] px-1 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                  ⚠️
                </span>
              )}
            </div>
          )}

          {/* Reliability badge */}
          {reliability && reliability !== 'unknown' && (
            <span className={clsx(
              'inline-block text-[8px] px-1.5 py-0.5 rounded-full font-medium',
              reliabilityColors.bg, reliabilityColors.text
            )}>
              {reliability}
            </span>
          )}
        </div>
      </div>

      {/* Loading spinner */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-xl">
          <div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

export const MapNode = memo(MapNodeComponent);
