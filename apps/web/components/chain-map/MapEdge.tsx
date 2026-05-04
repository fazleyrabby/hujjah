'use client';

import { memo } from 'react';
import { type EdgeProps, getBezierPath } from '@xyflow/react';
import { clsx } from 'clsx';

interface MapEdgeData {
  hadithCount?: number;
  isRelated: boolean;
  darkMode: boolean;
}

function MapEdgeComponent(props: EdgeProps) {
  const data = props.data as MapEdgeData | undefined;
  const { hadithCount, isRelated, darkMode } = data ?? {};

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
    curvature: 0.3,
  });

  const strokeColor = isRelated
    ? (darkMode ? '#2dd4bf' : '#14b8a6')
    : (darkMode ? 'rgba(63,63,70,0.8)' : 'rgba(156,163,175,0.6)');

  const strokeWidth = isRelated ? 2.5 : 1;

  return (
    <>
      <path
        id={props.id}
        className="react-flow__edge-path"
        d={edgePath}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        fill="none"
        style={{
          transition: 'stroke 0.15s ease, stroke-width 0.15s ease',
          opacity: isRelated ? 1 : 0.5,
        }}
      />
      {hadithCount && hadithCount > 1 && (
        <g transform={`translate(${labelX}, ${labelY})`}>
          <text
            className={clsx(
              'text-[9px] fill-current pointer-events-none',
              darkMode ? 'text-gray-400' : 'text-gray-500'
            )}
            textAnchor="middle"
            dominantBaseline="middle"
            style={{ fontSize: '9px' }}
          >
            {hadithCount}
          </text>
        </g>
      )}
    </>
  );
}

export const MapEdge = memo(MapEdgeComponent);
