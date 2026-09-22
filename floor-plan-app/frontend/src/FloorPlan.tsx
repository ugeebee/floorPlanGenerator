import React, { useRef, useState, useMemo, useCallback } from 'react';
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

export type RoomConfig = {
  length: number;       // Y-axis (North-South) in meters
  breadth: number;      // X-axis (East-West) in meters
  wallThickness?: number; // Wall thickness in meters (default 0.2m)
  name?: string;
  openings: Opening[];
};

export type FloorPlanTheme = 'blueprint' | 'cad-light' | 'dark-studio';
export type UnitSystem = 'metric' | 'imperial';

interface FloorPlanProps {
  room: RoomConfig;
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

const FloorPlan: React.FC<FloorPlanProps> = ({
  room,
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
  const [draggingOpeningId, setDraggingOpeningId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<number>(0);

  const colors = THEME_CONFIGS[theme] || THEME_CONFIGS.blueprint;
  const wallT = room.wallThickness || 0.2; // Wall thickness in meters
  const breadth = Math.max(1, room.breadth || 5);
  const length = Math.max(1, room.length || 5);

  // Drawing Sheet Margins: 2.0 meters (200 units) on all sides
  // 200 is an exact integer multiple of 100 (major), 50 (medium), and 10 (minor)
  const marginMeters = 2.0;
  const marginPx = marginMeters * BASE_PPM; // Exactly 200 SVG units

  // North-West interior corner (0,0) of the room in SVG world coordinates
  const originX = marginPx; // 200
  const originY = marginPx; // 200

  // Total base sheet dimensions
  const baseWidth = breadth * BASE_PPM + marginPx * 2;
  const baseHeight = length * BASE_PPM + marginPx * 2;

  // ViewBox Camera Mathematics (Mathematically accurate zoom & pan)
  const currentZoom = Math.max(0.2, zoom || 1);
  const viewWidth = baseWidth / currentZoom;
  const viewHeight = baseHeight / currentZoom;
  const centerX = baseWidth / 2;
  const centerY = baseHeight / 2;
  const viewBoxX = centerX - viewWidth / 2 - (panOffset?.x || 0);
  const viewBoxY = centerY - viewHeight / 2 - (panOffset?.y || 0);
  const viewBox = `${viewBoxX} ${viewBoxY} ${viewWidth} ${viewHeight}`;

  // Convert room metric coordinates (x: 0..breadth, y: 0..length) to canvas SVG coordinates
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
  }, [originX]);

  // Wall length helper
  const getWallLength = useCallback((wall: WallSide) => {
    return wall === 'N' || wall === 'S' ? breadth : length;
  }, [breadth, length]);

  // Sort and group openings by wall
  const openingsByWall = useMemo(() => {
    const grouped: Record<WallSide, Opening[]> = { N: [], S: [], E: [], W: [] };
    room.openings.forEach((op) => {
      if (grouped[op.wall]) {
        grouped[op.wall].push(op);
      }
    });
    // Sort ascending by position
    Object.keys(grouped).forEach((key) => {
      grouped[key as WallSide].sort((a, b) => a.position - b.position);
    });
    return grouped;
  }, [room.openings]);

  // Calculate solid wall segments for each wall (cutting out door/window openings)
  const wallSegments = useMemo(() => {
    const segments: Record<WallSide, Array<{ start: number; end: number }>> = {
      N: [],
      S: [],
      E: [],
      W: [],
    };

    (['N', 'S', 'E', 'W'] as WallSide[]).forEach((wall) => {
      const maxLen = getWallLength(wall);
      const ops = openingsByWall[wall];
      let current = 0;

      ops.forEach((op) => {
        const opStart = Math.max(0, Math.min(maxLen, op.position));
        const opEnd = Math.max(0, Math.min(maxLen, op.position + op.width));

        if (opStart > current) {
          segments[wall].push({ start: current, end: opStart });
        }
        current = Math.max(current, opEnd);
      });

      if (current < maxLen) {
        segments[wall].push({ start: current, end: maxLen });
      }
    });

    return segments;
  }, [getWallLength, openingsByWall]);

  // Pointer move handler (drag, pan, millimeter-accurate cursor tracking)
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

    // Handle dragging an opening along its wall with precision snapping
    if (draggingOpeningId && onUpdateOpening) {
      const activeOp = room.openings.find((o) => o.id === draggingOpeningId);
      if (!activeOp) return;

      const wallLen = getWallLength(activeOp.wall);
      let newPos = activeOp.position;

      if (activeOp.wall === 'N' || activeOp.wall === 'S') {
        newPos = coords.x - dragOffset;
      } else {
        newPos = coords.y - dragOffset;
      }

      // Snap to increments: 0.05m in metric, 0.0254m (1 inch) in imperial
      if (unit === 'imperial') {
        newPos = Math.round(newPos / 0.0254) * 0.0254;
      } else {
        newPos = Math.round(newPos * 20) / 20; // 0.05m
      }

      // Clamp so opening remains strictly within the wall bounds
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
    if (e.button === 0 && !draggingOpeningId) {
      const target = e.target as SVGElement;
      if (target.dataset.drag !== 'opening') {
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
    setDraggingOpeningId(null);
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
  const handleOpeningDragStart = (e: React.PointerEvent, op: Opening) => {
    e.stopPropagation();
    setDraggingOpeningId(op.id);
    if (onSelectOpening) {
      onSelectOpening(op.id);
    }
    const coords = toRoomCoords(e.clientX, e.clientY);
    const offset = (op.wall === 'N' || op.wall === 'S') ? (coords.x - op.position) : (coords.y - op.position);
    setDragOffset(offset);
  };

  // Selected opening object
  const selectedOpening = useMemo(() => {
    return room.openings.find((o) => o.id === selectedOpeningId) || null;
  }, [room.openings, selectedOpeningId]);

  return (
    <div className="relative w-full h-full flex items-center justify-center select-none overflow-hidden bg-white">
      <svg
        ref={svgRef}
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
          x={viewBoxX - 5000}
          y={viewBoxY - 5000}
          width={viewWidth + 10000}
          height={viewHeight + 10000}
          fill={colors.bg}
        />

        {/* 2. Subdivided Architectural Grid (Exactly 10 subdivisions per major unit) */}
        {showGrid && (
          <rect
            x={viewBoxX - 5000}
            y={viewBoxY - 5000}
            width={viewWidth + 10000}
            height={viewHeight + 10000}
            fill={`url(#${unit === 'imperial' ? `grid-imperial-10-${theme}` : `grid-metric-10-${theme}`})`}
          />
        )}

        {/* 3. Room Interior Floor */}
        <rect
          x={toScreenX(0)}
          y={toScreenY(0)}
          width={breadth * BASE_PPM}
          height={length * BASE_PPM}
          fill={colors.roomFill}
          stroke={colors.innerLine}
          strokeWidth="1.5"
        />

        {/* 4. Solid Wall Segments with Thickness */}
        {/* North Wall Segments */}
        {wallSegments.N.map((seg, i) => (
          <g key={`wall-n-${i}`}>
            <rect
              x={toScreenX(seg.start)}
              y={toScreenY(-wallT)}
              width={(seg.end - seg.start) * BASE_PPM}
              height={wallT * BASE_PPM}
              fill={colors.wallFill}
              stroke={colors.wallStroke}
              strokeWidth="1.5"
            />
            <rect
              x={toScreenX(seg.start)}
              y={toScreenY(-wallT)}
              width={(seg.end - seg.start) * BASE_PPM}
              height={wallT * BASE_PPM}
              fill={`url(#wall-hatch-${theme})`}
            />
          </g>
        ))}

        {/* South Wall Segments */}
        {wallSegments.S.map((seg, i) => (
          <g key={`wall-s-${i}`}>
            <rect
              x={toScreenX(seg.start)}
              y={toScreenY(length)}
              width={(seg.end - seg.start) * BASE_PPM}
              height={wallT * BASE_PPM}
              fill={colors.wallFill}
              stroke={colors.wallStroke}
              strokeWidth="1.5"
            />
            <rect
              x={toScreenX(seg.start)}
              y={toScreenY(length)}
              width={(seg.end - seg.start) * BASE_PPM}
              height={wallT * BASE_PPM}
              fill={`url(#wall-hatch-${theme})`}
            />
          </g>
        ))}

        {/* West Wall Segments */}
        {wallSegments.W.map((seg, i) => (
          <g key={`wall-w-${i}`}>
            <rect
              x={toScreenX(-wallT)}
              y={toScreenY(seg.start)}
              width={wallT * BASE_PPM}
              height={(seg.end - seg.start) * BASE_PPM}
              fill={colors.wallFill}
              stroke={colors.wallStroke}
              strokeWidth="1.5"
            />
            <rect
              x={toScreenX(-wallT)}
              y={toScreenY(seg.start)}
              width={wallT * BASE_PPM}
              height={(seg.end - seg.start) * BASE_PPM}
              fill={`url(#wall-hatch-${theme})`}
            />
          </g>
        ))}

        {/* East Wall Segments */}
        {wallSegments.E.map((seg, i) => (
          <g key={`wall-e-${i}`}>
            <rect
              x={toScreenX(breadth)}
              y={toScreenY(seg.start)}
              width={wallT * BASE_PPM}
              height={(seg.end - seg.start) * BASE_PPM}
              fill={colors.wallFill}
              stroke={colors.wallStroke}
              strokeWidth="1.5"
            />
            <rect
              x={toScreenX(breadth)}
              y={toScreenY(seg.start)}
              width={wallT * BASE_PPM}
              height={(seg.end - seg.start) * BASE_PPM}
              fill={`url(#wall-hatch-${theme})`}
            />
          </g>
        ))}

        {/* 5. Solid Wall Corner Blocks (Mitered Joins) */}
        {/* Top-Left Corner (-wallT, -wallT) */}
        <rect
          x={toScreenX(-wallT)}
          y={toScreenY(-wallT)}
          width={wallT * BASE_PPM}
          height={wallT * BASE_PPM}
          fill={colors.wallFill}
          stroke={colors.wallStroke}
          strokeWidth="1.5"
        />
        {/* Top-Right Corner (breadth, -wallT) */}
        <rect
          x={toScreenX(breadth)}
          y={toScreenY(-wallT)}
          width={wallT * BASE_PPM}
          height={wallT * BASE_PPM}
          fill={colors.wallFill}
          stroke={colors.wallStroke}
          strokeWidth="1.5"
        />
        {/* Bottom-Left Corner (-wallT, length) */}
        <rect
          x={toScreenX(-wallT)}
          y={toScreenY(length)}
          width={wallT * BASE_PPM}
          height={wallT * BASE_PPM}
          fill={colors.wallFill}
          stroke={colors.wallStroke}
          strokeWidth="1.5"
        />
        {/* Bottom-Right Corner (breadth, length) */}
        <rect
          x={toScreenX(breadth)}
          y={toScreenY(length)}
          width={wallT * BASE_PPM}
          height={wallT * BASE_PPM}
          fill={colors.wallFill}
          stroke={colors.wallStroke}
          strokeWidth="1.5"
        />

        {/* ================================================================= */}
        {/* 6. CAD ORIGIN DATUM MARKER - SNAPPED TO CORNER OF GRID SQUARE     */}
        {/* At Room Corner (0,0), aligned directly with major grid axes       */}
        {/* ================================================================= */}
        <g transform={`translate(${originX}, ${originY})`} className="pointer-events-none">
          {/* Crosshair extending along grid axes */}
          <line x1="-30" y1="0" x2="30" y2="0" stroke="#ef4444" strokeWidth="1.2" strokeDasharray="4 2" opacity="0.85" />
          <line x1="0" y1="-30" x2="0" y2="30" stroke="#ef4444" strokeWidth="1.2" strokeDasharray="4 2" opacity="0.85" />

          {/* Surveyor / CAD Datum Target Circle */}
          <circle cx="0" cy="0" r="10" fill="none" stroke="#ef4444" strokeWidth="1.5" />
          {/* Diagonal quadrant fills */}
          <path d="M 0 0 L 10 0 A 10 10 0 0 0 0 -10 Z" fill="#ef4444" opacity="0.65" />
          <path d="M 0 0 L -10 0 A 10 10 0 0 0 0 10 Z" fill="#ef4444" opacity="0.65" />
          <circle cx="0" cy="0" r="2.5" fill="#ffffff" />

          {/* Snapped Corner Indicator Badge */}
          <g transform="translate(-76, -28)">
            <rect width="72" height="22" rx="4" fill="#ffffff" stroke="#ef4444" strokeWidth="1.2" filter="drop-shadow(0 1px 3px rgba(0,0,0,0.15))" />
            <text x="36" y="15" textAnchor="middle" fill="#ef4444" fontSize="11" fontFamily="system-ui, monospace" fontWeight="bold">
              (0, 0) SNAP
            </text>
          </g>
        </g>

        {/* 7. Openings (Doors & Windows) */}
        {room.openings.map((op, idx) => {
          const isSelected = op.id === selectedOpeningId;
          const isDoor = op.type === 'door';
          const pos = op.position;
          const w = op.width;
          const label = isDoor ? `D${idx + 1}` : `W${idx + 1}`;

          // Calculate Opening Screen Bounds & Geometry in SVG Units
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
            cutX = toScreenX(pos);
            cutY = toScreenY(-wallT);
            cutW = w * BASE_PPM;
            cutH = wallT * BASE_PPM;

            const swingDirY = flipSwing ? -1 : 1;
            const hingeAtLeft = !flipHinge;
            doorHingeX = hingeAtLeft ? toScreenX(pos) : toScreenX(pos + w);
            doorHingeY = toScreenY(0);

            const leafTargetX = doorHingeX;
            const leafTargetY = doorHingeY + swingDirY * (w * BASE_PPM);
            doorLeafEndX = leafTargetX;
            doorLeafEndY = leafTargetY;

            const closedX = hingeAtLeft ? toScreenX(pos + w) : toScreenX(pos);
            const closedY = doorHingeY;
            const sweepFlag = (hingeAtLeft ? !flipSwing : flipSwing) ? 1 : 0;
            arcPath = `M ${closedX} ${closedY} A ${w * BASE_PPM} ${w * BASE_PPM} 0 0 ${sweepFlag} ${doorLeafEndX} ${doorLeafEndY}`;
          } else if (op.wall === 'S') {
            cutX = toScreenX(pos);
            cutY = toScreenY(length);
            cutW = w * BASE_PPM;
            cutH = wallT * BASE_PPM;

            const swingDirY = flipSwing ? 1 : -1;
            const hingeAtLeft = !flipHinge;
            doorHingeX = hingeAtLeft ? toScreenX(pos) : toScreenX(pos + w);
            doorHingeY = toScreenY(length);

            doorLeafEndX = doorHingeX;
            doorLeafEndY = doorHingeY + swingDirY * (w * BASE_PPM);

            const closedX = hingeAtLeft ? toScreenX(pos + w) : toScreenX(pos);
            const closedY = doorHingeY;
            const sweepFlag = (hingeAtLeft ? flipSwing : !flipSwing) ? 1 : 0;
            arcPath = `M ${closedX} ${closedY} A ${w * BASE_PPM} ${w * BASE_PPM} 0 0 ${sweepFlag} ${doorLeafEndX} ${doorLeafEndY}`;
          } else if (op.wall === 'W') {
            cutX = toScreenX(-wallT);
            cutY = toScreenY(pos);
            cutW = wallT * BASE_PPM;
            cutH = w * BASE_PPM;

            const swingDirX = flipSwing ? -1 : 1;
            const hingeAtTop = !flipHinge;
            doorHingeX = toScreenX(0);
            doorHingeY = hingeAtTop ? toScreenY(pos) : toScreenY(pos + w);

            doorLeafEndX = doorHingeX + swingDirX * (w * BASE_PPM);
            doorLeafEndY = doorHingeY;

            const closedX = doorHingeX;
            const closedY = hingeAtTop ? toScreenY(pos + w) : toScreenY(pos);
            const sweepFlag = (hingeAtTop ? flipSwing : !flipSwing) ? 1 : 0;
            arcPath = `M ${closedX} ${closedY} A ${w * BASE_PPM} ${w * BASE_PPM} 0 0 ${sweepFlag} ${doorLeafEndX} ${doorLeafEndY}`;
          } else if (op.wall === 'E') {
            cutX = toScreenX(breadth);
            cutY = toScreenY(pos);
            cutW = wallT * BASE_PPM;
            cutH = w * BASE_PPM;

            const swingDirX = flipSwing ? 1 : -1;
            const hingeAtTop = !flipHinge;
            doorHingeX = toScreenX(breadth);
            doorHingeY = hingeAtTop ? toScreenY(pos) : toScreenY(pos + w);

            doorLeafEndX = doorHingeX + swingDirX * (w * BASE_PPM);
            doorLeafEndY = doorHingeY;

            const closedX = doorHingeX;
            const closedY = hingeAtTop ? toScreenY(pos + w) : toScreenY(pos);
            const sweepFlag = (hingeAtTop ? !flipSwing : flipSwing) ? 1 : 0;
            arcPath = `M ${closedX} ${closedY} A ${w * BASE_PPM} ${w * BASE_PPM} 0 0 ${sweepFlag} ${doorLeafEndX} ${doorLeafEndY}`;
          }

          return (
            <g
              key={op.id}
              data-drag="opening"
              className="cursor-move group"
              onPointerDown={(e) => handleOpeningDragStart(e, op)}
              onClick={(e) => {
                e.stopPropagation();
                if (onSelectOpening) onSelectOpening(op.id);
              }}
            >
              {/* Wall opening cutout */}
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

              {/* End Jamb Lines */}
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

              {/* Architectural Door Representation */}
              {isDoor && (
                <g>
                  {/* Dashed Swing Arc */}
                  <path
                    d={arcPath}
                    fill="none"
                    stroke={isSelected ? colors.selectedGlow : colors.doorArc}
                    strokeWidth="1.8"
                    strokeDasharray="4 3"
                  />
                  {/* Open Door Leaf Line */}
                  <line
                    x1={doorHingeX}
                    y1={doorHingeY}
                    x2={doorLeafEndX}
                    y2={doorLeafEndY}
                    stroke={isSelected ? colors.selectedGlow : colors.doorLeaf}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                  {/* Hinge Pin Circle */}
                  <circle
                    cx={doorHingeX}
                    cy={doorHingeY}
                    r="4"
                    fill={isSelected ? colors.selectedGlow : colors.doorLeaf}
                  />
                </g>
              )}

              {/* Architectural Window Representation */}
              {!isDoor && (
                <g>
                  {/* Outer Window Sill */}
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

              {/* Architectural Tag Badge */}
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
                  filter="drop-shadow(0 2px 4px rgba(0,0,0,0.15))"
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
        })}

        {/* 8. Architectural CAD Dimension Strings & Tick Marks */}
        {showDimensions && (
          <g className="pointer-events-none">
            {/* North Dimension String (Overall Breadth) */}
            <g>
              {(() => {
                const dimY = toScreenY(-wallT - 0.75);
                const x1 = toScreenX(0);
                const x2 = toScreenX(breadth);
                return (
                  <>
                    <line x1={x1} y1={toScreenY(-wallT)} x2={x1} y2={dimY - 8} stroke={colors.dimensionLine} strokeWidth="1" strokeDasharray="3 2" />
                    <line x1={x2} y1={toScreenY(-wallT)} x2={x2} y2={dimY - 8} stroke={colors.dimensionLine} strokeWidth="1" strokeDasharray="3 2" />
                    <line x1={x1} y1={dimY} x2={x2} y2={dimY} stroke={colors.dimensionLine} strokeWidth="1.5" />
                    <line x1={x1 - 6} y1={dimY + 6} x2={x1 + 6} y2={dimY - 6} stroke={colors.dimensionLine} strokeWidth="2.2" />
                    <line x1={x2 - 6} y1={dimY + 6} x2={x2 + 6} y2={dimY - 6} stroke={colors.dimensionLine} strokeWidth="2.2" />
                    <rect x={(x1 + x2) / 2 - 45} y={dimY - 16} width="90" height="20" fill={colors.bg} rx="3" />
                    <text
                      x={(x1 + x2) / 2}
                      y={dimY - 2}
                      textAnchor="middle"
                      fill={colors.dimensionText}
                      fontSize="14"
                      fontFamily="system-ui, monospace"
                      fontWeight="bold"
                    >
                      {formatDistance(breadth, unit)}
                    </text>
                  </>
                );
              })()}
            </g>

            {/* West Dimension String (Overall Length) */}
            <g>
              {(() => {
                const dimX = toScreenX(-wallT - 0.75);
                const y1 = toScreenY(0);
                const y2 = toScreenY(length);
                return (
                  <>
                    <line x1={toScreenX(-wallT)} y1={y1} x2={dimX - 8} y2={y1} stroke={colors.dimensionLine} strokeWidth="1" strokeDasharray="3 2" />
                    <line x1={toScreenX(-wallT)} y1={y2} x2={dimX - 8} y2={y2} stroke={colors.dimensionLine} strokeWidth="1" strokeDasharray="3 2" />
                    <line x1={dimX} y1={y1} x2={dimX} y2={y2} stroke={colors.dimensionLine} strokeWidth="1.5" />
                    <line x1={dimX - 6} y1={y1 + 6} x2={dimX + 6} y2={y1 - 6} stroke={colors.dimensionLine} strokeWidth="2.2" />
                    <line x1={dimX - 6} y1={y2 + 6} x2={dimX + 6} y2={y2 - 6} stroke={colors.dimensionLine} strokeWidth="2.2" />
                    <g transform={`translate(${dimX - 12}, ${(y1 + y2) / 2}) rotate(-90)`}>
                      <rect x="-45" y="-14" width="90" height="20" fill={colors.bg} rx="3" />
                      <text
                        x="0"
                        y="0"
                        textAnchor="middle"
                        fill={colors.dimensionText}
                        fontSize="14"
                        fontFamily="system-ui, monospace"
                        fontWeight="bold"
                      >
                        {formatDistance(length, unit)}
                      </text>
                    </g>
                  </>
                );
              })()}
            </g>

            {/* Sub-Dimension Strings for South Wall Openings */}
            {openingsByWall.S.length > 0 && (
              <g>
                {(() => {
                  const dimY = toScreenY(length + wallT + 0.65);
                  const ops = openingsByWall.S;
                  const pts = [0];
                  ops.forEach((o) => {
                    pts.push(o.position);
                    pts.push(o.position + o.width);
                  });
                  pts.push(breadth);
                  pts.sort((a, b) => a - b);

                  const segments: Array<{ s: number; e: number }> = [];
                  for (let i = 0; i < pts.length - 1; i++) {
                    if (pts[i + 1] - pts[i] > 0.01) {
                      segments.push({ s: pts[i], e: pts[i + 1] });
                    }
                  }

                  return segments.map((seg, idx) => {
                    const sx1 = toScreenX(seg.s);
                    const sx2 = toScreenX(seg.e);
                    const segLen = seg.e - seg.s;
                    return (
                      <g key={`s-dim-${idx}`}>
                        <line x1={sx1} y1={dimY} x2={sx2} y2={dimY} stroke={colors.dimensionLine} strokeWidth="1.2" />
                        <line x1={sx1 - 4} y1={dimY + 4} x2={sx1 + 4} y2={dimY - 4} stroke={colors.dimensionLine} strokeWidth="1.8" />
                        <line x1={sx2 - 4} y1={dimY + 4} x2={sx2 + 4} y2={dimY - 4} stroke={colors.dimensionLine} strokeWidth="1.8" />
                        {segLen >= 0.4 && (
                          <text
                            x={(sx1 + sx2) / 2}
                            y={dimY + 14}
                            textAnchor="middle"
                            fill={colors.dimensionText}
                            fontSize="12"
                            fontFamily="system-ui, monospace"
                            fontWeight="500"
                          >
                            {formatDistance(segLen, unit)}
                          </text>
                        )}
                      </g>
                    );
                  });
                })()}
              </g>
            )}
          </g>
        )}

        {/* 9. Room Center Architectural Title Stamp */}
        <g transform={`translate(${toScreenX(breadth / 2)}, ${toScreenY(length / 2)})`} className="pointer-events-none">
          <text
            x="0"
            y="-14"
            textAnchor="middle"
            fill={colors.dimensionText}
            fontSize="22"
            fontFamily="system-ui, sans-serif"
            fontWeight="bold"
            letterSpacing="0.05em"
          >
            {room.name || 'MAIN ROOM'}
          </text>
          <text
            x="0"
            y="12"
            textAnchor="middle"
            fill={colors.innerLine}
            fontSize="16"
            fontFamily="system-ui, monospace"
            fontWeight="600"
          >
            {unit === 'imperial'
              ? `${(breadth * length * 10.7639).toFixed(1)} sq ft  (${(breadth * length).toFixed(2)} m²)`
              : `${(breadth * length).toFixed(2)} m²  (${(breadth * length * 10.7639).toFixed(1)} sq ft)`}
          </text>
          <text
            x="0"
            y="32"
            textAnchor="middle"
            fill={colors.innerLine}
            fontSize="13"
            fontFamily="system-ui, monospace"
            opacity="0.85"
          >
            Perimeter: {formatDistance(2 * (breadth + length), unit)}
          </text>
        </g>

        {/* 10. Architectural North Compass Rose (Top Right of sheet) */}
        <g transform={`translate(${baseWidth - 65}, 65)`} className="pointer-events-none">
          <circle cx="0" cy="0" r="26" fill={colors.bg} stroke={colors.dimensionLine} strokeWidth="1.5" opacity="0.9" />
          <polygon points="0,-22 6,0 0,-5 -6,0" fill="#ef4444" />
          <polygon points="0,22 6,0 0,5 -6,0" fill={colors.dimensionLine} opacity="0.5" />
          <text x="0" y="-9" textAnchor="middle" fill="#ef4444" fontSize="12" fontWeight="bold">N</text>
        </g>

        {/* ================================================================= */}
        {/* 11. MATHEMATICALLY ACCURATE ARCHITECTURAL GRAPHIC SCALE BAR       */}
        {/* Metric: exactly 100 units = 1.0 meter (2.0m total bar)            */}
        {/* Imperial: exactly 30.48 units = 1.0 foot (6.0ft total bar)        */}
        {/* ================================================================= */}
        {unit === 'metric' ? (
          <g transform={`translate(45, ${baseHeight - 50})`} className="pointer-events-none">
            {/* Background card plate */}
            <rect x="-12" y="-22" width="224" height="48" fill={colors.bg} stroke={colors.gridMinor} strokeWidth="1" rx="6" opacity="0.95" />

            {/* Alternating graphic scale segments (0 to 0.5m, 0.5m to 1.0m, 1.0m to 2.0m) */}
            <rect x="0" y="0" width="50" height="7" fill={colors.dimensionLine} stroke={colors.dimensionLine} strokeWidth="1" />
            <rect x="50" y="0" width="50" height="7" fill={colors.bg} stroke={colors.dimensionLine} strokeWidth="1" />
            <rect x="100" y="0" width="100" height="7" fill={colors.dimensionLine} stroke={colors.dimensionLine} strokeWidth="1" />

            {/* Minor 10cm subdivision ticks */}
            {[10, 20, 30, 40, 60, 70, 80, 90].map((tx) => (
              <line key={tx} x1={tx} y1="-3" x2={tx} y2="0" stroke={colors.dimensionLine} strokeWidth="0.8" />
            ))}

            {/* Major tick lines */}
            <line x1="0" y1="-6" x2="0" y2="7" stroke={colors.dimensionLine} strokeWidth="1.5" />
            <line x1="50" y1="-5" x2="50" y2="7" stroke={colors.dimensionLine} strokeWidth="1.2" />
            <line x1="100" y1="-6" x2="100" y2="7" stroke={colors.dimensionLine} strokeWidth="1.5" />
            <line x1="200" y1="-6" x2="200" y2="7" stroke={colors.dimensionLine} strokeWidth="1.5" />

            {/* Tick labels */}
            <text x="0" y="20" textAnchor="middle" fill={colors.dimensionText} fontSize="11" fontFamily="system-ui, monospace" fontWeight="600">0</text>
            <text x="50" y="20" textAnchor="middle" fill={colors.dimensionText} fontSize="11" fontFamily="system-ui, monospace" fontWeight="600">0.5m</text>
            <text x="100" y="20" textAnchor="middle" fill={colors.dimensionText} fontSize="11" fontFamily="system-ui, monospace" fontWeight="600">1.0m</text>
            <text x="200" y="20" textAnchor="middle" fill={colors.dimensionText} fontSize="11" fontFamily="system-ui, monospace" fontWeight="600">2.0m</text>

            {/* Scale ratio title */}
            <text x="100" y="-10" textAnchor="middle" fill={colors.innerLine} fontSize="11" fontWeight="bold" letterSpacing="0.05em">
              SCALE 1:50 · 1m = 100 UNITS
            </text>
          </g>
        ) : (
          <g transform={`translate(45, ${baseHeight - 50})`} className="pointer-events-none">
            {/* Background card plate */}
            <rect x="-12" y="-22" width="208" height="48" fill={colors.bg} stroke={colors.gridMinor} strokeWidth="1" rx="6" opacity="0.95" />

            {/* Imperial alternating segments (0 to 1ft, 1 to 2ft, 2 to 4ft, 4 to 6ft) */}
            <rect x="0" y="0" width="30.48" height="7" fill={colors.dimensionLine} stroke={colors.dimensionLine} strokeWidth="1" />
            <rect x="30.48" y="0" width="30.48" height="7" fill={colors.bg} stroke={colors.dimensionLine} strokeWidth="1" />
            <rect x="60.96" y="0" width="60.96" height="7" fill={colors.dimensionLine} stroke={colors.dimensionLine} strokeWidth="1" />
            <rect x="121.92" y="0" width="60.96" height="7" fill={colors.bg} stroke={colors.dimensionLine} strokeWidth="1" />

            {/* 3-inch subdivision ticks */}
            {[7.62, 15.24, 22.86, 38.1, 45.72, 53.34].map((tx) => (
              <line key={tx} x1={tx} y1="-3" x2={tx} y2="0" stroke={colors.dimensionLine} strokeWidth="0.8" />
            ))}

            {/* Major tick lines */}
            <line x1="0" y1="-6" x2="0" y2="7" stroke={colors.dimensionLine} strokeWidth="1.5" />
            <line x1="30.48" y1="-5" x2="30.48" y2="7" stroke={colors.dimensionLine} strokeWidth="1.2" />
            <line x1="60.96" y1="-6" x2="60.96" y2="7" stroke={colors.dimensionLine} strokeWidth="1.5" />
            <line x1="121.92" y1="-6" x2="121.92" y2="7" stroke={colors.dimensionLine} strokeWidth="1.5" />
            <line x1="182.88" y1="-6" x2="182.88" y2="7" stroke={colors.dimensionLine} strokeWidth="1.5" />

            {/* Tick labels */}
            <text x="0" y="20" textAnchor="middle" fill={colors.dimensionText} fontSize="11" fontFamily="system-ui, monospace" fontWeight="600">0</text>
            <text x="30.48" y="20" textAnchor="middle" fill={colors.dimensionText} fontSize="11" fontFamily="system-ui, monospace" fontWeight="600">1'</text>
            <text x="60.96" y="20" textAnchor="middle" fill={colors.dimensionText} fontSize="11" fontFamily="system-ui, monospace" fontWeight="600">2'</text>
            <text x="121.92" y="20" textAnchor="middle" fill={colors.dimensionText} fontSize="11" fontFamily="system-ui, monospace" fontWeight="600">4'</text>
            <text x="182.88" y="20" textAnchor="middle" fill={colors.dimensionText} fontSize="11" fontFamily="system-ui, monospace" fontWeight="600">6'</text>

            {/* Scale ratio title */}
            <text x="91.44" y="-10" textAnchor="middle" fill={colors.innerLine} fontSize="11" fontWeight="bold" letterSpacing="0.05em">
              SCALE 1/4" = 1'-0" · 1' = 30.5 UNITS
            </text>
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
