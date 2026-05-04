'use client';

import { memo } from 'react';
import { type EdgeProps, getBezierPath } from '@xyflow/react';
import { clsx } from 'clsx';

interface MapEdgeData {
  hadithCount?: number;
  isRelated: boolean;
  isTeacherEdge: boolean; // true if going TO center (teacher edge)
  darkMode: boolean;
}

function MapEdgeComponent(props: EdgeProps) {
  const data = props.data as MapEdgeData | undefined;
  const { hadithCount, isRelated, isTeacherEdge, darkMode } = data ?? {};

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
    curvature: 0.2,
  });

  // Color based on edge type and hover state
  const getStrokeColor = () => {
    if (!isRelated) {
      return darkMode ? 'rgba(63,63,70,0.5)' : 'rgba(156,163,175,0.4)';
    }
    // Highlighted edges
    return isTeacherEdge 
      ? (darkMode ? '#fbbf24' : '#f59e0b')  // Amber for teacher edges
      : (darkMode ? '#2dd4bf' : '#14b8a6'); // Teal for student edges
  };

  const strokeColor = getStrokeColor();
  const strokeWidth = isRelated ? 2.5 : 1.5;

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
          opacity: isRelated ? 1 : 0.4,
        }}
      />
      {/* Hadith count label */}
      {hadithCount && hadithCount > 1 && (
        <g transform={`translate(${labelX}, ${labelY})`}>
          <text
            className={clsx(
              'text-[9px] fill-current pointer-events-none font-medium',
              darkMode ? 'text-gray-400' : 'text-gray-500'
            )}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {hadithCount}
          </text>
        </g>
      )}
    </>
  );
}

export const MapEdge = memo(MapEdgeComponent);
