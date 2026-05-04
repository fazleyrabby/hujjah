/**
 * Graph layout utilities for positioning nodes
 */

export interface LayoutPosition {
  x: number;
  y: number;
}

// Simple radial layout around a center node
export function radialLayout(
  centerId: number,
  nodes: Map<number, { id: number; x?: number; y?: number }>,
  centerX: number = 0,
  centerY: number = 0,
  radius: number = 180,
): Map<number, LayoutPosition> {
  const positions = new Map<number, LayoutPosition>();
  
  // Set center position
  positions.set(centerId, { x: centerX, y: centerY });
  
  // Get all other nodes and arrange them radially
  const others = Array.from(nodes.keys()).filter(id => id !== centerId);
  if (others.length === 0) return positions;
  
  const angleStep = (2 * Math.PI) / others.length;
  others.forEach((id, i) => {
    const angle = angleStep * i - Math.PI / 2;
    positions.set(id, {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    });
  });
  
  return positions;
}

// Layout nodes in a hierarchical tree structure
export function hierarchicalLayout(
  centerId: number,
  parentMap: Map<number, number[]>,  // nodeId -> parentIds
  childMap: Map<number, number[]>,    // nodeId -> childIds
  centerX: number = 0,
  centerY: number = 0,
): Map<number, LayoutPosition> {
  const positions = new Map<number, LayoutPosition>();
  const visited = new Set<number>();
  
  const layoutLevel = (nodeId: number, x: number, y: number, level: number) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    
    const levelY = centerY + level * 120;
    positions.set(nodeId, { x, y: levelY });
    
    const children = childMap.get(nodeId) || [];
    const childCount = children.length;
    
    if (childCount === 0) return;
    
    const startX = x - ((childCount - 1) * 80) / 2;
    children.forEach((childId, i) => {
      layoutLevel(childId, startX + i * 80, levelY, level + 1);
    });
  };
  
  positions.set(centerId, { x: centerX, y: centerY });
  visited.add(centerId);
  
  const children = childMap.get(centerId) || [];
  const startX = centerX - ((children.length - 1) * 80) / 2;
  children.forEach((childId, i) => {
    layoutLevel(childId, startX + i * 80, centerY + 120, 1);
  });
  
  return positions;
}

// Get connected node IDs (neighbors) for a given node
export function getConnectedNodes(
  nodeId: number,
  edges: Array<{ from_narrator_id: number; to_narrator_id: number }>,
): Set<number> {
  const connected = new Set<number>();
  for (const edge of edges) {
    if (edge.from_narrator_id === nodeId) {
      connected.add(edge.to_narrator_id);
    }
    if (edge.to_narrator_id === nodeId) {
      connected.add(edge.from_narrator_id);
    }
  }
  return connected;
}
