import React, { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { FlipHorizontal, FlipVertical, Trash2 } from './icons';

export type WallSide = 'N' | 'S' | 'E' | 'W';

export type Opening = {
  id: string;
  type: 'door' | 'window';
  wall: WallSide;
  position: number; // meters from wall start (N: W->E, S: W->E, W: N->S, E: N->S)
  width: number;    // meters
  flipHinge?: boolean; // false: left hinge, true: right hinge (relative to facing wall)
  flipSwing?: boolean; // false: swing inward, true: swing outward
};

export type RoomType =
  | 'living'
  | 'bedroom'
  | 'kitchen'
  | 'bathroom'
  | 'dining'
  | 'balcony'
  | 'corridor'
  | 'office'
  | 'custom';

export type RoomConfig = {
  id?: string;
  name?: string;
  type?: RoomType;
  x?: number; // meters from plan origin (East-West)
  y?: number; // meters from plan origin (North-South)
  breadth: number; // X-axis dimension (m)
  length: number;  // Y-axis dimension (m)
  wallThickness?: number; // individual room wall thickness override
  openings: Opening[];
};

export type FloorPlanTheme = 'blueprint' | 'cad-light' | 'dark-studio';
export type UnitSystem = 'metric' | 'imperial';

interface FloorPlanProps {
  room?: RoomConfig;
  rooms?: RoomConfig[];
  exteriorWallThickness?: number;
  interiorWallThickness?: number;
  selectedRoomId?: string | null;
  onSelectRoom?: (id: string | null) => void;
  onUpdateRoom?: (room: RoomConfig) => void;
  onDeleteRoom?: (id: string) => void;
  theme?: FloorPlanTheme;
  unit?: UnitSystem;
  showDimensions?: boolean;
  showGrid?: boolean;
  selectedOpeningId?: string | null;
  onSelectOpening?: (id: string | null) => void;
  onUpdateOpening?: (opening: Opening) => void;
  onDeleteOpening?: (id: string) => void;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  panOffset?: { x: number; y: number };
  onPanChange?: (pan: { x: number; y: number }) => void;
  onCursorMove?: (coords: { x: number; y: number } | null) => void;
}

export function formatDistance(meters: number, unit: UnitSystem = 'metric'): string {
  if (unit === 'imperial') {
    const totalInches = Math.round(meters / 0.0254);
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    return `${feet}'-${inches}"`;
  }
  return `${meters.toFixed(2)} m`;
}

export const THEME_CONFIGS = {
  blueprint: {
    bg: '#ffffff',
    roomFill: '#ffffff',
    gridMajor: 'rgba(37, 99, 235, 0.65)',
    gridMedium: 'rgba(37, 99, 235, 0.40)',
    gridMinor: 'rgba(37, 99, 235, 0.22)',
    wallFill: '#1d4ed8',
    wallStroke: '#1e40af',
    innerLine: '#2563eb',
    dimensionLine: '#1d4ed8',
    dimensionText: '#1e3a8a',
    doorLeaf: '#2563eb',
    doorArc: '#3b82f6',
    windowGlass: '#0284c7',
    windowSill: '#93c5fd',
    tagBg: '#ffffff',
    tagText: '#1e3a8a',
    tagBorder: '#2563eb',
    selectedGlow: '#f59e0b',
  },
  'cad-light': {
    bg: '#ffffff',
    roomFill: '#ffffff',
    gridMajor: 'rgba(51, 65, 85, 0.65)',
    gridMedium: 'rgba(71, 85, 105, 0.40)',
    gridMinor: 'rgba(100, 116, 139, 0.24)',
    wallFill: '#1e293b',
    wallStroke: '#0f172a',
    innerLine: '#475569',
    dimensionLine: '#334155',
    dimensionText: '#0f172a',
    doorLeaf: '#2563eb',
    doorArc: '#3b82f6',
    windowGlass: '#0284c7',
    windowSill: '#94a3b8',
    tagBg: '#ffffff',
    tagText: '#0f172a',
    tagBorder: '#94a3b8',
    selectedGlow: '#f59e0b',
  },
  'dark-studio': {
    bg: '#ffffff',
    roomFill: '#f8fafc',
    gridMajor: 'rgba(30, 41, 59, 0.65)',
    gridMedium: 'rgba(51, 65, 85, 0.40)',
    gridMinor: 'rgba(71, 85, 105, 0.24)',
    wallFill: '#334155',
    wallStroke: '#0f172a',
    innerLine: '#64748b',
    dimensionLine: '#334155',
    dimensionText: '#0f172a',
    doorLeaf: '#2563eb',
    doorArc: '#3b82f6',
    windowGlass: '#0284c7',
    windowSill: '#64748b',
    tagBg: '#ffffff',
    tagText: '#0f172a',
    tagBorder: '#64748b',
    selectedGlow: '#f59e0b',
  },
};

// Fixed Architectural CAD World Scale: exactly 100 SVG units per meter
// 1.0 m = 100 units; 10 cm = 10 units; 1.0 cm = 1 unit; 1.0 mm = 0.1 unit
export const BASE_PPM = 100;
export const SHEET_MARGIN_METERS = 2.0;
export const SHEET_MARGIN_PX = SHEET_MARGIN_METERS * BASE_PPM; // Exactly 200 SVG units

// Smart magnetic & grid snapping calculation for room dragging
function computeSnappedRoomPosition(
  rawX: number,
  rawY: number,
  currentRoom: RoomConfig,
  otherRooms: RoomConfig[],
  unit: UnitSystem
) {
  const rw = currentRoom.breadth;
  const rh = currentRoom.length;
  const SNAP_DIST = 0.25; // 25cm magnetic snap distance

  let snappedX = rawX;
  let snappedY = rawY;
  let guideX: number | null = null;
  let guideY: number | null = null;

  let bestDistX = SNAP_DIST;
  let bestDistY = SNAP_DIST;

  // 1. Magnetic edge & corner snapping to adjoining rooms
  for (const other of otherRooms) {
    const ox = other.x || 0;
    const oy = other.y || 0;
    const ow = other.breadth;
    const oh = other.length;

    // Proximity on Y axis
    const yOverlap = rawY + rh >= oy - 0.5 && rawY <= oy + oh + 0.5;
    if (yOverlap) {
      if (Math.abs(rawX - (ox + ow)) < bestDistX) {
        bestDistX = Math.abs(rawX - (ox + ow));
        snappedX = ox + ow;
        guideX = ox + ow;
      }
      if (Math.abs(rawX + rw - ox) < bestDistX) {
        bestDistX = Math.abs(rawX + rw - ox);
        snappedX = ox - rw;
        guideX = ox;
      }
      if (Math.abs(rawX - ox) < bestDistX) {
        bestDistX = Math.abs(rawX - ox);
        snappedX = ox;
        guideX = ox;
      }
      if (Math.abs(rawX + rw - (ox + ow)) < bestDistX) {
        bestDistX = Math.abs(rawX + rw - (ox + ow));
        snappedX = ox + ow - rw;
        guideX = ox + ow;
      }
    }

    // Proximity on X axis
    const xOverlap = rawX + rw >= ox - 0.5 && rawX <= ox + ow + 0.5;
    if (xOverlap) {
      if (Math.abs(rawY - (oy + oh)) < bestDistY) {
        bestDistY = Math.abs(rawY - (oy + oh));
        snappedY = oy + oh;
        guideY = oy + oh;
      }
      if (Math.abs(rawY + rh - oy) < bestDistY) {
        bestDistY = Math.abs(rawY + rh - oy);
        snappedY = oy - rh;
        guideY = oy;
      }
      if (Math.abs(rawY - oy) < bestDistY) {
        bestDistY = Math.abs(rawY - oy);
        snappedY = oy;
        guideY = oy;
      }
      if (Math.abs(rawY + rh - (oy + oh)) < bestDistY) {
        bestDistY = Math.abs(rawY + rh - (oy + oh));
        snappedY = oy + oh - rh;
        guideY = oy + oh;
      }
    }
  }

  // 2. If not magnetically snapped, snap to grid
  if (guideX === null) {
    if (unit === 'imperial') {
      snappedX = Math.round(rawX / 0.1524) * 0.1524; // 6 inches
    } else {
      snappedX = Math.round(rawX * 10) / 10; // 10 cm (0.1m)
    }
  }

  if (guideY === null) {
    if (unit === 'imperial') {
      snappedY = Math.round(rawY / 0.1524) * 0.1524; // 6 inches
    } else {
      snappedY = Math.round(rawY * 10) / 10; // 10 cm (0.1m)
    }
  }

  return {
    x: Math.round(snappedX * 100) / 100,
    y: Math.round(snappedY * 100) / 100,
    guideX,
    guideY,
  };
}

const FloorPlan: React.FC<FloorPlanProps> = ({
  room,
  rooms,
  exteriorWallThickness = 0.20,
  interiorWallThickness = 0.10,
  selectedRoomId = null,
  onSelectRoom,
  onUpdateRoom,
  theme = 'cad-light',
  unit = 'metric',
  showDimensions = true,
  showGrid = true,
  selectedOpeningId = null,
  onSelectOpening,
  onUpdateOpening,
  onDeleteOpening,
  zoom = 1,
  onZoomChange,
  panOffset = { x: 0, y: 0 },
  onPanChange,
  onCursorMove,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [draggingOpeningInfo, setDraggingOpeningInfo] = useState<{ roomId: string; openingId: string } | null>(null);
  const [dragOffset, setDragOffset] = useState<number>(0);

  // Dragging Room State (Reposition rooms)
  const [draggingRoomInfo, setDraggingRoomInfo] = useState<{
    roomId: string;
    startClient: { x: number; y: number };
    startPos: { x: number; y: number };
  } | null>(null);

  // Resizing Room State (Dragging wall/corner handles)
  const [resizingRoomInfo, setResizingRoomInfo] = useState<{
    roomId: string;
    handle: 'right' | 'bottom' | 'corner';
    startClient: { x: number; y: number };
    startDim: { breadth: number; length: number };
  } | null>(null);

  // Magnetic Alignment Guide Lines
  const [alignmentGuides, setAlignmentGuides] = useState<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  });

  const [hoveredRoomId, setHoveredRoomId] = useState<string | null>(null);

  // Global window pointerup to safely release any drag outside the canvas
  useEffect(() => {
    const handleGlobalPointerUp = () => {
      setIsPanning(false);
      setDraggingOpeningInfo(null);
      setDraggingRoomInfo(null);
      setResizingRoomInfo(null);
      setAlignmentGuides({ x: null, y: null });
    };
    window.addEventListener('pointerup', handleGlobalPointerUp);
    return () => window.removeEventListener('pointerup', handleGlobalPointerUp);
  }, []);

  const colors = THEME_CONFIGS[theme] || THEME_CONFIGS.blueprint;
  const extWallT = exteriorWallThickness || 0.20;
  const intWallT = interiorWallThickness || 0.10;

  // Normalize multi-room vs single-room input
  const allRooms: RoomConfig[] = useMemo(() => {
    if (rooms && rooms.length > 0) {
      return rooms.map((r, i) => ({
        ...r,
        id: r.id || `room-${i}`,
        x: r.x || 0,
        y: r.y || 0,
        breadth: Math.max(1, r.breadth || 4),
        length: Math.max(1, r.length || 3),
        openings: r.openings || [],
      }));
    }
    if (room) {
      return [{
        ...room,
        id: room.id || 'single-room',
        x: 0,
        y: 0,
        breadth: Math.max(1, room.breadth || 5),
        length: Math.max(1, room.length || 4),
        openings: room.openings || [],
      }];
    }
    return [{
      id: 'default-room',
      name: 'Main Room',
      type: 'living',
      x: 0,
      y: 0,
      breadth: 5,
      length: 4,
      openings: [],
    }];
  }, [rooms, room]);

  // Active selected room
  const activeRoomId = selectedRoomId || allRooms[0]?.id || null;

  // Overall Plan Bounding Box (in meters)
  const bounds = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    allRooms.forEach((r) => {
      const rx = r.x || 0;
      const ry = r.y || 0;
      if (rx < minX) minX = rx;
      if (ry < minY) minY = ry;
      if (rx + r.breadth > maxX) maxX = rx + r.breadth;
      if (ry + r.length > maxY) maxY = ry + r.length;
    });

    if (!isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = 5;
      maxY = 4;
    }

    const width = maxX - minX;
    const height = maxY - minY;

    return { minX, minY, maxX, maxY, width, height };
  }, [allRooms]);

  // Drawing Sheet Origin: Bounding origin (bounds.minX, bounds.minY) is locked to (SHEET_MARGIN_PX, SHEET_MARGIN_PX)
  const originX = SHEET_MARGIN_PX - bounds.minX * BASE_PPM;
  const originY = SHEET_MARGIN_PX - bounds.minY * BASE_PPM;

  // Total base sheet dimensions
  const baseWidth = bounds.width * BASE_PPM + SHEET_MARGIN_PX * 2;
  const baseHeight = bounds.height * BASE_PPM + SHEET_MARGIN_PX * 2;

  // ViewBox Camera Mathematics (Mathematically accurate zoom & pan)
  const currentZoom = Math.max(0.2, zoom || 1);
  const viewWidth = baseWidth / currentZoom;
  const viewHeight = baseHeight / currentZoom;
  const centerX = baseWidth / 2;
  const centerY = baseHeight / 2;
  const viewBoxX = centerX - viewWidth / 2 - (panOffset?.x || 0);
  const viewBoxY = centerY - viewHeight / 2 - (panOffset?.y || 0);
  const viewBox = `${viewBoxX} ${viewBoxY} ${viewWidth} ${viewHeight}`;

  // Convert metric coordinates to SVG sheet coordinates
  const toScreenX = useCallback((xm: number) => originX + xm * BASE_PPM, [originX]);
  const toScreenY = useCallback((ym: number) => originY + ym * BASE_PPM, [originY]);

  // Convert browser client coordinates back to mathematically exact room metric coordinates
  const toRoomCoords = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgPt = pt.matrixTransform(ctm.inverse());
    const xm = (svgPt.x - originX) / BASE_PPM;
    const ym = (svgPt.y - originY) / BASE_PPM;
    return { x: xm, y: ym };
  }, [originX, originY]);

  // Identify shared partition walls between adjoining rooms
  // Returns a map of shared horizontal and vertical partition lines
  const sharedPartitions = useMemo(() => {
    const horizontal: Array<{ y: number; startX: number; endX: number; room1Id: string; room2Id: string }> = [];
    const vertical: Array<{ x: number; startY: number; endY: number; room1Id: string; room2Id: string }> = [];

    for (let i = 0; i < allRooms.length; i++) {
      const r1 = allRooms[i];
      const r1X = r1.x || 0;
      const r1Y = r1.y || 0;

      for (let j = i + 1; j < allRooms.length; j++) {
        const r2 = allRooms[j];
        const r2X = r2.x || 0;
        const r2Y = r2.y || 0;

        // Check vertical adjacency (r1 East == r2 West or r2 East == r1 West)
        if (Math.abs(r1X + r1.breadth - r2X) < 0.04) {
          const startY = Math.max(r1Y, r2Y);
          const endY = Math.min(r1Y + r1.length, r2Y + r2.length);
          if (endY - startY > 0.05) {
            vertical.push({ x: r2X, startY, endY, room1Id: r1.id!, room2Id: r2.id! });
          }
        } else if (Math.abs(r2X + r2.breadth - r1X) < 0.04) {
          const startY = Math.max(r1Y, r2Y);
          const endY = Math.min(r1Y + r1.length, r2Y + r2.length);
          if (endY - startY > 0.05) {
            vertical.push({ x: r1X, startY, endY, room1Id: r2.id!, room2Id: r1.id! });
          }
        }

        // Check horizontal adjacency (r1 South == r2 North or r2 South == r1 North)
        if (Math.abs(r1Y + r1.length - r2Y) < 0.04) {
          const startX = Math.max(r1X, r2X);
          const endX = Math.min(r1X + r1.breadth, r2X + r2.breadth);
          if (endX - startX > 0.05) {
            horizontal.push({ y: r2Y, startX, endX, room1Id: r1.id!, room2Id: r2.id! });
          }
        } else if (Math.abs(r2Y + r2.length - r1Y) < 0.04) {
          const startX = Math.max(r1X, r2X);
          const endX = Math.min(r1X + r1.breadth, r2X + r2.breadth);
          if (endX - startX > 0.05) {
            horizontal.push({ y: r1Y, startX, endX, room1Id: r2.id!, room2Id: r1.id! });
          }
        }
      }
    }

    return { horizontal, vertical };
  }, [allRooms]);

  // Helper to test if a room wall is a shared interior partition
  const isWallShared = useCallback((rx: number, ry: number, rw: number, rh: number, wall: WallSide): boolean => {
    if (wall === 'N') {
      return sharedPartitions.horizontal.some((p) => Math.abs(p.y - ry) < 0.05 && p.startX <= rx + rw && p.endX >= rx);
    }
    if (wall === 'S') {
      return sharedPartitions.horizontal.some((p) => Math.abs(p.y - (ry + rh)) < 0.05 && p.startX <= rx + rw && p.endX >= rx);
    }
    if (wall === 'W') {
      return sharedPartitions.vertical.some((p) => Math.abs(p.x - rx) < 0.05 && p.startY <= ry + rh && p.endY >= ry);
    }
    if (wall === 'E') {
      return sharedPartitions.vertical.some((p) => Math.abs(p.x - (rx + rw)) < 0.05 && p.startY <= ry + rh && p.endY >= ry);
    }
    return false;
  }, [sharedPartitions]);

  // Pointer move handler (drag rooms, drag openings, resize handles, pan, cursor tracking)
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const coords = toRoomCoords(e.clientX, e.clientY);
    if (onCursorMove) {
      onCursorMove({
        x: Math.round(coords.x * 100) / 100,
        y: Math.round(coords.y * 100) / 100,
      });
    }

    // Handle smooth panning with 1:1 mouse movement tracking
    if (isPanning && onPanChange) {
      const svg = svgRef.current;
      const ctm = svg?.getScreenCTM();
      const scale = ctm ? ctm.a : 1; // Screen pixels per SVG unit
      const dx = (e.clientX - panStart.x) / scale;
      const dy = (e.clientY - panStart.y) / scale;
      onPanChange({
        x: (panOffset?.x || 0) + dx,
        y: (panOffset?.y || 0) + dy,
      });
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    // Handle dragging an entire room to reposition it
    if (draggingRoomInfo && onUpdateRoom) {
      const parentRoom = allRooms.find((r) => r.id === draggingRoomInfo.roomId);
      if (parentRoom) {
        const svg = svgRef.current;
        const ctm = svg?.getScreenCTM();
        const scale = ctm ? ctm.a : 1;
        const deltaX = (e.clientX - draggingRoomInfo.startClient.x) / (scale * BASE_PPM);
        const deltaY = (e.clientY - draggingRoomInfo.startClient.y) / (scale * BASE_PPM);

        const rawX = draggingRoomInfo.startPos.x + deltaX;
        const rawY = draggingRoomInfo.startPos.y + deltaY;

        const otherRooms = allRooms.filter((r) => r.id !== draggingRoomInfo.roomId);
        const snapped = computeSnappedRoomPosition(rawX, rawY, parentRoom, otherRooms, unit);

        setAlignmentGuides({ x: snapped.guideX, y: snapped.guideY });

        if (Math.abs(snapped.x - (parentRoom.x || 0)) > 0.005 || Math.abs(snapped.y - (parentRoom.y || 0)) > 0.005) {
          onUpdateRoom({
            ...parentRoom,
            x: snapped.x,
            y: snapped.y,
          });
        }
      }
      return;
    }

    // Handle resizing a room by dragging its edge or corner handle
    if (resizingRoomInfo && onUpdateRoom) {
      const parentRoom = allRooms.find((r) => r.id === resizingRoomInfo.roomId);
      if (parentRoom) {
        const svg = svgRef.current;
        const ctm = svg?.getScreenCTM();
        const scale = ctm ? ctm.a : 1;
        const deltaX = (e.clientX - resizingRoomInfo.startClient.x) / (scale * BASE_PPM);
        const deltaY = (e.clientY - resizingRoomInfo.startClient.y) / (scale * BASE_PPM);

        let newBreadth = parentRoom.breadth;
        let newLength = parentRoom.length;

        if (resizingRoomInfo.handle === 'right' || resizingRoomInfo.handle === 'corner') {
          const rawB = resizingRoomInfo.startDim.breadth + deltaX;
          newBreadth = Math.max(1.5, Math.round(rawB * 10) / 10);
        }
        if (resizingRoomInfo.handle === 'bottom' || resizingRoomInfo.handle === 'corner') {
          const rawL = resizingRoomInfo.startDim.length + deltaY;
          newLength = Math.max(1.5, Math.round(rawL * 10) / 10);
        }

        if (newBreadth !== parentRoom.breadth || newLength !== parentRoom.length) {
          onUpdateRoom({
            ...parentRoom,
            breadth: newBreadth,
            length: newLength,
          });
        }
      }
      return;
    }

    // Handle dragging an opening along its wall with precision snapping
    if (draggingOpeningInfo && onUpdateOpening) {
      const parentRoom = allRooms.find((r) => r.id === draggingOpeningInfo.roomId);
      if (!parentRoom) return;

      const activeOp = parentRoom.openings.find((o) => o.id === draggingOpeningInfo.openingId);
      if (!activeOp) return;

      const wallLen = activeOp.wall === 'N' || activeOp.wall === 'S' ? parentRoom.breadth : parentRoom.length;
      let newPos = activeOp.position;

      const rx = parentRoom.x || 0;
      const ry = parentRoom.y || 0;

      if (activeOp.wall === 'N' || activeOp.wall === 'S') {
        newPos = (coords.x - rx) - dragOffset;
      } else {
        newPos = (coords.y - ry) - dragOffset;
      }

      // Snap to increments: 0.05m in metric, 0.0254m (1 inch) in imperial
      if (unit === 'imperial') {
        newPos = Math.round(newPos / 0.0254) * 0.0254;
      } else {
        newPos = Math.round(newPos * 20) / 20; // 0.05m
      }

      const minPos = 0.05;
      const maxPos = wallLen - activeOp.width - 0.05;
      newPos = Math.max(minPos, Math.min(maxPos, newPos));

      if (Math.abs(newPos - activeOp.position) > 0.001) {
        onUpdateOpening({
          ...activeOp,
          position: newPos,
        });
      }
    }
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button === 0 && !draggingOpeningInfo && !draggingRoomInfo && !resizingRoomInfo) {
      const target = e.target as SVGElement;
      if (
        target.dataset.drag !== 'opening' &&
        target.dataset.interactive !== 'room' &&
        target.dataset.drag !== 'room' &&
        target.dataset.drag !== 'resize'
      ) {
        setIsPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY });
        if (onSelectOpening) {
          onSelectOpening(null);
        }
      }
    }
  };

  const handlePointerUp = () => {
    setIsPanning(false);
    setDraggingOpeningInfo(null);
    setDraggingRoomInfo(null);
    setResizingRoomInfo(null);
    setAlignmentGuides({ x: null, y: null });
  };

  // Start dragging a room to reposition it
  const handleRoomDragStart = (e: React.PointerEvent, rm: RoomConfig) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (onSelectRoom) onSelectRoom(rm.id || null);
    if (onSelectOpening) onSelectOpening(null);

    setDraggingRoomInfo({
      roomId: rm.id!,
      startClient: { x: e.clientX, y: e.clientY },
      startPos: { x: rm.x || 0, y: rm.y || 0 },
    });
  };

  // Start resizing a room by dragging its edge or corner handle
  const handleResizeStart = (e: React.PointerEvent, rm: RoomConfig, handle: 'right' | 'bottom' | 'corner') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (onSelectRoom) onSelectRoom(rm.id || null);
    if (onSelectOpening) onSelectOpening(null);

    setResizingRoomInfo({
      roomId: rm.id!,
      handle,
      startClient: { x: e.clientX, y: e.clientY },
      startDim: { breadth: rm.breadth, length: rm.length },
    });
  };

  // Mouse wheel zoom support
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    if (!onZoomChange) return;
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(3.0, Math.max(0.3, Math.round(currentZoom * zoomFactor * 100) / 100));
    onZoomChange(newZoom);
  };

  // Start dragging an opening
  const handleOpeningDragStart = (e: React.PointerEvent, roomId: string, op: Opening) => {
    e.stopPropagation();
    setDraggingOpeningInfo({ roomId, openingId: op.id });
    if (onSelectOpening) {
      onSelectOpening(op.id);
    }
    const coords = toRoomCoords(e.clientX, e.clientY);
    const parentRoom = allRooms.find((r) => r.id === roomId);
    const rx = parentRoom?.x || 0;
    const ry = parentRoom?.y || 0;
    const offset = (op.wall === 'N' || op.wall === 'S') ? (coords.x - rx - op.position) : (coords.y - ry - op.position);
    setDragOffset(offset);
  };

  // Selected opening object
  const selectedOpening = useMemo(() => {
    for (const r of allRooms) {
      const found = r.openings.find((o) => o.id === selectedOpeningId);
      if (found) return found;
    }
    return null;
  }, [allRooms, selectedOpeningId]);

  return (
    <div className="relative w-full h-full flex items-center justify-center select-none overflow-hidden bg-white">
      <svg
        id="floorplan-canvas-svg"
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full cursor-grab active:cursor-grabbing"
        viewBox={viewBox}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
      >
        <defs>
          {/* ================================================================= */}
          {/* 1. METRIC GRID: EXACTLY 10 EQUAL SUBDIVISIONS PER 1.0 METER        */}
          {/* 1.0m block = 100 units; subdivided into ten 10cm (10-unit) cells  */}
          {/* Anchored to x={originX} y={originY} so room NW corner is snapped  */}
          {/* ================================================================= */}
          <pattern
            id={`grid-metric-10-${theme}`}
            width="100"
            height="100"
            patternUnits="userSpaceOnUse"
            x={originX}
            y={originY}
          >
            {/* Minor Subdivisions: 8 lines at 10, 20, 30, 40, 60, 70, 80, 90 */}
            <path
              d="M 10 0 L 10 100 M 20 0 L 20 100 M 30 0 L 30 100 M 40 0 L 40 100 M 60 0 L 60 100 M 70 0 L 70 100 M 80 0 L 80 100 M 90 0 L 90 100 M 0 10 L 100 10 M 0 20 L 100 20 M 0 30 L 100 30 M 0 40 L 100 40 M 0 60 L 100 60 M 0 70 L 100 70 M 0 80 L 100 80 M 0 90 L 100 90"
              fill="none"
              stroke={colors.gridMinor}
              strokeWidth="0.65"
            />

            {/* Medium 5th Subdivision (Half-meter mark at 50) */}
            <path
              d="M 50 0 L 50 100 M 0 50 L 100 50"
              fill="none"
              stroke={colors.gridMedium}
              strokeWidth="1.0"
            />

            {/* Major Grid Lines (1.0m boundary at 100) */}
            <path
              d="M 100 0 L 100 100 M 0 100 L 100 100"
              fill="none"
              stroke={colors.gridMajor}
              strokeWidth="1.5"
            />
          </pattern>

          {/* ================================================================= */}
          {/* 2. IMPERIAL GRID: EXACTLY 10 EQUAL SUBDIVISIONS PER 1.0 FOOT       */}
          {/* 1.0ft block = 30.48 units; subdivided into ten 3.048-unit cells   */}
          {/* ================================================================= */}
          <pattern
            id={`grid-imperial-10-${theme}`}
            width="30.48"
            height="30.48"
            patternUnits="userSpaceOnUse"
            x={originX}
            y={originY}
          >
            {/* Minor Subdivisions: 8 lines */}
            <path
              d="M 3.048 0 L 3.048 30.48 M 6.096 0 L 6.096 30.48 M 9.144 0 L 9.144 30.48 M 12.192 0 L 12.192 30.48 M 18.288 0 L 18.288 30.48 M 21.336 0 L 21.336 30.48 M 24.384 0 L 24.384 30.48 M 27.432 0 L 27.432 30.48 M 0 3.048 L 30.48 3.048 M 0 6.096 L 30.48 6.096 M 0 9.144 L 30.48 9.144 M 0 12.192 L 30.48 12.192 M 0 18.288 L 30.48 18.288 M 0 21.336 L 30.48 21.336 M 0 24.384 L 30.48 24.384 M 0 27.432 L 30.48 27.432"
              fill="none"
              stroke={colors.gridMinor}
              strokeWidth="0.65"
            />

            {/* Medium 5th Subdivision (Half-foot mark at 15.24) */}
            <path
              d="M 15.24 0 L 15.24 30.48 M 0 15.24 L 30.48 15.24"
              fill="none"
              stroke={colors.gridMedium}
              strokeWidth="1.0"
            />

            {/* Major Grid Lines (1-foot boundary at 30.48) */}
            <path
              d="M 30.48 0 L 30.48 30.48 M 0 30.48 L 30.48 30.48"
              fill="none"
              stroke={colors.gridMajor}
              strokeWidth="1.5"
            />
          </pattern>

          {/* Wall Hatching Pattern */}
          <pattern
            id={`wall-hatch-${theme}`}
            width="8"
            height="8"
            patternTransform="rotate(45 0 0)"
            patternUnits="userSpaceOnUse"
          >
            <line x1="0" y1="0" x2="0" y2="8" stroke={colors.innerLine} strokeWidth="1" opacity="0.3" />
          </pattern>
        </defs>

        {/* 1. Infinite Canvas White Background */}
        <rect
          data-export-bg="true"
          x={viewBoxX - 5000}
          y={viewBoxY - 5000}
          width={viewWidth + 10000}
          height={viewHeight + 10000}
          fill={colors.bg}
        />

        {/* 2. Subdivided Architectural Grid (Exactly 10 subdivisions per major unit) */}
        {showGrid && (
          <rect
            data-export-grid="true"
            x={viewBoxX - 5000}
            y={viewBoxY - 5000}
            width={viewWidth + 10000}
            height={viewHeight + 10000}
            fill={`url(#${unit === 'imperial' ? `grid-imperial-10-${theme}` : `grid-metric-10-${theme}`})`}
          />
        )}

        {/* 3. Rooms Interior Floors (Draggable to Reposition, Clickable to Select) */}
        {allRooms.map((rm) => {
          const rx = rm.x || 0;
          const ry = rm.y || 0;
          const isSelected = rm.id === activeRoomId;
          const isDragging = draggingRoomInfo?.roomId === rm.id;
          const isHovered = hoveredRoomId === rm.id;

          return (
            <g key={`room-floor-${rm.id}`}>
              <rect
                data-interactive="room"
                data-drag="room"
                x={toScreenX(rx)}
                y={toScreenY(ry)}
                width={rm.breadth * BASE_PPM}
                height={rm.length * BASE_PPM}
                fill={isDragging ? '#eff6ff' : isHovered ? '#f8fafc' : colors.roomFill}
                stroke={isDragging ? '#2563eb' : isSelected ? '#2563eb' : colors.innerLine}
                strokeWidth={isDragging ? '3.5' : isSelected ? '2.5' : '1.5'}
                strokeDasharray={isSelected ? '6 3' : 'none'}
                className="cursor-move transition-colors"
                onPointerDown={(e) => handleRoomDragStart(e, rm)}
                onMouseEnter={() => setHoveredRoomId(rm.id || null)}
                onMouseLeave={() => setHoveredRoomId(null)}
                style={isDragging ? { filter: 'drop-shadow(0 10px 20px rgba(37,99,235,0.25))' } : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onSelectRoom) onSelectRoom(rm.id || null);
                }}
              />
            </g>
          );
        })}

        {/* 4. Multi-Room Walls (Exterior Envelope vs. Interior Dividing Partitions) */}
        {allRooms.map((rm) => {
          const rx = rm.x || 0;
          const ry = rm.y || 0;
          const rw = rm.breadth;
          const rh = rm.length;

          // Check which walls are exterior envelope vs. interior shared partitions
          const isNorthShared = isWallShared(rx, ry, rw, rh, 'N');
          const isSouthShared = isWallShared(rx, ry, rw, rh, 'S');
          const isWestShared = isWallShared(rx, ry, rw, rh, 'W');
          const isEastShared = isWallShared(rx, ry, rw, rh, 'E');

          // Segment calculations cutting out doors/windows
          const getSegments = (wallSide: WallSide, length: number) => {
            const ops = rm.openings.filter((o) => o.wall === wallSide).sort((a, b) => a.position - b.position);
            const segs: Array<{ start: number; end: number }> = [];
            let cur = 0;
            ops.forEach((o) => {
              const start = Math.max(0, Math.min(length, o.position));
              const end = Math.max(0, Math.min(length, o.position + o.width));
              if (start > cur) segs.push({ start: cur, end: start });
              cur = Math.max(cur, end);
            });
            if (cur < length) segs.push({ start: cur, end: length });
            return segs;
          };

          const northSegs = getSegments('N', rw);
          const southSegs = getSegments('S', rw);
          const westSegs = getSegments('W', rh);
          const eastSegs = getSegments('E', rh);

          return (
            <g key={`room-walls-${rm.id}`}>
              {/* North Wall: render only if exterior OR if rm is the top-most room */}
              {(!isNorthShared || !sharedPartitions.horizontal.some(p => Math.abs(p.y - ry) < 0.05 && p.room2Id === rm.id)) && (
                northSegs.map((seg, i) => {
                  const wallThick = isNorthShared ? intWallT : extWallT;
                  return (
                    <g key={`nw-${rm.id}-${i}`}>
                      <rect
                        x={toScreenX(rx + seg.start)}
                        y={toScreenY(ry - wallThick)}
                        width={(seg.end - seg.start) * BASE_PPM}
                        height={wallThick * BASE_PPM}
                        fill={colors.wallFill}
                        stroke={colors.wallStroke}
                        strokeWidth="1.5"
                      />
                      {!isNorthShared && (
                        <rect
                          x={toScreenX(rx + seg.start)}
                          y={toScreenY(ry - wallThick)}
                          width={(seg.end - seg.start) * BASE_PPM}
                          height={wallThick * BASE_PPM}
                          fill={`url(#wall-hatch-${theme})`}
                        />
                      )}
                    </g>
                  );
                })
              )}

              {/* South Wall: render only if exterior */}
              {!isSouthShared && (
                southSegs.map((seg, i) => (
                  <g key={`sw-${rm.id}-${i}`}>
                    <rect
                      x={toScreenX(rx + seg.start)}
                      y={toScreenY(ry + rh)}
                      width={(seg.end - seg.start) * BASE_PPM}
                      height={extWallT * BASE_PPM}
                      fill={colors.wallFill}
                      stroke={colors.wallStroke}
                      strokeWidth="1.5"
                    />
                    <rect
                      x={toScreenX(rx + seg.start)}
                      y={toScreenY(ry + rh)}
                      width={(seg.end - seg.start) * BASE_PPM}
                      height={extWallT * BASE_PPM}
                      fill={`url(#wall-hatch-${theme})`}
                    />
                  </g>
                ))
              )}

              {/* West Wall: render only if exterior OR if rm is the left-most room */}
              {(!isWestShared || !sharedPartitions.vertical.some(p => Math.abs(p.x - rx) < 0.05 && p.room2Id === rm.id)) && (
                westSegs.map((seg, i) => {
                  const wallThick = isWestShared ? intWallT : extWallT;
                  return (
                    <g key={`ww-${rm.id}-${i}`}>
                      <rect
                        x={toScreenX(rx - wallThick)}
                        y={toScreenY(ry + seg.start)}
                        width={wallThick * BASE_PPM}
                        height={(seg.end - seg.start) * BASE_PPM}
                        fill={colors.wallFill}
                        stroke={colors.wallStroke}
                        strokeWidth="1.5"
                      />
                      {!isWestShared && (
                        <rect
                          x={toScreenX(rx - wallThick)}
                          y={toScreenY(ry + seg.start)}
                          width={wallThick * BASE_PPM}
                          height={(seg.end - seg.start) * BASE_PPM}
                          fill={`url(#wall-hatch-${theme})`}
                        />
                      )}
                    </g>
                  );
                })
              )}

              {/* East Wall: render only if exterior */}
              {!isEastShared && (
                eastSegs.map((seg, i) => (
                  <g key={`ew-${rm.id}-${i}`}>
                    <rect
                      x={toScreenX(rx + rw)}
                      y={toScreenY(ry + seg.start)}
                      width={extWallT * BASE_PPM}
                      height={(seg.end - seg.start) * BASE_PPM}
                      fill={colors.wallFill}
                      stroke={colors.wallStroke}
                      strokeWidth="1.5"
                    />
                    <rect
                      x={toScreenX(rx + rw)}
                      y={toScreenY(ry + seg.start)}
                      width={extWallT * BASE_PPM}
                      height={(seg.end - seg.start) * BASE_PPM}
                      fill={`url(#wall-hatch-${theme})`}
                    />
                  </g>
                ))
              )}
            </g>
          );
        })}

        {/* 5. CAD ORIGIN DATUM MARKER - SNAPPED TO (0, 0) GRID CORNER */}
        <g transform={`translate(${toScreenX(bounds.minX)}, ${toScreenY(bounds.minY)})`} className="pointer-events-none">
          {/* Crosshair extending along grid axes */}
          <line x1="-30" y1="0" x2="30" y2="0" stroke="#ef4444" strokeWidth="1.2" strokeDasharray="4 2" opacity="0.85" />
          <line x1="0" y1="-30" x2="0" y2="30" stroke="#ef4444" strokeWidth="1.2" strokeDasharray="4 2" opacity="0.85" />

          {/* Surveyor / CAD Datum Target Circle */}
          <circle cx="0" cy="0" r="10" fill="none" stroke="#ef4444" strokeWidth="1.5" />
          <path d="M 0 0 L 10 0 A 10 10 0 0 0 0 -10 Z" fill="#ef4444" opacity="0.65" />
          <path d="M 0 0 L -10 0 A 10 10 0 0 0 0 10 Z" fill="#ef4444" opacity="0.65" />
          <circle cx="0" cy="0" r="2.5" fill="#ffffff" />

          {/* Snapped Corner Indicator Badge */}
          <g transform="translate(-76, -28)">
            <rect width="72" height="22" rx="4" fill="#ffffff" stroke="#ef4444" strokeWidth="1.2" style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.15))' }} />
            <text x="36" y="15" textAnchor="middle" fill="#ef4444" fontSize="11" fontFamily="system-ui, monospace" fontWeight="bold">
              (0, 0) SNAP
            </text>
          </g>
        </g>

        {/* 6. Openings (Doors & Windows) across all rooms */}
        {allRooms.map((rm) => {
          const rx = rm.x || 0;
          const ry = rm.y || 0;
          const rw = rm.breadth;
          const rh = rm.length;

          return rm.openings.map((op, idx) => {
            const isSelected = op.id === selectedOpeningId;
            const isDoor = op.type === 'door';
            const pos = op.position;
            const w = op.width;
            const label = isDoor ? `D${idx + 1}` : `W${idx + 1}`;

            // Check if this wall is interior shared partition or exterior wall
            const isShared = isWallShared(rx, ry, rw, rh, op.wall);
            const wallThick = isShared ? intWallT : extWallT;

            let cutX = 0;
            let cutY = 0;
            let cutW = 0;
            let cutH = 0;
            let doorHingeX = 0;
            let doorHingeY = 0;
            let doorLeafEndX = 0;
            let doorLeafEndY = 0;
            let arcPath = '';

            const flipHinge = !!op.flipHinge;
            const flipSwing = !!op.flipSwing;

            if (op.wall === 'N') {
              cutX = toScreenX(rx + pos);
              cutY = toScreenY(ry - wallThick);
              cutW = w * BASE_PPM;
              cutH = wallThick * BASE_PPM;

              const swingDirY = flipSwing ? -1 : 1;
              const hingeAtLeft = !flipHinge;
              doorHingeX = hingeAtLeft ? toScreenX(rx + pos) : toScreenX(rx + pos + w);
              doorHingeY = toScreenY(ry);

              doorLeafEndX = doorHingeX;
              doorLeafEndY = doorHingeY + swingDirY * (w * BASE_PPM);

              const closedX = hingeAtLeft ? toScreenX(rx + pos + w) : toScreenX(rx + pos);
              const closedY = doorHingeY;
              const sweepFlag = (hingeAtLeft ? !flipSwing : flipSwing) ? 1 : 0;
              arcPath = `M ${closedX} ${closedY} A ${w * BASE_PPM} ${w * BASE_PPM} 0 0 ${sweepFlag} ${doorLeafEndX} ${doorLeafEndY}`;
            } else if (op.wall === 'S') {
              cutX = toScreenX(rx + pos);
              cutY = toScreenY(ry + rh);
              cutW = w * BASE_PPM;
              cutH = wallThick * BASE_PPM;

              const swingDirY = flipSwing ? 1 : -1;
              const hingeAtLeft = !flipHinge;
              doorHingeX = hingeAtLeft ? toScreenX(rx + pos) : toScreenX(rx + pos + w);
              doorHingeY = toScreenY(ry + rh);

              doorLeafEndX = doorHingeX;
              doorLeafEndY = doorHingeY + swingDirY * (w * BASE_PPM);

              const closedX = hingeAtLeft ? toScreenX(rx + pos + w) : toScreenX(rx + pos);
              const closedY = doorHingeY;
              const sweepFlag = (hingeAtLeft ? flipSwing : !flipSwing) ? 1 : 0;
              arcPath = `M ${closedX} ${closedY} A ${w * BASE_PPM} ${w * BASE_PPM} 0 0 ${sweepFlag} ${doorLeafEndX} ${doorLeafEndY}`;
            } else if (op.wall === 'W') {
              cutX = toScreenX(rx - wallThick);
              cutY = toScreenY(ry + pos);
              cutW = wallThick * BASE_PPM;
              cutH = w * BASE_PPM;

              const swingDirX = flipSwing ? -1 : 1;
              const hingeAtTop = !flipHinge;
              doorHingeX = toScreenX(rx);
              doorHingeY = hingeAtTop ? toScreenY(ry + pos) : toScreenY(ry + pos + w);

              doorLeafEndX = doorHingeX + swingDirX * (w * BASE_PPM);
              doorLeafEndY = doorHingeY;

              const closedX = doorHingeX;
              const closedY = hingeAtTop ? toScreenY(ry + pos + w) : toScreenY(ry + pos);
              const sweepFlag = (hingeAtTop ? flipSwing : !flipSwing) ? 1 : 0;
              arcPath = `M ${closedX} ${closedY} A ${w * BASE_PPM} ${w * BASE_PPM} 0 0 ${sweepFlag} ${doorLeafEndX} ${doorLeafEndY}`;
            } else if (op.wall === 'E') {
              cutX = toScreenX(rx + rw);
              cutY = toScreenY(ry + pos);
              cutW = wallThick * BASE_PPM;
              cutH = w * BASE_PPM;

              const swingDirX = flipSwing ? 1 : -1;
              const hingeAtTop = !flipHinge;
              doorHingeX = toScreenX(rx + rw);
              doorHingeY = hingeAtTop ? toScreenY(ry + pos) : toScreenY(ry + pos + w);

              doorLeafEndX = doorHingeX + swingDirX * (w * BASE_PPM);
              doorLeafEndY = doorHingeY;

              const closedX = doorHingeX;
              const closedY = hingeAtTop ? toScreenY(ry + pos + w) : toScreenY(ry + pos);
              const sweepFlag = (hingeAtTop ? !flipSwing : flipSwing) ? 1 : 0;
              arcPath = `M ${closedX} ${closedY} A ${w * BASE_PPM} ${w * BASE_PPM} 0 0 ${sweepFlag} ${doorLeafEndX} ${doorLeafEndY}`;
            }

            return (
              <g
                key={`${rm.id}-${op.id}`}
                data-drag="opening"
                className="cursor-move group"
                onPointerDown={(e) => handleOpeningDragStart(e, rm.id!, op)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onSelectOpening) onSelectOpening(op.id);
                  if (onSelectRoom) onSelectRoom(rm.id!);
                }}
              >
                {/* Wall Opening Cutout */}
                <rect
                  x={cutX}
                  y={cutY}
                  width={cutW}
                  height={cutH}
                  fill={colors.roomFill}
                  stroke={isSelected ? colors.selectedGlow : colors.innerLine}
                  strokeWidth={isSelected ? '2.5' : '1'}
                  strokeDasharray={isSelected ? '4 2' : 'none'}
                />

                {/* Jamb Lines */}
                {op.wall === 'N' || op.wall === 'S' ? (
                  <>
                    <line x1={cutX} y1={cutY} x2={cutX} y2={cutY + cutH} stroke={colors.wallStroke} strokeWidth="2" />
                    <line x1={cutX + cutW} y1={cutY} x2={cutX + cutW} y2={cutY + cutH} stroke={colors.wallStroke} strokeWidth="2" />
                  </>
                ) : (
                  <>
                    <line x1={cutX} y1={cutY} x2={cutX + cutW} y2={cutY} stroke={colors.wallStroke} strokeWidth="2" />
                    <line x1={cutX} y1={cutY + cutH} x2={cutX + cutW} y2={cutY + cutH} stroke={colors.wallStroke} strokeWidth="2" />
                  </>
                )}

                {/* Door Representation */}
                {isDoor && (
                  <g>
                    <path
                      d={arcPath}
                      fill="none"
                      stroke={isSelected ? colors.selectedGlow : colors.doorArc}
                      strokeWidth="1.8"
                      strokeDasharray="4 3"
                    />
                    <line
                      x1={doorHingeX}
                      y1={doorHingeY}
                      x2={doorLeafEndX}
                      y2={doorLeafEndY}
                      stroke={isSelected ? colors.selectedGlow : colors.doorLeaf}
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
                    <circle
                      cx={doorHingeX}
                      cy={doorHingeY}
                      r="4"
                      fill={isSelected ? colors.selectedGlow : colors.doorLeaf}
                    />
                  </g>
                )}

                {/* Window Representation */}
                {!isDoor && (
                  <g>
                    {op.wall === 'N' && (
                      <>
                        <line x1={cutX - 4} y1={cutY} x2={cutX + cutW + 4} y2={cutY} stroke={colors.windowSill} strokeWidth="3" />
                        <line x1={cutX} y1={cutY + cutH * 0.35} x2={cutX + cutW} y2={cutY + cutH * 0.35} stroke={colors.windowGlass} strokeWidth="2" />
                        <line x1={cutX} y1={cutY + cutH * 0.65} x2={cutX + cutW} y2={cutY + cutH * 0.65} stroke={colors.windowGlass} strokeWidth="2" />
                      </>
                    )}
                    {op.wall === 'S' && (
                      <>
                        <line x1={cutX - 4} y1={cutY + cutH} x2={cutX + cutW + 4} y2={cutY + cutH} stroke={colors.windowSill} strokeWidth="3" />
                        <line x1={cutX} y1={cutY + cutH * 0.35} x2={cutX + cutW} y2={cutY + cutH * 0.35} stroke={colors.windowGlass} strokeWidth="2" />
                        <line x1={cutX} y1={cutY + cutH * 0.65} x2={cutX + cutW} y2={cutY + cutH * 0.65} stroke={colors.windowGlass} strokeWidth="2" />
                      </>
                    )}
                    {op.wall === 'W' && (
                      <>
                        <line x1={cutX} y1={cutY - 4} x2={cutX} y2={cutY + cutH + 4} stroke={colors.windowSill} strokeWidth="3" />
                        <line x1={cutX + cutW * 0.35} y1={cutY} x2={cutX + cutW * 0.35} y2={cutY + cutH} stroke={colors.windowGlass} strokeWidth="2" />
                        <line x1={cutX + cutW * 0.65} y1={cutY} x2={cutX + cutW * 0.65} y2={cutY + cutH} stroke={colors.windowGlass} strokeWidth="2" />
                      </>
                    )}
                    {op.wall === 'E' && (
                      <>
                        <line x1={cutX + cutW} y1={cutY - 4} x2={cutX + cutW} y2={cutY + cutH + 4} stroke={colors.windowSill} strokeWidth="3" />
                        <line x1={cutX + cutW * 0.35} y1={cutY} x2={cutX + cutW * 0.35} y2={cutY + cutH} stroke={colors.windowGlass} strokeWidth="2" />
                        <line x1={cutX + cutW * 0.65} y1={cutY} x2={cutX + cutW * 0.65} y2={cutY + cutH} stroke={colors.windowGlass} strokeWidth="2" />
                      </>
                    )}
                  </g>
                )}

                {/* Tag Badge */}
                <g
                  transform={`translate(${cutX + cutW / 2}, ${
                    op.wall === 'N'
                      ? cutY - 18
                      : op.wall === 'S'
                      ? cutY + cutH + 20
                      : cutY + cutH / 2
                  })`}
                >
                  <rect
                    x="-36"
                    y="-12"
                    width="72"
                    height="24"
                    rx="5"
                    fill={isSelected ? colors.selectedGlow : colors.tagBg}
                    stroke={isSelected ? '#ffffff' : colors.tagBorder}
                    strokeWidth="1.5"
                    style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))' }}
                  />
                  <text
                    x="0"
                    y="4"
                    textAnchor="middle"
                    fill={isSelected ? '#000000' : colors.tagText}
                    fontSize="12"
                    fontFamily="system-ui, sans-serif"
                    fontWeight="bold"
                  >
                    {label} · {formatDistance(w, unit)}
                  </text>
                </g>
              </g>
            );
          });
        })}

        {/* 7. Room Center Architectural Stamps */}
        {allRooms.map((rm) => {
          const rx = rm.x || 0;
          const ry = rm.y || 0;
          const cx = rx + rm.breadth / 2;
          const cy = ry + rm.length / 2;
          const areaSqm = rm.breadth * rm.length;
          const isSelected = rm.id === activeRoomId;

          return (
            <g
              key={`room-stamp-${rm.id}`}
              transform={`translate(${toScreenX(cx)}, ${toScreenY(cy)})`}
              className="pointer-events-none"
            >
              {/* Type pill */}
              {rm.type && (
                <rect
                  x="-35"
                  y="-34"
                  width="70"
                  height="16"
                  rx="4"
                  fill={isSelected ? '#2563eb' : '#f1f5f9'}
                  stroke={isSelected ? '#1d4ed8' : '#cbd5e1'}
                  strokeWidth="1"
                />
              )}
              {rm.type && (
                <text
                  x="0"
                  y="-22"
                  textAnchor="middle"
                  fill={isSelected ? '#ffffff' : '#64748b'}
                  fontSize="9.5"
                  fontFamily="system-ui, sans-serif"
                  fontWeight="bold"
                  letterSpacing="0.08em"
                >
                  {rm.type.toUpperCase()}
                </text>
              )}

              {/* Room Name */}
              <text
                x="0"
                y="-4"
                textAnchor="middle"
                fill={colors.dimensionText}
                fontSize={rm.breadth < 3 || rm.length < 3 ? '16' : '19'}
                fontFamily="system-ui, sans-serif"
                fontWeight="bold"
                letterSpacing="0.04em"
              >
                {rm.name || 'ROOM'}
              </text>

              {/* Area */}
              <text
                x="0"
                y="16"
                textAnchor="middle"
                fill={colors.innerLine}
                fontSize={rm.breadth < 3 || rm.length < 3 ? '13' : '15'}
                fontFamily="system-ui, monospace"
                fontWeight="600"
              >
                {unit === 'imperial'
                  ? `${(areaSqm * 10.7639).toFixed(1)} sq ft  (${areaSqm.toFixed(2)} m²)`
                  : `${areaSqm.toFixed(2)} m²  (${(areaSqm * 10.7639).toFixed(1)} sq ft)`}
              </text>

              {/* Dimensions */}
              <text
                x="0"
                y="32"
                textAnchor="middle"
                fill={colors.innerLine}
                fontSize="12"
                fontFamily="system-ui, monospace"
                opacity="0.85"
              >
                {formatDistance(rm.breadth, unit)} × {formatDistance(rm.length, unit)}
              </text>

              {/* Move Indicator badge in room stamp */}
              <g
                data-drag="room"
                className="cursor-move hover:scale-105 transition-transform"
                style={{ pointerEvents: 'auto' }}
                onPointerDown={(e) => handleRoomDragStart(e, rm)}
              >
                <rect
                  x="-48"
                  y="40"
                  width="96"
                  height="20"
                  rx="10"
                  fill={isSelected ? '#eff6ff' : '#f8fafc'}
                  stroke={isSelected ? '#3b82f6' : '#cbd5e1'}
                  strokeWidth="1.2"
                />
                <text
                  x="0"
                  y="53"
                  textAnchor="middle"
                  fill={isSelected ? '#1d4ed8' : '#64748b'}
                  fontSize="9.5"
                  fontFamily="system-ui, sans-serif"
                  fontWeight="bold"
                >
                  ✢ Drag to Move
                </text>
              </g>
            </g>
          );
        })}

        {/* 8. Overall CAD Dimension Strings & Tick Marks */}
        {showDimensions && (
          <g className="pointer-events-none">
            {/* North Overall Width Dimension */}
            <g>
              {(() => {
                const dimY = toScreenY(bounds.minY - extWallT - 0.75);
                const x1 = toScreenX(bounds.minX);
                const x2 = toScreenX(bounds.maxX);
                return (
                  <>
                    <line x1={x1} y1={toScreenY(bounds.minY - extWallT)} x2={x1} y2={dimY - 8} stroke={colors.dimensionLine} strokeWidth="1" strokeDasharray="3 2" />
                    <line x1={x2} y1={toScreenY(bounds.minY - extWallT)} x2={x2} y2={dimY - 8} stroke={colors.dimensionLine} strokeWidth="1" strokeDasharray="3 2" />
                    <line x1={x1} y1={dimY} x2={x2} y2={dimY} stroke={colors.dimensionLine} strokeWidth="1.5" />
                    <line x1={x1 - 6} y1={dimY + 6} x2={x1 + 6} y2={dimY - 6} stroke={colors.dimensionLine} strokeWidth="2.2" />
                    <line x1={x2 - 6} y1={dimY + 6} x2={x2 + 6} y2={dimY - 6} stroke={colors.dimensionLine} strokeWidth="2.2" />
                    <rect x={(x1 + x2) / 2 - 50} y={dimY - 16} width="100" height="20" fill={colors.bg} rx="3" />
                    <text
                      x={(x1 + x2) / 2}
                      y={dimY - 2}
                      textAnchor="middle"
                      fill={colors.dimensionText}
                      fontSize="14"
                      fontFamily="system-ui, monospace"
                      fontWeight="bold"
                    >
                      {formatDistance(bounds.width, unit)} (TOTAL)
                    </text>
                  </>
                );
              })()}
            </g>

            {/* West Overall Length Dimension */}
            <g>
              {(() => {
                const dimX = toScreenX(bounds.minX - extWallT - 0.75);
                const y1 = toScreenY(bounds.minY);
                const y2 = toScreenY(bounds.maxY);
                return (
                  <>
                    <line x1={toScreenX(bounds.minX - extWallT)} y1={y1} x2={dimX - 8} y2={y1} stroke={colors.dimensionLine} strokeWidth="1" strokeDasharray="3 2" />
                    <line x1={toScreenX(bounds.minX - extWallT)} y1={y2} x2={dimX - 8} y2={y2} stroke={colors.dimensionLine} strokeWidth="1" strokeDasharray="3 2" />
                    <line x1={dimX} y1={y1} x2={dimX} y2={y2} stroke={colors.dimensionLine} strokeWidth="1.5" />
                    <line x1={dimX - 6} y1={y1 + 6} x2={dimX + 6} y2={y1 - 6} stroke={colors.dimensionLine} strokeWidth="2.2" />
                    <line x1={dimX - 6} y1={y2 + 6} x2={dimX + 6} y2={y2 - 6} stroke={colors.dimensionLine} strokeWidth="2.2" />
                    <g transform={`translate(${dimX - 12}, ${(y1 + y2) / 2}) rotate(-90)`}>
                      <rect x="-50" y="-14" width="100" height="20" fill={colors.bg} rx="3" />
                      <text
                        x="0"
                        y="0"
                        textAnchor="middle"
                        fill={colors.dimensionText}
                        fontSize="14"
                        fontFamily="system-ui, monospace"
                        fontWeight="bold"
                      >
                        {formatDistance(bounds.height, unit)} (TOTAL)
                      </text>
                    </g>
                  </>
                );
              })()}
            </g>
          </g>
        )}

        {/* 9. Architectural North Compass Rose (Top Right of sheet) */}
        <g transform={`translate(${baseWidth - 65}, 65)`} className="pointer-events-none">
          <circle cx="0" cy="0" r="26" fill={colors.bg} stroke={colors.dimensionLine} strokeWidth="1.5" opacity="0.9" />
          <polygon points="0,-22 6,0 0,-5 -6,0" fill="#ef4444" />
          <polygon points="0,22 6,0 0,5 -6,0" fill={colors.dimensionLine} opacity="0.5" />
          <text x="0" y="-9" textAnchor="middle" fill="#ef4444" fontSize="12" fontWeight="bold">N</text>
        </g>

        {/* 10. Architectural Dynamic Scale Bar (Bottom Left of sheet) */}
        {unit === 'metric' ? (
          <g transform={`translate(45, ${baseHeight - 50})`} className="pointer-events-none">
            <rect x="-12" y="-22" width="224" height="48" fill={colors.bg} stroke={colors.gridMinor} strokeWidth="1" rx="6" opacity="0.95" />
            <rect x="0" y="0" width="50" height="7" fill={colors.dimensionLine} stroke={colors.dimensionLine} strokeWidth="1" />
            <rect x="50" y="0" width="50" height="7" fill={colors.bg} stroke={colors.dimensionLine} strokeWidth="1" />
            <rect x="100" y="0" width="100" height="7" fill={colors.dimensionLine} stroke={colors.dimensionLine} strokeWidth="1" />

            {[10, 20, 30, 40, 60, 70, 80, 90].map((tx) => (
              <line key={tx} x1={tx} y1="-3" x2={tx} y2="0" stroke={colors.dimensionLine} strokeWidth="0.8" />
            ))}

            <line x1="0" y1="-6" x2="0" y2="7" stroke={colors.dimensionLine} strokeWidth="1.5" />
            <line x1="50" y1="-5" x2="50" y2="7" stroke={colors.dimensionLine} strokeWidth="1.2" />
            <line x1="100" y1="-6" x2="100" y2="7" stroke={colors.dimensionLine} strokeWidth="1.5" />
            <line x1="200" y1="-6" x2="200" y2="7" stroke={colors.dimensionLine} strokeWidth="1.5" />

            <text x="0" y="20" textAnchor="middle" fill={colors.dimensionText} fontSize="11" fontFamily="system-ui, monospace" fontWeight="600">0</text>
            <text x="50" y="20" textAnchor="middle" fill={colors.dimensionText} fontSize="11" fontFamily="system-ui, monospace" fontWeight="600">0.5m</text>
            <text x="100" y="20" textAnchor="middle" fill={colors.dimensionText} fontSize="11" fontFamily="system-ui, monospace" fontWeight="600">1.0m</text>
            <text x="200" y="20" textAnchor="middle" fill={colors.dimensionText} fontSize="11" fontFamily="system-ui, monospace" fontWeight="600">2.0m</text>

            <text x="100" y="-10" textAnchor="middle" fill={colors.innerLine} fontSize="11" fontWeight="bold" letterSpacing="0.05em">
              SCALE 1:50 · 1m = 100 UNITS
            </text>
          </g>
        ) : (
          <g transform={`translate(45, ${baseHeight - 50})`} className="pointer-events-none">
            <rect x="-12" y="-22" width="208" height="48" fill={colors.bg} stroke={colors.gridMinor} strokeWidth="1" rx="6" opacity="0.95" />
            <rect x="0" y="0" width="30.48" height="7" fill={colors.dimensionLine} stroke={colors.dimensionLine} strokeWidth="1" />
            <rect x="30.48" y="0" width="30.48" height="7" fill={colors.bg} stroke={colors.dimensionLine} strokeWidth="1" />
            <rect x="60.96" y="0" width="60.96" height="7" fill={colors.dimensionLine} stroke={colors.dimensionLine} strokeWidth="1" />
            <rect x="121.92" y="0" width="60.96" height="7" fill={colors.bg} stroke={colors.dimensionLine} strokeWidth="1" />

            {[7.62, 15.24, 22.86, 38.1, 45.72, 53.34].map((tx) => (
              <line key={tx} x1={tx} y1="-3" x2={tx} y2="0" stroke={colors.dimensionLine} strokeWidth="0.8" />
            ))}

            <line x1="0" y1="-6" x2="0" y2="7" stroke={colors.dimensionLine} strokeWidth="1.5" />
            <line x1="30.48" y1="-5" x2="30.48" y2="7" stroke={colors.dimensionLine} strokeWidth="1.2" />
            <line x1="60.96" y1="-6" x2="60.96" y2="7" stroke={colors.dimensionLine} strokeWidth="1.5" />
            <line x1="121.92" y1="-6" x2="121.92" y2="7" stroke={colors.dimensionLine} strokeWidth="1.5" />
            <line x1="182.88" y1="-6" x2="182.88" y2="7" stroke={colors.dimensionLine} strokeWidth="1.5" />

            <text x="0" y="20" textAnchor="middle" fill={colors.dimensionText} fontSize="11" fontFamily="system-ui, monospace" fontWeight="600">0</text>
            <text x="30.48" y="20" textAnchor="middle" fill={colors.dimensionText} fontSize="11" fontFamily="system-ui, monospace" fontWeight="600">1'</text>
            <text x="60.96" y="20" textAnchor="middle" fill={colors.dimensionText} fontSize="11" fontFamily="system-ui, monospace" fontWeight="600">2'</text>
            <text x="121.92" y="20" textAnchor="middle" fill={colors.dimensionText} fontSize="11" fontFamily="system-ui, monospace" fontWeight="600">4'</text>
            <text x="182.88" y="20" textAnchor="middle" fill={colors.dimensionText} fontSize="11" fontFamily="system-ui, monospace" fontWeight="600">6'</text>

            <text x="91.44" y="-10" textAnchor="middle" fill={colors.innerLine} fontSize="11" fontWeight="bold" letterSpacing="0.05em">
              SCALE 1/4" = 1'-0" · 1' = 30.5 UNITS
            </text>
          </g>
        )}

        {/* 11. Magnetic Alignment Guide Lines */}
        {alignmentGuides.x !== null && (
          <g className="pointer-events-none">
            <line
              x1={toScreenX(alignmentGuides.x)}
              y1={0}
              x2={toScreenX(alignmentGuides.x)}
              y2={baseHeight}
              stroke="#06b6d4"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
            <rect
              x={toScreenX(alignmentGuides.x) - 40}
              y={10}
              width="80"
              height="20"
              rx="4"
              fill="#0891b2"
            />
            <text
              x={toScreenX(alignmentGuides.x)}
              y={24}
              textAnchor="middle"
              fill="#ffffff"
              fontSize="10"
              fontFamily="system-ui, sans-serif"
              fontWeight="bold"
            >
              SNAP ALIGN
            </text>
          </g>
        )}

        {alignmentGuides.y !== null && (
          <g className="pointer-events-none">
            <line
              x1={0}
              y1={toScreenY(alignmentGuides.y)}
              x2={baseWidth}
              y2={toScreenY(alignmentGuides.y)}
              stroke="#06b6d4"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
            <rect
              x={10}
              y={toScreenY(alignmentGuides.y) - 10}
              width="80"
              height="20"
              rx="4"
              fill="#0891b2"
            />
            <text
              x={50}
              y={toScreenY(alignmentGuides.y) + 4}
              textAnchor="middle"
              fill="#ffffff"
              fontSize="10"
              fontFamily="system-ui, sans-serif"
              fontWeight="bold"
            >
              SNAP ALIGN
            </text>
          </g>
        )}

        {/* 12. Selected Room Resize Handles */}
        {allRooms
          .filter((rm) => rm.id === activeRoomId)
          .map((rm) => {
            const rx = rm.x || 0;
            const ry = rm.y || 0;
            const rw = rm.breadth;
            const rh = rm.length;

            return (
              <g key={`resize-handles-${rm.id}`}>
                {/* East wall handle */}
                <g
                  data-drag="resize"
                  className="cursor-ew-resize group"
                  onPointerDown={(e) => handleResizeStart(e, rm, 'right')}
                >
                  <rect
                    x={toScreenX(rx + rw) - 5}
                    y={toScreenY(ry + rh / 2) - 18}
                    width="10"
                    height="36"
                    rx="5"
                    fill="#2563eb"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))' }}
                  />
                  <line
                    x1={toScreenX(rx + rw)}
                    y1={toScreenY(ry + rh / 2) - 8}
                    x2={toScreenX(rx + rw)}
                    y2={toScreenY(ry + rh / 2) + 8}
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                </g>

                {/* South wall handle */}
                <g
                  data-drag="resize"
                  className="cursor-ns-resize group"
                  onPointerDown={(e) => handleResizeStart(e, rm, 'bottom')}
                >
                  <rect
                    x={toScreenX(rx + rw / 2) - 18}
                    y={toScreenY(ry + rh) - 5}
                    width="36"
                    height="10"
                    rx="5"
                    fill="#2563eb"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))' }}
                  />
                  <line
                    x1={toScreenX(rx + rw / 2) - 8}
                    y1={toScreenY(ry + rh)}
                    x2={toScreenX(rx + rw / 2) + 8}
                    y2={toScreenY(ry + rh)}
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                </g>

                {/* South-East corner handle */}
                <g
                  data-drag="resize"
                  className="cursor-nwse-resize group"
                  onPointerDown={(e) => handleResizeStart(e, rm, 'corner')}
                >
                  <rect
                    x={toScreenX(rx + rw) - 7}
                    y={toScreenY(ry + rh) - 7}
                    width="14"
                    height="14"
                    rx="3"
                    fill="#2563eb"
                    stroke="#ffffff"
                    strokeWidth="2"
                    style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}
                  />
                </g>
              </g>
            );
          })}

        {/* 13. Active Dragging Room Badge */}
        {draggingRoomInfo && (
          <g className="pointer-events-none">
            {(() => {
              const draggedRoom = allRooms.find((r) => r.id === draggingRoomInfo.roomId);
              if (!draggedRoom) return null;
              const rx = draggedRoom.x || 0;
              const ry = draggedRoom.y || 0;
              const rw = draggedRoom.breadth;
              return (
                <g transform={`translate(${toScreenX(rx + rw / 2)}, ${toScreenY(ry) - 28})`}>
                  <rect
                    x="-85"
                    y="-14"
                    width="170"
                    height="28"
                    rx="7"
                    fill="#0f172a"
                    stroke="#38bdf8"
                    strokeWidth="2"
                    style={{ filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.35))' }}
                  />
                  <text
                    x="0"
                    y="4"
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="12"
                    fontFamily="system-ui, sans-serif"
                    fontWeight="bold"
                  >
                    ✢ {draggedRoom.name} · X: {rx.toFixed(2)}m, Y: {ry.toFixed(2)}m
                  </text>
                </g>
              );
            })()}
          </g>
        )}

        {/* 14. Active Dragging Opening Badge */}
        {draggingOpeningInfo && (
          <g className="pointer-events-none">
            {(() => {
              const pRoom = allRooms.find((r) => r.id === draggingOpeningInfo.roomId);
              const op = pRoom?.openings.find((o) => o.id === draggingOpeningInfo.openingId);
              if (!pRoom || !op) return null;
              const rx = pRoom.x || 0;
              const ry = pRoom.y || 0;
              const cutCenter = op.wall === 'N' || op.wall === 'S'
                ? { x: toScreenX(rx + op.position + op.width / 2), y: toScreenY(ry + (op.wall === 'N' ? -0.4 : pRoom.length + 0.4)) }
                : { x: toScreenX(rx + (op.wall === 'W' ? -0.4 : pRoom.breadth + 0.4)), y: toScreenY(ry + op.position + op.width / 2) };
              return (
                <g transform={`translate(${cutCenter.x}, ${cutCenter.y})`}>
                  <rect
                    x="-75"
                    y="-14"
                    width="150"
                    height="28"
                    rx="7"
                    fill="#0f172a"
                    stroke="#38bdf8"
                    strokeWidth="2"
                    style={{ filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.35))' }}
                  />
                  <text
                    x="0"
                    y="4"
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="11.5"
                    fontFamily="system-ui, sans-serif"
                    fontWeight="bold"
                  >
                    ✢ {op.type.toUpperCase()} · {formatDistance(op.position, unit)}
                  </text>
                </g>
              );
            })()}
          </g>
        )}
      </svg>

      {/* Floating Quick Action Overlay when an Opening is Selected */}
      {selectedOpening && onUpdateOpening && onDeleteOpening && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/95 text-slate-900 backdrop-blur-md px-5 py-2.5 rounded-2xl shadow-xl border border-slate-300 flex items-center gap-3 z-30 animate-fade-in text-sm">
          <span className="font-bold text-blue-600 capitalize text-sm">
            {selectedOpening.type} ({selectedOpening.wall} Wall)
          </span>

          {selectedOpening.type === 'door' && (
            <>
              <button
                type="button"
                onClick={() =>
                  onUpdateOpening({
                    ...selectedOpening,
                    flipHinge: !selectedOpening.flipHinge,
                  })
                }
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition border border-slate-300 text-xs font-semibold"
                title="Flip Hinge Side (Left/Right)"
              >
                <FlipHorizontal size={14} />
                Flip Hinge
              </button>

              <button
                type="button"
                onClick={() =>
                  onUpdateOpening({
                    ...selectedOpening,
                    flipSwing: !selectedOpening.flipSwing,
                  })
                }
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition border border-slate-300 text-xs font-semibold"
                title="Flip Swing Direction (Inward/Outward)"
              >
                <FlipVertical size={14} />
                Flip Swing
              </button>
            </>
          )}

          <div className="h-4 w-px bg-slate-300 mx-1" />

          <button
            type="button"
            onClick={() => onDeleteOpening(selectedOpening.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition text-xs font-semibold"
            title="Delete this opening"
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      )}
    </div>
  );
};

export default FloorPlan;
