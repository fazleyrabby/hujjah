'use client';

import { memo, useCallback } from 'react';
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
  isExpanded: boolean;
  lang: 'en' | 'bn' | 'ar';
  darkMode: boolean;
  onHover: (id: number | null) => void;
  onClick: () => void;
  onExpand: () => void;
}

const RELIABILITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  thiqah:  { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300' },
  saduq:   { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  daif:    { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300' },
  mawdu:   { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
  unknown: { bg: 'bg-gray-100', text: 'text-gray-500', border: 'border-gray-300' },
};

function MapNodeComponent({ data }: NodeProps) {
  const raw = data as unknown as MapNodeData;
  const {
    id, name_ar, name_en, name_bn, death_year, reliability,
    isHovered, isFocused, isLoading,
    lang, darkMode, onHover, onClick, onExpand,
  } = raw;

  const reliabilityColors = reliability ? RELIABILITY_COLORS[reliability] : RELIABILITY_COLORS.unknown;

  const handleClick = useCallback(() => {
    onClick();
  }, [onClick]);

  const handleMouseEnter = useCallback(() => {
    onHover(Number(id));
  }, [id, onHover]);

  const handleMouseLeave = useCallback(() => {
    onHover(null);
  }, [onHover]);

  const handleDoubleClick = useCallback(() => {
    onExpand();
  }, [onExpand]);

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

  const displayName = lang === 'bn' ? (name_bn || name_en || name_ar)
    : lang === 'ar' ? name_ar
    : (name_en || name_ar);

  const truncatedName = displayName.length > 15
    ? displayName.slice(0, 12) + '…'
    : displayName;

  return (
    <div
      className={clsx(
        'relative px-3 py-2 rounded-xl border-2 transition-all duration-200 cursor-pointer min-w-[120px] max-w-[180px]',
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

      {/* Node content */}
      <div className="text-center space-y-1">
        <p
          className={clsx('font-medium text-sm leading-tight', textColor)}
          dir="rtl"
        >
          {truncatedName}
        </p>
        {death_year && (
          <p className={clsx('text-[10px] font-mono', darkMode ? 'text-gray-400' : 'text-gray-500')}>
            d. {death_year}
          </p>
        )}
        {reliability && reliability !== 'unknown' && (
          <span className={clsx('inline-block text-[9px] px-1.5 py-0.5 rounded-full font-medium', reliabilityColors.bg, reliabilityColors.text)}>
            {reliability}
          </span>
        )}
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
