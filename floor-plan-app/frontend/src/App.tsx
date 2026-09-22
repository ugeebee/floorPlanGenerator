import { useState, useEffect, useMemo } from 'react';
import FloorPlan, {
  RoomConfig,
  Opening,
  WallSide,
  FloorPlanTheme,
  UnitSystem,
  formatDistance,
  getCompassDirection,
  getCompassFullName,
  BASE_PPM,
  SHEET_MARGIN_PX,
} from './FloorPlan';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Grid,
  FileCode,
  Image as ImageIcon,
  DoorOpen,
  Square,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Ruler,
  Compass,
} from './icons';

// ============================================================================
// PRESETS & TEMPLATES
// ============================================================================

export type MultiRoomPreset = {
  name: string;
  exteriorWallThickness: number;
  interiorWallThickness: number;
  rooms: RoomConfig[];
};

export const SINGLE_ROOM_PRESETS: { name: string; breadth: number; length: number; wallThickness: number; openings: Opening[] }[] = [
  {
    name: 'Master Bedroom Suite',
    breadth: 5.5,
    length: 4.5,
    wallThickness: 0.20,
    openings: [
      { id: 'mb-d1', type: 'door', wall: 'S', position: 0.8, width: 0.9, flipHinge: false, flipSwing: false },
      { id: 'mb-w1', type: 'window', wall: 'N', position: 1.8, width: 1.8 },
      { id: 'mb-w2', type: 'window', wall: 'E', position: 1.2, width: 1.2 },
    ],
  },
  {
    name: 'Studio Living & Work',
    breadth: 6.5,
    length: 5.0,
    wallThickness: 0.20,
    openings: [
      { id: 'st-d1', type: 'door', wall: 'W', position: 0.6, width: 0.95, flipHinge: true, flipSwing: false },
      { id: 'st-w1', type: 'window', wall: 'E', position: 1.0, width: 2.2 },
      { id: 'st-w2', type: 'window', wall: 'N', position: 2.0, width: 1.6 },
    ],
  },
  {
    name: 'Modern Kitchen & Dining',
    breadth: 4.8,
    length: 3.6,
    wallThickness: 0.20,
    openings: [
      { id: 'kd-d1', type: 'door', wall: 'S', position: 0.6, width: 0.9, flipHinge: false, flipSwing: false },
      { id: 'kd-w1', type: 'window', wall: 'N', position: 1.4, width: 2.0 },
    ],
  },
  {
    name: 'Standard Bedroom',
    breadth: 4.0,
    length: 3.5,
    wallThickness: 0.20,
    openings: [
      { id: 'sb-d1', type: 'door', wall: 'S', position: 0.5, width: 0.85, flipHinge: false, flipSwing: false },
      { id: 'sb-w1', type: 'window', wall: 'N', position: 1.2, width: 1.4 },
    ],
  },
];

export const MULTI_ROOM_PRESETS: MultiRoomPreset[] = [
  {
    name: '1-BHK Urban Residence',
    exteriorWallThickness: 0.20,
    interiorWallThickness: 0.10,
    rooms: [
      {
        id: '1bhk-living',
        name: 'Living & Dining',
        type: 'living',
        x: 0.0,
        y: 0.0,
        breadth: 5.0,
        length: 4.5,
        openings: [
          { id: '1bhk-main-door', type: 'door', wall: 'W', position: 0.6, width: 1.0, flipHinge: false, flipSwing: false },
          { id: '1bhk-liv-w1', type: 'window', wall: 'N', position: 1.5, width: 2.0 },
          { id: '1bhk-liv-bed-door', type: 'door', wall: 'E', position: 1.0, width: 0.9, flipHinge: false, flipSwing: true },
        ],
      },
      {
        id: '1bhk-bed',
        name: 'Master Bedroom',
        type: 'bedroom',
        x: 5.0,
        y: 0.0,
        breadth: 4.0,
        length: 3.5,
        openings: [
          { id: '1bhk-bed-w1', type: 'window', wall: 'N', position: 1.0, width: 1.8 },
          { id: '1bhk-bed-w2', type: 'window', wall: 'E', position: 1.0, width: 1.4 },
        ],
      },
      {
        id: '1bhk-kitchen',
        name: 'Kitchen',
        type: 'kitchen',
        x: 0.0,
        y: 4.5,
        breadth: 3.0,
        length: 2.5,
        openings: [
          { id: '1bhk-k-d1', type: 'door', wall: 'N', position: 0.6, width: 0.85, flipHinge: false, flipSwing: true },
          { id: '1bhk-k-w1', type: 'window', wall: 'S', position: 0.8, width: 1.4 },
        ],
      },
      {
        id: '1bhk-bath',
        name: 'Bathroom',
        type: 'bathroom',
        x: 3.0,
        y: 4.5,
        breadth: 2.0,
        length: 2.5,
        openings: [
          { id: '1bhk-b-d1', type: 'door', wall: 'N', position: 0.5, width: 0.75, flipHinge: false, flipSwing: true },
          { id: '1bhk-b-w1', type: 'window', wall: 'S', position: 0.6, width: 0.8 },
        ],
      },
      {
        id: '1bhk-foyer',
        name: 'Balcony & Foyer',
        type: 'balcony',
        x: 5.0,
        y: 3.5,
        breadth: 4.0,
        length: 2.0,
        openings: [
          { id: '1bhk-f-w1', type: 'window', wall: 'E', position: 0.5, width: 2.5 },
        ],
      },
    ],
  },
  {
    name: '2-BHK Contemporary Apartment',
    exteriorWallThickness: 0.20,
    interiorWallThickness: 0.10,
    rooms: [
      {
        id: '2bhk-living',
        name: 'Living & Dining Room',
        type: 'living',
        x: 0.0,
        y: 0.0,
        breadth: 6.0,
        length: 4.5,
        openings: [
          { id: '2bhk-main', type: 'door', wall: 'W', position: 0.8, width: 1.0, flipHinge: false, flipSwing: false },
          { id: '2bhk-liv-w', type: 'window', wall: 'N', position: 1.5, width: 2.4 },
          { id: '2bhk-d-mb', type: 'door', wall: 'E', position: 1.0, width: 0.9, flipHinge: false, flipSwing: true },
        ],
      },
      {
        id: '2bhk-master',
        name: 'Master Suite',
        type: 'bedroom',
        x: 6.0,
        y: 0.0,
        breadth: 4.5,
        length: 4.5,
        openings: [
          { id: '2bhk-mb-w', type: 'window', wall: 'N', position: 1.2, width: 2.0 },
          { id: '2bhk-mb-e', type: 'window', wall: 'E', position: 1.5, width: 1.6 },
          { id: '2bhk-d-ensuite', type: 'door', wall: 'S', position: 2.8, width: 0.8, flipHinge: false, flipSwing: true },
        ],
      },
      {
        id: '2bhk-kitchen',
        name: 'Kitchen & Utility',
        type: 'kitchen',
        x: 0.0,
        y: 4.5,
        breadth: 3.0,
        length: 3.5,
        openings: [
          { id: '2bhk-k-d', type: 'door', wall: 'N', position: 0.8, width: 0.85, flipHinge: false, flipSwing: true },
          { id: '2bhk-k-w', type: 'window', wall: 'W', position: 1.0, width: 1.4 },
          { id: '2bhk-k-s', type: 'window', wall: 'S', position: 0.8, width: 1.4 },
        ],
      },
      {
        id: '2bhk-bath2',
        name: 'Common Restroom',
        type: 'bathroom',
        x: 3.0,
        y: 4.5,
        breadth: 1.8,
        length: 2.5,
        openings: [
          { id: '2bhk-b2-d', type: 'door', wall: 'N', position: 0.5, width: 0.75, flipHinge: false, flipSwing: true },
          { id: '2bhk-b2-w', type: 'window', wall: 'S', position: 0.5, width: 0.8 },
        ],
      },
      {
        id: '2bhk-bed2',
        name: 'Guest Bedroom',
        type: 'bedroom',
        x: 4.8,
        y: 4.5,
        breadth: 3.7,
        length: 3.5,
        openings: [
          { id: '2bhk-b2-door', type: 'door', wall: 'N', position: 0.2, width: 0.85, flipHinge: false, flipSwing: true },
          { id: '2bhk-b2-w', type: 'window', wall: 'S', position: 1.0, width: 1.8 },
        ],
      },
      {
        id: '2bhk-ensuite',
        name: 'En-Suite Bath',
        type: 'bathroom',
        x: 8.5,
        y: 4.5,
        breadth: 2.0,
        length: 2.5,
        openings: [
          { id: '2bhk-es-w', type: 'window', wall: 'S', position: 0.6, width: 0.8 },
        ],
      },
    ],
  },
  {
    name: 'Studio Apartment',
    exteriorWallThickness: 0.20,
    interiorWallThickness: 0.10,
    rooms: [
      {
        id: 'std-main',
        name: 'Studio Living & Sleeping',
        type: 'living',
        x: 0.0,
        y: 0.0,
        breadth: 6.0,
        length: 4.2,
        openings: [
          { id: 'std-entry', type: 'door', wall: 'W', position: 0.6, width: 0.95, flipHinge: false, flipSwing: false },
          { id: 'std-w1', type: 'window', wall: 'N', position: 1.5, width: 2.2 },
          { id: 'std-w2', type: 'window', wall: 'E', position: 1.2, width: 1.6 },
        ],
      },
      {
        id: 'std-kitchen',
        name: 'Kitchenette',
        type: 'kitchen',
        x: 0.0,
        y: 4.2,
        breadth: 3.5,
        length: 2.2,
        openings: [
          { id: 'std-k-w', type: 'window', wall: 'S', position: 1.0, width: 1.4 },
        ],
      },
      {
        id: 'std-bath',
        name: 'Bathroom',
        type: 'bathroom',
        x: 3.5,
        y: 4.2,
        breadth: 2.5,
        length: 2.2,
        openings: [
          { id: 'std-b-d', type: 'door', wall: 'N', position: 0.6, width: 0.75, flipHinge: false, flipSwing: true },
          { id: 'std-b-w', type: 'window', wall: 'S', position: 0.8, width: 0.8 },
        ],
      },
    ],
  },
  {
    name: 'Executive Office Suite',
    exteriorWallThickness: 0.25,
    interiorWallThickness: 0.10,
    rooms: [
      {
        id: 'off-rec',
        name: 'Reception & Lobby',
        type: 'office',
        x: 0.0,
        y: 0.0,
        breadth: 5.0,
        length: 4.0,
        openings: [
          { id: 'off-main-d', type: 'door', wall: 'W', position: 0.8, width: 1.2, flipHinge: false, flipSwing: false },
          { id: 'off-rec-w', type: 'window', wall: 'N', position: 1.5, width: 2.0 },
        ],
      },
      {
        id: 'off-conf',
        name: 'Conference Room',
        type: 'office',
        x: 5.0,
        y: 0.0,
        breadth: 5.5,
        length: 4.0,
        openings: [
          { id: 'off-conf-d', type: 'door', wall: 'W', position: 0.8, width: 0.95, flipHinge: false, flipSwing: true },
          { id: 'off-conf-w', type: 'window', wall: 'N', position: 1.5, width: 2.4 },
          { id: 'off-conf-w2', type: 'window', wall: 'E', position: 1.0, width: 1.8 },
        ],
      },
      {
        id: 'off-exec',
        name: 'Executive Cabin',
        type: 'office',
        x: 0.0,
        y: 4.0,
        breadth: 4.5,
        length: 3.5,
        openings: [
          { id: 'off-exec-d', type: 'door', wall: 'N', position: 0.6, width: 0.9, flipHinge: false, flipSwing: true },
          { id: 'off-exec-w', type: 'window', wall: 'W', position: 1.0, width: 1.8 },
        ],
      },
      {
        id: 'off-open',
        name: 'Open Workstation Floor',
        type: 'office',
        x: 4.5,
        y: 4.0,
        breadth: 6.0,
        length: 4.8,
        openings: [
          { id: 'off-work-w1', type: 'window', wall: 'E', position: 1.5, width: 2.6 },
          { id: 'off-work-w2', type: 'window', wall: 'S', position: 1.8, width: 2.4 },
        ],
      },
      {
        id: 'off-bath',
        name: 'Restroom',
        type: 'bathroom',
        x: 0.0,
        y: 7.5,
        breadth: 2.5,
        length: 2.0,
        openings: [
          { id: 'off-bath-d', type: 'door', wall: 'N', position: 0.5, width: 0.75, flipHinge: false, flipSwing: true },
        ],
      },
    ],
  },
];

// Conversions
function toFtIn(meters: number): { ft: number; in: number } {
  const totalIn = Math.round(meters / 0.0254);
  const ft = Math.floor(totalIn / 12);
  const inVal = totalIn % 12;
  return { ft, in: inVal };
}

function fromFtIn(ft: number, inVal: number): number {
  const safeFt = isNaN(ft) ? 0 : ft;
  const safeIn = isNaN(inVal) ? 0 : inVal;
  return Math.max(0.1, (safeFt * 12 + safeIn) * 0.0254);
}

function App() {
  // STUDIO MODE: 'single' vs 'multi'
  const [studioMode, setStudioMode] = useState<'single' | 'multi'>('multi');

  // Single Room State
  const [singleRoom, setSingleRoom] = useState<RoomConfig>(SINGLE_ROOM_PRESETS[0]);

  // Multi-Room State
  const [multiPresets, setMultiPresets] = useState<MultiRoomPreset[]>(MULTI_ROOM_PRESETS);
  const [activeMultiIndex, setActiveMultiIndex] = useState<number>(0);
  const [multiRooms, setMultiRooms] = useState<RoomConfig[]>(MULTI_ROOM_PRESETS[0].rooms);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(MULTI_ROOM_PRESETS[0].rooms[0].id || null);

  // Dual Wall Thickness Settings (User Requested: input for thickness of both walls)
  const [exteriorWallThickness, setExteriorWallThickness] = useState<number>(0.20); // 200 mm
  const [interiorWallThickness, setInteriorWallThickness] = useState<number>(0.10); // 100 mm

  // CAD Studio Environment Controls
  const [unit, setUnit] = useState<UnitSystem>('metric');
  const [theme, setTheme] = useState<FloorPlanTheme>('cad-light');
  const [showDimensions, setShowDimensions] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);

  // Viewport Controls
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [cursorCoords, setCursorCoords] = useState<{ x: number; y: number } | null>(null);

  // New Opening Form State
  const [newType, setNewType] = useState<'door' | 'window'>('door');
  const [newWall, setNewWall] = useState<WallSide>('N');
  const [newPos, setNewPos] = useState<number>(1.0);
  const [newWidth, setNewWidth] = useState<number>(0.9);

  // Orientation & Site Facing (0° to 360°, 0 = North Up)
  const [orientation, setOrientation] = useState<number>(0);

  // Active Sidebar Tab
  const [activeTab, setActiveTab] = useState<'rooms' | 'dimensions' | 'walls' | 'openings' | 'orientation' | 'analytics'>('rooms');

  // Export Loading States
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [isExportingSvg, setIsExportingSvg] = useState(false);

  // Backend validation state
  const [backendStatus, setBackendStatus] = useState<string>('idle');
  const [backendWarnings, setBackendWarnings] = useState<string[]>([]);

  // Fetch Multi-Room Presets from Go backend if available
  useEffect(() => {
    const fetchPresets = async () => {
      try {
        const res = await fetch('http://localhost:8080/api/multi-room-presets');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setMultiPresets(data);
            setActiveMultiIndex((currIdx) => {
              if (data[currIdx]) {
                setMultiRooms(JSON.parse(JSON.stringify(data[currIdx].rooms)));
              }
              return currIdx;
            });
          }
        }
      } catch {
        // Fallback to local MULTI_ROOM_PRESETS
      }
    };
    fetchPresets();
  }, []);

  // Validate active plan with Go backend for building code compliance & overlaps
  useEffect(() => {
    const runValidation = async () => {
      try {
        setBackendStatus('validating');
        if (studioMode === 'single') {
          const res = await fetch('http://localhost:8080/api/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(singleRoom),
          });
          if (res.ok) {
            const data = await res.json();
            setBackendWarnings(data.metrics?.warnings || []);
            setBackendStatus('success');
          }
        } else {
          const res = await fetch('http://localhost:8080/api/validate-multi-room', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: 'plan-1',
              name: 'Multi-Room Floor Plan',
              exterior_wall_thickness: exteriorWallThickness,
              interior_wall_thickness: interiorWallThickness,
              rooms: multiRooms,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            setBackendWarnings(data.warnings || []);
            setBackendStatus('success');
          }
        }
      } catch {
        setBackendStatus('offline');
      }
    };

    const timer = setTimeout(runValidation, 300);
    return () => clearTimeout(timer);
  }, [studioMode, singleRoom, multiRooms, exteriorWallThickness, interiorWallThickness]);

  // Currently active room object (works seamlessly for both single-room & multi-room)
  const currentRoom: RoomConfig = useMemo(() => {
    if (studioMode === 'single') {
      return singleRoom;
    }
    const found = multiRooms.find((r) => r.id === selectedRoomId);
    return found || multiRooms[0] || singleRoom;
  }, [studioMode, singleRoom, multiRooms, selectedRoomId]);

  // Update current room handler
  const handleUpdateCurrentRoom = (updated: RoomConfig) => {
    if (studioMode === 'single') {
      setSingleRoom(updated);
    } else {
      setMultiRooms((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    }
  };

  // Add a new room to multi-room plan
  const handleAddRoom = (type: RoomConfig['type'] = 'bedroom') => {
    const newId = `room-${Date.now().toString(36)}`;
    const baseNames: Record<string, string> = {
      living: 'Living Area',
      bedroom: 'Bedroom',
      kitchen: 'Kitchen',
      bathroom: 'Bathroom',
      balcony: 'Balcony',
      office: 'Office Cabin',
    };

    // Calculate position: place to the right of the current room or bounding box
    const refRoom = currentRoom;
    const newX = Math.round(((refRoom.x || 0) + refRoom.breadth) * 10) / 10;
    const newY = Math.round((refRoom.y || 0) * 10) / 10;

    const newRoom: RoomConfig = {
      id: newId,
      name: `${baseNames[type || 'bedroom'] || 'Room'} ${multiRooms.length + 1}`,
      type: type || 'bedroom',
      x: newX,
      y: newY,
      breadth: 4.0,
      length: 3.5,
      openings: [
        { id: `op-${newId}-d1`, type: 'door', wall: 'W', position: 0.6, width: 0.9, flipHinge: false, flipSwing: true },
        { id: `op-${newId}-w1`, type: 'window', wall: 'E', position: 1.0, width: 1.4 },
      ],
    };

    setMultiRooms((prev) => [...prev, newRoom]);
    setSelectedRoomId(newId);
  };

  // Delete active room from multi-room plan
  const handleDeleteRoom = (roomId: string) => {
    if (multiRooms.length <= 1) return;
    setMultiRooms((prev) => {
      const filtered = prev.filter((r) => r.id !== roomId);
      if (selectedRoomId === roomId) {
        setSelectedRoomId(filtered[0]?.id || null);
      }
      return filtered;
    });
  };

  // Handle Multi-Room Preset selection
  const handleSelectMultiPreset = (idx: number) => {
    setActiveMultiIndex(idx);
    const preset = multiPresets[idx] || MULTI_ROOM_PRESETS[idx];
    if (preset) {
      setMultiRooms(JSON.parse(JSON.stringify(preset.rooms)));
      setExteriorWallThickness(preset.exteriorWallThickness || 0.20);
      setInteriorWallThickness(preset.interiorWallThickness || 0.10);
      setSelectedRoomId(preset.rooms[0]?.id || null);
      setSelectedOpeningId(null);
      setOrientation(0);
      setZoom(1);
      setPanOffset({ x: 0, y: 0 });
    }
  };

  // Add opening to currently active room
  const handleAddOpening = () => {
    const wallLength = newWall === 'N' || newWall === 'S' ? currentRoom.breadth : currentRoom.length;
    const clampedPos = Math.max(0.05, Math.min(wallLength - newWidth - 0.05, newPos));

    const newOpening: Opening = {
      id: `op-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`,
      type: newType,
      wall: newWall,
      position: Math.round(clampedPos * 100) / 100,
      width: Math.round(newWidth * 100) / 100,
      flipHinge: false,
      flipSwing: false,
    };

    const updated = {
      ...currentRoom,
      openings: [...currentRoom.openings, newOpening],
    };
    handleUpdateCurrentRoom(updated);
    setSelectedOpeningId(newOpening.id);
  };

  // Update opening in active room
  const handleUpdateOpening = (updated: Opening) => {
    if (studioMode === 'single') {
      setSingleRoom((prev) => ({
        ...prev,
        openings: prev.openings.map((o) => (o.id === updated.id ? updated : o)),
      }));
    } else {
      setMultiRooms((prev) =>
        prev.map((r) => {
          const hasOp = r.openings.some((o) => o.id === updated.id);
          if (!hasOp) return r;
          return {
            ...r,
            openings: r.openings.map((o) => (o.id === updated.id ? updated : o)),
          };
        })
      );
    }
  };

  // Delete opening
  const handleDeleteOpening = (id: string) => {
    if (studioMode === 'single') {
      setSingleRoom((prev) => ({
        ...prev,
        openings: prev.openings.filter((o) => o.id !== id),
      }));
    } else {
      setMultiRooms((prev) =>
        prev.map((r) => ({
          ...r,
          openings: r.openings.filter((o) => o.id !== id),
        }))
      );
    }
    if (selectedOpeningId === id) {
      setSelectedOpeningId(null);
    }
  };

  // Metrics for Multi-Room & Single-Room
  const activeRoomsList = useMemo(() => {
    return studioMode === 'single' ? [singleRoom] : multiRooms;
  }, [studioMode, singleRoom, multiRooms]);

  const totalCarpetSqm = useMemo(() => {
    return activeRoomsList.reduce((sum, r) => sum + r.breadth * r.length, 0);
  }, [activeRoomsList]);

  const totalCarpetSqFt = totalCarpetSqm * 10.7639;

  // Plan Bounding Dimensions
  const planBounds = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    activeRoomsList.forEach((r) => {
      const rx = r.x || 0;
      const ry = r.y || 0;
      if (rx < minX) minX = rx;
      if (ry < minY) minY = ry;
      if (rx + r.breadth > maxX) maxX = rx + r.breadth;
      if (ry + r.length > maxY) maxY = ry + r.length;
    });
    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 5; maxY = 4; }
    return {
      width: maxX - minX,
      height: maxY - minY,
      minX,
      minY,
      maxX,
      maxY,
    };
  }, [activeRoomsList]);

  // Overall built-up gross estimate
  const grossBuiltUpSqm = (planBounds.width + 2 * exteriorWallThickness) * (planBounds.height + 2 * exteriorWallThickness);
  const grossBuiltUpSqFt = grossBuiltUpSqm * 10.7639;
  const efficiencyPercent = Math.min(100, Math.round((totalCarpetSqm / grossBuiltUpSqm) * 1000) / 10);

  // Backend Validation Effect
  useEffect(() => {
    const controller = new AbortController();
    const validate = async () => {
      try {
        const endpoint = studioMode === 'single' ? '/api/validate' : '/api/validate-multi-room';
        const payload = studioMode === 'single'
          ? singleRoom
          : {
              name: multiPresets[activeMultiIndex]?.name || 'Custom Multi-Room Layout',
              exteriorWallThickness,
              interiorWallThickness,
              rooms: multiRooms,
            };

        const res = await fetch(`http://localhost:8080${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (res.ok) {
          const data = await res.json();
          setBackendStatus('connected');
          setBackendWarnings(data.metrics?.warnings || []);
        } else {
          setBackendStatus('offline');
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setBackendStatus('offline');
        }
      }
    };

    validate();
    return () => controller.abort();
  }, [studioMode, singleRoom, multiRooms, exteriorWallThickness, interiorWallThickness, activeMultiIndex, multiPresets]);

  // Standalone full-sheet architectural SVG export extractor
  const getExportSvgData = () => {
    const svgEl = document.getElementById('floorplan-canvas-svg') as SVGSVGElement | null;
    if (!svgEl) return null;

    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    const sheetWidth = Math.round(planBounds.width * BASE_PPM + SHEET_MARGIN_PX * 2);
    const sheetHeight = Math.round(planBounds.height * BASE_PPM + SHEET_MARGIN_PX * 2);

    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    clone.setAttribute('width', `${sheetWidth}`);
    clone.setAttribute('height', `${sheetHeight}`);
    clone.setAttribute('viewBox', `0 0 ${sheetWidth} ${sheetHeight}`);
    clone.removeAttribute('id');
    clone.removeAttribute('style');
    clone.setAttribute('class', 'floor-plan-sheet');

    const bgRect = clone.querySelector('[data-export-bg="true"]');
    if (bgRect) {
      bgRect.setAttribute('x', '0');
      bgRect.setAttribute('y', '0');
      bgRect.setAttribute('width', `${sheetWidth}`);
      bgRect.setAttribute('height', `${sheetHeight}`);
    }

    const gridRect = clone.querySelector('[data-export-grid="true"]');
    if (gridRect) {
      gridRect.setAttribute('x', '0');
      gridRect.setAttribute('y', '0');
      gridRect.setAttribute('width', `${sheetWidth}`);
      gridRect.setAttribute('height', `${sheetHeight}`);
    }

    clone.querySelectorAll('[data-drag]').forEach((el) => el.removeAttribute('data-drag'));
    return { clone, sheetWidth, sheetHeight };
  };

  // Export to PNG with Architectural Title Block
  const exportAsPng = () => {
    try {
      setIsExportingPng(true);
      const exportData = getExportSvgData();
      if (!exportData) {
        setIsExportingPng(false);
        return;
      }

      const { clone, sheetWidth, sheetHeight } = exportData;
      let svgString = new XMLSerializer().serializeToString(clone);
      if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
        svgString = svgString.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      }

      const svgBase64 = window.btoa(unescape(encodeURIComponent(svgString)));
      const imageSrc = `data:image/svg+xml;base64,${svgBase64}`;

      const image = new Image();
      image.onload = () => {
        try {
          const scale = 2;
          const canvas = document.createElement('canvas');
          canvas.width = sheetWidth * scale;
          canvas.height = sheetHeight * scale;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            setIsExportingPng(false);
            return;
          }

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

          // Title Block
          const tbWidth = 420 * scale;
          const tbHeight = 100 * scale;
          const tbX = canvas.width - tbWidth - 28 * scale;
          const tbY = canvas.height - tbHeight - 28 * scale;
          const padX = 18 * scale;

          ctx.fillStyle = 'rgba(255,255,255,0.98)';
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 2 * scale;
          ctx.fillRect(tbX, tbY, tbWidth, tbHeight);
          ctx.strokeRect(tbX, tbY, tbWidth, tbHeight);

          const titleText = studioMode === 'single'
            ? (singleRoom.name || 'SINGLE ROOM').toUpperCase()
            : (multiPresets[activeMultiIndex]?.name || 'MULTI-ROOM RESIDENCE').toUpperCase();

          ctx.fillStyle = '#0f172a';
          ctx.font = `bold ${18 * scale}px system-ui, sans-serif`;
          ctx.fillText(titleText, tbX + padX, tbY + 28 * scale);

          ctx.fillStyle = '#475569';
          ctx.font = `${13 * scale}px system-ui, monospace`;
          ctx.fillText(
            `OVERALL: ${formatDistance(planBounds.width, unit)} × ${formatDistance(planBounds.height, unit)} · WALLS: EXT ${Math.round(exteriorWallThickness * 1000)}mm / INT ${Math.round(interiorWallThickness * 1000)}mm`,
            tbX + padX,
            tbY + 54 * scale
          );
          ctx.fillText(
            unit === 'imperial'
              ? `CARPET: ${totalCarpetSqFt.toFixed(1)} sq ft · ROOMS: ${activeRoomsList.length} · SCALE 1/4" = 1'-0"`
              : `CARPET: ${totalCarpetSqm.toFixed(2)} m² · ROOMS: ${activeRoomsList.length} · SCALE 1:50`,
            tbX + padX,
            tbY + 78 * scale
          );

          canvas.toBlob((blob) => {
            setIsExportingPng(false);
            if (!blob) return;
            const pngURL = window.URL.createObjectURL(blob);
            const dlLink = document.createElement('a');
            dlLink.download = `${titleText.toLowerCase().replace(/\s+/g, '-')}-2d.png`;
            dlLink.href = pngURL;
            document.body.appendChild(dlLink);
            dlLink.click();
            document.body.removeChild(dlLink);
            window.URL.revokeObjectURL(pngURL);
          }, 'image/png');
        } catch (err) {
          setIsExportingPng(false);
        }
      };

      image.onerror = () => setIsExportingPng(false);
      image.src = imageSrc;
    } catch (err) {
      setIsExportingPng(false);
    }
  };

  // Export to SVG
  const exportAsSvg = () => {
    try {
      setIsExportingSvg(true);
      const exportData = getExportSvgData();
      if (!exportData) return;

      const { clone } = exportData;
      let svgString = new XMLSerializer().serializeToString(clone);
      if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
        svgString = svgString.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      }

      const svgDoc = `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Architectural 2D Floor Plan CAD Export -->\n${svgString}`;
      const blob = new Blob([svgDoc], { type: 'image/svg+xml;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const dlLink = document.createElement('a');
      dlLink.href = url;
      const title = studioMode === 'single' ? singleRoom.name || 'room' : multiPresets[activeMultiIndex]?.name || 'multi-room';
      dlLink.download = `${title.toLowerCase().replace(/\s+/g, '-')}-2d.svg`;
      document.body.appendChild(dlLink);
      dlLink.click();
      document.body.removeChild(dlLink);
      window.URL.revokeObjectURL(url);
    } finally {
      setIsExportingSvg(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-white text-slate-800 font-sans">
      {/* 1. TOP HEADER NAVIGATION */}
      <header className="h-14 border-b border-slate-200 px-6 flex items-center justify-between bg-white shrink-0 z-20 shadow-xs">
        <div className="flex items-center gap-5">
          {/* Mode Switcher: Single Room vs. Multi-Room Studio */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => {
                setStudioMode('single');
                setActiveTab('dimensions');
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                studioMode === 'single'
                  ? 'bg-white text-blue-600 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Square size={14} />
              Single Room
            </button>
            <button
              onClick={() => {
                setStudioMode('multi');
                setActiveTab('rooms');
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                studioMode === 'multi'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Grid size={14} />
              Multi-Room Suite
            </button>
          </div>

          {/* Preset Selector Dropdown */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-semibold">Layout:</span>
            {studioMode === 'single' ? (
              <select
                value={singleRoom.name}
                onChange={(e) => {
                  const found = SINGLE_ROOM_PRESETS.find((p) => p.name === e.target.value);
                  if (found) setSingleRoom(JSON.parse(JSON.stringify(found)));
                }}
                className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-slate-800 font-medium focus:outline-none focus:border-blue-600"
              >
                {SINGLE_ROOM_PRESETS.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} ({p.breadth}m × {p.length}m)
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-1.5">
                <select
                  value={activeMultiIndex}
                  onChange={(e) => handleSelectMultiPreset(Number(e.target.value))}
                  className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-slate-800 font-medium focus:outline-none focus:border-blue-600"
                >
                  {multiPresets.map((p, idx) => (
                    <option key={p.name} value={idx}>
                      {p.name} ({p.rooms.length} Rooms)
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => handleSelectMultiPreset(activeMultiIndex)}
                  title="Reload / Reset this preset layout"
                  className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 border border-slate-300 hover:border-blue-300 rounded-lg transition flex items-center gap-1 cursor-pointer"
                >
                  ↺ Reset
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Header: Theme, Units & Export Buttons */}
        <div className="flex items-center gap-3">
          {/* Unit Toggle */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setUnit('metric')}
              className={`px-2.5 py-1 rounded-md transition ${
                unit === 'metric' ? 'bg-white text-blue-600 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Metric (m)
            </button>
            <button
              onClick={() => setUnit('imperial')}
              className={`px-2.5 py-1 rounded-md transition ${
                unit === 'imperial' ? 'bg-white text-blue-600 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Imperial (ft)
            </button>
          </div>

          {/* Compass Orientation Quick Pill */}
          <button
            type="button"
            onClick={() => {
              if (Math.round(orientation) !== 0) {
                setOrientation(0);
              } else {
                setActiveTab('orientation');
              }
            }}
            title={`Plan Facing: ${Math.round(orientation)}° (${getCompassFullName(orientation)}). Click to reset North or adjust.`}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition ${
              Math.round(orientation) === 0
                ? 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                : 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100 shadow-xs'
            }`}
          >
            <Compass size={14} className={Math.round(orientation) !== 0 ? 'text-blue-600' : 'text-slate-500'} />
            <span>{Math.round(orientation)}° {getCompassDirection(orientation)}</span>
            {Math.round(orientation) !== 0 && (
              <span className="text-[10px] text-blue-500 font-normal hover:underline ml-0.5">Reset</span>
            )}
          </button>

          {/* Theme Selector */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setTheme('cad-light')}
              className={`px-2.5 py-1 rounded-md transition ${
                theme === 'cad-light' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              CAD Light
            </button>
            <button
              onClick={() => setTheme('blueprint')}
              className={`px-2.5 py-1 rounded-md transition ${
                theme === 'blueprint' ? 'bg-blue-600 text-white shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Blueprint
            </button>
          </div>

          <div className="w-px h-5 bg-slate-200" />

          {/* Export PNG */}
          <button
            onClick={exportAsPng}
            disabled={isExportingPng}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition shadow-sm ${
              isExportingPng ? 'opacity-70 cursor-wait' : ''
            }`}
          >
            <ImageIcon size={15} />
            {isExportingPng ? 'Exporting...' : 'Export PNG'}
          </button>

          {/* Export SVG */}
          <button
            onClick={exportAsSvg}
            disabled={isExportingSvg}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition border border-slate-300 shadow-sm ${
              isExportingSvg ? 'opacity-70 cursor-wait' : ''
            }`}
          >
            <FileCode size={15} />
            {isExportingSvg ? 'Exporting...' : 'SVG'}
          </button>
        </div>
      </header>

      {/* 2. MAIN WORKSPACE (SIDEBAR + 2D CANVAS) */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar */}
        <aside className="w-96 lg:w-[440px] border-r border-slate-200 bg-white flex flex-col shrink-0 z-10 shadow-md">
          {/* Sidebar Tabs */}
          <div className="flex border-b border-slate-200 bg-slate-50 p-1.5 gap-1 shrink-0 overflow-x-auto">
            {studioMode === 'multi' && (
              <button
                onClick={() => setActiveTab('rooms')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap px-2 ${
                  activeTab === 'rooms' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Rooms ({multiRooms.length})
              </button>
            )}

            <button
              onClick={() => setActiveTab('dimensions')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap px-2 ${
                activeTab === 'dimensions' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {studioMode === 'multi' ? 'Active Room' : 'Room Specs'}
            </button>

            <button
              onClick={() => setActiveTab('walls')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap px-2 ${
                activeTab === 'walls' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Wall Thickness
            </button>

            <button
              onClick={() => setActiveTab('orientation')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap px-2 flex items-center justify-center gap-1 ${
                activeTab === 'orientation' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Compass size={13} />
              Facing
            </button>

            <button
              onClick={() => setActiveTab('openings')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap px-2 ${
                activeTab === 'openings' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Openings ({currentRoom.openings.length})
            </button>

            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition whitespace-nowrap px-2 ${
                activeTab === 'analytics' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Analytics
            </button>
          </div>

          {/* TAB CONTENT */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* ========================================================= */}
            {/* TAB: ROOMS & LAYOUT (MULTI-ROOM MODE ONLY)                */}
            {/* ========================================================= */}
            {studioMode === 'multi' && activeTab === 'rooms' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                    Rooms in Layout ({multiRooms.length})
                  </h3>
                  <button
                    onClick={() => handleAddRoom('bedroom')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs"
                  >
                    <Plus size={14} />
                    Add Room
                  </button>
                </div>

                {/* Room Cards List */}
                <div className="space-y-2.5">
                  {multiRooms.map((rm) => {
                    const isSelected = rm.id === selectedRoomId;
                    const area = rm.breadth * rm.length;

                    return (
                      <div
                        key={rm.id}
                        onClick={() => setSelectedRoomId(rm.id || null)}
                        className={`p-3.5 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-blue-50/80 border-blue-600 shadow-sm'
                            : 'bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${isSelected ? 'bg-blue-600 ring-2 ring-blue-300' : 'bg-slate-400'}`} />
                          <div>
                            <div className="font-bold text-sm text-slate-800">{rm.name}</div>
                            <div className="text-xs text-slate-500 font-mono">
                              {formatDistance(rm.breadth, unit)} × {formatDistance(rm.length, unit)} · {area.toFixed(1)} m²
                            </div>
                            <div className="text-[11px] text-blue-600 font-mono font-medium">
                              Pos: X: {(rm.x || 0).toFixed(2)}m, Y: {(rm.y || 0).toFixed(2)}m
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600">
                            {rm.type || 'ROOM'}
                          </span>
                          {multiRooms.length > 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteRoom(rm.id!);
                              }}
                              className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                              title="Delete this room"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Quick Add Room By Type Buttons */}
                <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 space-y-3">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block">
                    Quick Add Room
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { type: 'bedroom', label: '+ Bedroom' },
                      { type: 'living', label: '+ Living Room' },
                      { type: 'kitchen', label: '+ Kitchen' },
                      { type: 'bathroom', label: '+ Bathroom' },
                      { type: 'office', label: '+ Office' },
                      { type: 'balcony', label: '+ Balcony' },
                    ].map((btn) => (
                      <button
                        key={btn.type}
                        onClick={() => handleAddRoom(btn.type as any)}
                        className="py-2 px-3 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs border border-slate-200 transition shadow-xs text-left"
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================= */}
            {/* TAB: ACTIVE ROOM SPECS (DIMENSIONS, NAME, POSITION)        */}
            {/* ========================================================= */}
            {activeTab === 'dimensions' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                    {studioMode === 'multi' ? `Editing: ${currentRoom.name}` : 'Room Label'}
                  </label>
                  <input
                    type="text"
                    value={currentRoom.name || ''}
                    onChange={(e) => handleUpdateCurrentRoom({ ...currentRoom, name: e.target.value })}
                    placeholder="e.g. Master Bedroom"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-base font-semibold text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white shadow-sm"
                  />
                </div>

                {/* BREADTH (X-AXIS) */}
                <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-bold text-slate-800">
                      Breadth (East-West Width)
                    </label>
                    <span className="text-sm font-mono font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                      {formatDistance(currentRoom.breadth, unit)}
                    </span>
                  </div>

                  {unit === 'metric' ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.05"
                        min="1.0"
                        max="30.0"
                        value={currentRoom.breadth}
                        onChange={(e) =>
                          handleUpdateCurrentRoom({
                            ...currentRoom,
                            breadth: Math.max(1, Math.round(parseFloat(e.target.value || '1') * 100) / 100),
                          })
                        }
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-base font-bold text-slate-800 focus:outline-none focus:border-blue-600"
                      />
                      <span className="font-bold text-slate-500 text-sm">meters</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="3"
                        max="90"
                        value={toFtIn(currentRoom.breadth).ft}
                        onChange={(e) =>
                          handleUpdateCurrentRoom({
                            ...currentRoom,
                            breadth: fromFtIn(parseInt(e.target.value || '0'), toFtIn(currentRoom.breadth).in),
                          })
                        }
                        className="w-1/2 bg-white border border-slate-300 rounded-xl px-3 py-2 text-base font-bold text-slate-800 focus:outline-none focus:border-blue-600"
                      />
                      <span className="text-xs font-bold text-slate-500">ft</span>
                      <input
                        type="number"
                        min="0"
                        max="11"
                        value={toFtIn(currentRoom.breadth).in}
                        onChange={(e) =>
                          handleUpdateCurrentRoom({
                            ...currentRoom,
                            breadth: fromFtIn(toFtIn(currentRoom.breadth).ft, parseInt(e.target.value || '0')),
                          })
                        }
                        className="w-1/2 bg-white border border-slate-300 rounded-xl px-3 py-2 text-base font-bold text-slate-800 focus:outline-none focus:border-blue-600"
                      />
                      <span className="text-xs font-bold text-slate-500">in</span>
                    </div>
                  )}

                  {/* Preset chips */}
                  <div className="flex gap-2 pt-1">
                    {[3.0, 4.0, 5.0, 6.0, 7.5].map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => handleUpdateCurrentRoom({ ...currentRoom, breadth: w })}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition border ${
                          Math.abs(currentRoom.breadth - w) < 0.05
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {unit === 'imperial' ? `${Math.round(w / 0.3048)}'` : `${w}m`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* LENGTH (Y-AXIS) */}
                <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-bold text-slate-800">
                      Length (North-South Height)
                    </label>
                    <span className="text-sm font-mono font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                      {formatDistance(currentRoom.length, unit)}
                    </span>
                  </div>

                  {unit === 'metric' ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.05"
                        min="1.0"
                        max="30.0"
                        value={currentRoom.length}
                        onChange={(e) =>
                          handleUpdateCurrentRoom({
                            ...currentRoom,
                            length: Math.max(1, Math.round(parseFloat(e.target.value || '1') * 100) / 100),
                          })
                        }
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-base font-bold text-slate-800 focus:outline-none focus:border-blue-600"
                      />
                      <span className="font-bold text-slate-500 text-sm">meters</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="3"
                        max="90"
                        value={toFtIn(currentRoom.length).ft}
                        onChange={(e) =>
                          handleUpdateCurrentRoom({
                            ...currentRoom,
                            length: fromFtIn(parseInt(e.target.value || '0'), toFtIn(currentRoom.length).in),
                          })
                        }
                        className="w-1/2 bg-white border border-slate-300 rounded-xl px-3 py-2 text-base font-bold text-slate-800 focus:outline-none focus:border-blue-600"
                      />
                      <span className="text-xs font-bold text-slate-500">ft</span>
                      <input
                        type="number"
                        min="0"
                        max="11"
                        value={toFtIn(currentRoom.length).in}
                        onChange={(e) =>
                          handleUpdateCurrentRoom({
                            ...currentRoom,
                            length: fromFtIn(toFtIn(currentRoom.length).ft, parseInt(e.target.value || '0')),
                          })
                        }
                        className="w-1/2 bg-white border border-slate-300 rounded-xl px-3 py-2 text-base font-bold text-slate-800 focus:outline-none focus:border-blue-600"
                      />
                      <span className="text-xs font-bold text-slate-500">in</span>
                    </div>
                  )}

                  {/* Preset chips */}
                  <div className="flex gap-2 pt-1">
                    {[2.5, 3.5, 4.5, 5.0, 6.0].map((l) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => handleUpdateCurrentRoom({ ...currentRoom, length: l })}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition border ${
                          Math.abs(currentRoom.length - l) < 0.05
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {unit === 'imperial' ? `${Math.round(l / 0.3048)}'` : `${l}m`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Room Carpet Area Badge */}
                <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-700">Room Usable Area</span>
                  <div className="text-right">
                    <div className="font-bold text-base text-blue-700">
                      {(currentRoom.breadth * currentRoom.length).toFixed(2)} m²
                    </div>
                    <div className="text-xs text-slate-500 font-mono">
                      {(currentRoom.breadth * currentRoom.length * 10.7639).toFixed(1)} sq ft
                    </div>
                  </div>
                </div>

                {/* ROOM POSITION & REPOSITIONING (Multi-room & Single room) */}
                <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
                  <div className="flex justify-between items-center">
                    <div>
                      <label className="text-sm font-bold text-slate-800 block">Room Position (Coordinates)</label>
                      <span className="text-xs text-slate-500">Drag directly on canvas or adjust here</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      X: {(currentRoom.x || 0).toFixed(2)}m · Y: {(currentRoom.y || 0).toFixed(2)}m
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Position X */}
                    <div>
                      <span className="text-xs font-semibold text-slate-600 block mb-1">X Position (East-West)</span>
                      <input
                        type="number"
                        step="0.1"
                        value={Math.round((currentRoom.x || 0) * 100) / 100}
                        onChange={(e) =>
                          handleUpdateCurrentRoom({
                            ...currentRoom,
                            x: Math.round(parseFloat(e.target.value || '0') * 100) / 100,
                          })
                        }
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-600"
                      />
                    </div>

                    {/* Position Y */}
                    <div>
                      <span className="text-xs font-semibold text-slate-600 block mb-1">Y Position (North-South)</span>
                      <input
                        type="number"
                        step="0.1"
                        value={Math.round((currentRoom.y || 0) * 100) / 100}
                        onChange={(e) =>
                          handleUpdateCurrentRoom({
                            ...currentRoom,
                            y: Math.round(parseFloat(e.target.value || '0') * 100) / 100,
                          })
                        }
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>

                  {/* Nudge Directional Buttons */}
                  <div className="flex items-center justify-between pt-1 gap-1.5">
                    <button
                      type="button"
                      title="Nudge Left 0.5m"
                      onClick={() =>
                        handleUpdateCurrentRoom({
                          ...currentRoom,
                          x: Math.round(((currentRoom.x || 0) - 0.5) * 100) / 100,
                        })
                      }
                      className="flex-1 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-lg border border-slate-200 transition"
                    >
                      ← Left
                    </button>
                    <button
                      type="button"
                      title="Nudge Right 0.5m"
                      onClick={() =>
                        handleUpdateCurrentRoom({
                          ...currentRoom,
                          x: Math.round(((currentRoom.x || 0) + 0.5) * 100) / 100,
                        })
                      }
                      className="flex-1 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-lg border border-slate-200 transition"
                    >
                      Right →
                    </button>
                    <button
                      type="button"
                      title="Nudge Up 0.5m"
                      onClick={() =>
                        handleUpdateCurrentRoom({
                          ...currentRoom,
                          y: Math.round(((currentRoom.y || 0) - 0.5) * 100) / 100,
                        })
                      }
                      className="flex-1 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-lg border border-slate-200 transition"
                    >
                      ↑ Up
                    </button>
                    <button
                      type="button"
                      title="Nudge Down 0.5m"
                      onClick={() =>
                        handleUpdateCurrentRoom({
                          ...currentRoom,
                          y: Math.round(((currentRoom.y || 0) + 0.5) * 100) / 100,
                        })
                      }
                      className="flex-1 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-lg border border-slate-200 transition"
                    >
                      Down ↓
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================= */}
            {/* TAB: DUAL WALL THICKNESS INPUTS (USER REQUESTED)          */}
            {/* ========================================================= */}
            {activeTab === 'walls' && (
              <div className="space-y-6">
                <div className="border-b border-slate-200 pb-3">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                    Architectural Wall Specifications
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Configure separate thicknesses for outer envelope walls vs. interior dividing partitions.
                  </p>
                </div>

                {/* 1. EXTERIOR ENVELOPE WALL THICKNESS */}
                <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
                  <div className="flex justify-between items-center">
                    <div>
                      <label className="text-sm font-bold text-slate-800 block">
                        Exterior Wall Thickness
                      </label>
                      <span className="text-xs text-slate-500">Perimeter / building envelope</span>
                    </div>
                    <span className="text-sm font-mono font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                      {unit === 'imperial'
                        ? `${Math.round(exteriorWallThickness / 0.0254)}"`
                        : `${Math.round(exteriorWallThickness * 1000)} mm`}
                    </span>
                  </div>

                  {unit === 'metric' ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="10"
                        min="100"
                        max="600"
                        value={Math.round(exteriorWallThickness * 1000)}
                        onChange={(e) => setExteriorWallThickness(Math.max(0.1, parseFloat(e.target.value || '200') / 1000))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-base font-bold text-slate-800 focus:outline-none focus:border-blue-600"
                      />
                      <span className="font-bold text-slate-500 text-sm">mm</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="1"
                        min="4"
                        max="24"
                        value={Math.round(exteriorWallThickness / 0.0254)}
                        onChange={(e) => setExteriorWallThickness(Math.max(0.1, parseFloat(e.target.value || '8') * 0.0254))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-base font-bold text-slate-800 focus:outline-none focus:border-blue-600"
                      />
                      <span className="font-bold text-slate-500 text-sm">inches</span>
                    </div>
                  )}

                  {/* Exterior Presets */}
                  <div className="flex gap-2 pt-1">
                    {[0.15, 0.20, 0.25, 0.30].map((th) => (
                      <button
                        key={th}
                        type="button"
                        onClick={() => setExteriorWallThickness(th)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition border ${
                          Math.abs(exteriorWallThickness - th) < 0.01
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {unit === 'imperial' ? `${Math.round(th / 0.0254)}"` : `${th * 1000}mm`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. INTERIOR PARTITION WALL THICKNESS */}
                <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
                  <div className="flex justify-between items-center">
                    <div>
                      <label className="text-sm font-bold text-slate-800 block">
                        Interior Partition Thickness
                      </label>
                      <span className="text-xs text-slate-500">Shared dividing walls between rooms</span>
                    </div>
                    <span className="text-sm font-mono font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                      {unit === 'imperial'
                        ? `${Math.round(interiorWallThickness / 0.0254)}"`
                        : `${Math.round(interiorWallThickness * 1000)} mm`}
                    </span>
                  </div>

                  {unit === 'metric' ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="10"
                        min="50"
                        max="300"
                        value={Math.round(interiorWallThickness * 1000)}
                        onChange={(e) => setInteriorWallThickness(Math.max(0.05, parseFloat(e.target.value || '100') / 1000))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-base font-bold text-slate-800 focus:outline-none focus:border-blue-600"
                      />
                      <span className="font-bold text-slate-500 text-sm">mm</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="1"
                        min="2"
                        max="12"
                        value={Math.round(interiorWallThickness / 0.0254)}
                        onChange={(e) => setInteriorWallThickness(Math.max(0.05, parseFloat(e.target.value || '4') * 0.0254))}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-base font-bold text-slate-800 focus:outline-none focus:border-blue-600"
                      />
                      <span className="font-bold text-slate-500 text-sm">inches</span>
                    </div>
                  )}

                  {/* Interior Presets */}
                  <div className="flex gap-2 pt-1">
                    {[0.08, 0.10, 0.12, 0.15].map((th) => (
                      <button
                        key={th}
                        type="button"
                        onClick={() => setInteriorWallThickness(th)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition border ${
                          Math.abs(interiorWallThickness - th) < 0.01
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {unit === 'imperial' ? `${Math.round(th / 0.0254)}"` : `${th * 1000}mm`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================= */}
            {/* TAB: DOORS & WINDOWS (ACTIVE ROOM)                        */}
            {/* ========================================================= */}
            {activeTab === 'openings' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                    Place Opening on {currentRoom.name}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Select door or window, choose wall, and specify width. Drag openings directly along walls on the canvas.
                  </p>
                </div>

                {/* Type Selection */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setNewType('door');
                      setNewWidth(0.9);
                    }}
                    className={`py-3 px-4 rounded-xl border flex items-center justify-center gap-2 font-bold text-sm transition ${
                      newType === 'door'
                        ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                    }`}
                  >
                    <DoorOpen size={18} />
                    Door
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setNewType('window');
                      setNewWidth(1.4);
                    }}
                    className={`py-3 px-4 rounded-xl border flex items-center justify-center gap-2 font-bold text-sm transition ${
                      newType === 'window'
                        ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                    }`}
                  >
                    <Square size={18} />
                    Window
                  </button>
                </div>

                {/* Wall Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                    Target Wall
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['N', 'S', 'W', 'E'] as WallSide[]).map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setNewWall(w)}
                        className={`py-2 rounded-xl border text-sm font-bold transition ${
                          newWall === w
                            ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {w} Wall
                      </button>
                    ))}
                  </div>
                </div>

                {/* Position Along Wall Input */}
                <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-bold text-slate-800">Position Along Wall</label>
                    <span className="text-sm font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {formatDistance(newPos, unit)}
                    </span>
                  </div>

                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="10.0"
                    value={newPos}
                    onChange={(e) => setNewPos(Math.max(0.1, parseFloat(e.target.value || '1.0')))}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-base font-bold text-slate-800 focus:outline-none focus:border-blue-600"
                  />

                  <div className="flex gap-2">
                    {[0.5, 1.0, 1.5, 2.0].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setNewPos(p)}
                        className={`flex-1 py-1 rounded-lg text-xs font-bold border transition ${
                          Math.abs(newPos - p) < 0.05
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {p}m
                      </button>
                    ))}
                  </div>
                </div>

                {/* Width Input */}
                <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-bold text-slate-800">Opening Width</label>
                    <span className="text-sm font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {formatDistance(newWidth, unit)}
                    </span>
                  </div>

                  <input
                    type="number"
                    step="0.05"
                    min="0.4"
                    max="5.0"
                    value={newWidth}
                    onChange={(e) => setNewWidth(Math.max(0.4, parseFloat(e.target.value || '0.9')))}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-base font-bold text-slate-800 focus:outline-none focus:border-blue-600"
                  />

                  <div className="flex gap-2">
                    {(newType === 'door' ? [0.75, 0.90, 1.0, 1.2] : [0.90, 1.20, 1.50, 2.0]).map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setNewWidth(w)}
                        className={`flex-1 py-1 rounded-lg text-xs font-bold border transition ${
                          Math.abs(newWidth - w) < 0.02
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {w}m
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddOpening}
                  className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition shadow-sm flex items-center justify-center gap-2"
                >
                  <Plus size={18} />
                  Place {newType === 'door' ? 'Door' : 'Window'} on {newWall} Wall
                </button>

                {/* Existing Openings List */}
                <div className="space-y-3 pt-2">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block">
                    Openings in {currentRoom.name} ({currentRoom.openings.length})
                  </span>
                  {currentRoom.openings.map((op, idx) => (
                    <div
                      key={op.id}
                      onClick={() => setSelectedOpeningId(op.id)}
                      className={`p-3 rounded-xl border flex items-center justify-between transition cursor-pointer ${
                        selectedOpeningId === op.id
                          ? 'border-blue-600 bg-blue-50/80 shadow-sm'
                          : 'border-slate-200 bg-slate-50 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-bold text-sm text-blue-700">
                          {op.type === 'door' ? `D${idx + 1}` : `W${idx + 1}`}
                        </span>
                        <div className="text-xs text-slate-700">
                          <span className="font-semibold">{op.type.toUpperCase()}</span> on {op.wall} Wall ·{' '}
                          <span className="font-mono">{formatDistance(op.width, unit)}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteOpening(op.id);
                        }}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded-md transition"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ========================================================= */}
            {/* TAB: ORIENTATION & SITE FACING (0° TO 360°)               */}
            {/* ========================================================= */}
            {activeTab === 'orientation' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <Compass size={16} className="text-blue-600" />
                    Plan Orientation & Site Facing
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Rotate the floor plan to match your site's True North or desired solar/entrance orientation (0° to 360°).
                  </p>
                </div>

                {/* Big Visual Compass Orientation Card */}
                <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Current Heading</span>
                    <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800">
                      {getCompassFullName(orientation)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-3xl font-black tracking-tight text-white font-mono">
                        {Math.round(orientation)}°
                      </div>
                      <div className="text-xs font-semibold text-slate-300 mt-0.5">
                        Facing {getCompassDirection(orientation)} · {getCompassFullName(orientation)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setOrientation(0)}
                      title="Reset orientation to True North (0°)"
                      className="px-3 py-1.5 rounded-xl bg-slate-700/80 hover:bg-slate-600 text-slate-200 hover:text-white text-xs font-bold transition flex items-center gap-1.5 border border-slate-600 shadow-xs cursor-pointer"
                    >
                      <RotateCcw size={13} />
                      Reset North
                    </button>
                  </div>

                  {/* Degree Slider */}
                  <div className="space-y-1.5 pt-2">
                    <div className="flex justify-between text-[11px] font-mono text-slate-400">
                      <span>0° N</span>
                      <span>90° E</span>
                      <span>180° S</span>
                      <span>270° W</span>
                      <span>360° N</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      step="1"
                      value={Math.round(orientation)}
                      onChange={(e) => setOrientation(Number(e.target.value))}
                      className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                </div>

                {/* Exact Typeable Angle Input */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Exact Angle (Degrees)
                    </label>
                    <span className="text-xs text-slate-500">0° to 360°</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        min="0"
                        max="360"
                        step="1"
                        value={Math.round(orientation)}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) {
                            const normalized = ((val % 360) + 360) % 360;
                            setOrientation(normalized);
                          }
                        }}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-base font-bold font-mono text-slate-800 focus:outline-none focus:border-blue-600"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">°</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setOrientation((prev) => (prev + 90) % 360)}
                      title="Rotate 90° Clockwise"
                      className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-bold border border-slate-300 text-xs transition cursor-pointer"
                    >
                      +90°
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrientation((prev) => (prev - 90 + 360) % 360)}
                      title="Rotate 90° Counter-Clockwise"
                      className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-bold border border-slate-300 text-xs transition cursor-pointer"
                    >
                      -90°
                    </button>
                  </div>
                </div>

                {/* 8 Quick Cardinal & Ordinal Directions */}
                <div className="space-y-2.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                    Quick Direction Presets
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: 'North', short: 'N', deg: 0 },
                      { label: 'North-East', short: 'NE', deg: 45 },
                      { label: 'East', short: 'E', deg: 90 },
                      { label: 'South-East', short: 'SE', deg: 135 },
                      { label: 'South', short: 'S', deg: 180 },
                      { label: 'South-West', short: 'SW', deg: 225 },
                      { label: 'West', short: 'W', deg: 270 },
                      { label: 'North-West', short: 'NW', deg: 315 },
                    ].map((item) => {
                      const isSelected = Math.round(orientation) === item.deg;
                      return (
                        <button
                          key={item.short}
                          type="button"
                          onClick={() => setOrientation(item.deg)}
                          className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-600 shadow-sm font-bold'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 font-medium'
                          }`}
                        >
                          <span className="text-sm font-extrabold">{item.short}</span>
                          <span className={`text-[10px] ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                            {item.deg}°
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Architectural Canvas Hint Card */}
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1.5 leading-relaxed">
                  <div className="font-bold flex items-center gap-1.5 text-amber-800">
                    <Compass size={14} />
                    Direct Canvas Compass Interaction
                  </div>
                  <p>
                    • <strong>Rotate on Canvas:</strong> You can click and drag directly around the Compass Rose in the top-right of the drawing sheet to rotate to any heading freely.
                  </p>
                  <p>
                    • <strong>Double-Click Reset:</strong> Double-click the canvas compass at any time to instantly snap it back to North (0°).
                  </p>
                </div>
              </div>
            )}

            {/* ========================================================= */}
            {/* TAB: ANALYTICS & ROOM SCHEDULE                            */}
            {/* ========================================================= */}
            {activeTab === 'analytics' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                    Architectural Area & Code Analytics
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Room-by-room area schedule, carpet vs. gross ratio, and daylight compliance.
                  </p>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-xs text-slate-500 block">Total Carpet Area</span>
                    <span className="font-bold text-lg text-blue-700 block mt-0.5">
                      {totalCarpetSqm.toFixed(2)} m²
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      {totalCarpetSqFt.toFixed(1)} sq ft
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-xs text-slate-500 block">Gross Built-Up</span>
                    <span className="font-bold text-lg text-slate-800 block mt-0.5">
                      {grossBuiltUpSqm.toFixed(2)} m²
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      {grossBuiltUpSqFt.toFixed(1)} sq ft
                    </span>
                  </div>
                </div>

                {/* Room Schedule Table */}
                <div className="space-y-3">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block">
                    Room Area Schedule
                  </span>
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold">
                        <tr>
                          <th className="p-2.5">Room</th>
                          <th className="p-2.5">Dimensions</th>
                          <th className="p-2.5 text-right">Carpet Area</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activeRoomsList.map((r) => {
                          const area = r.breadth * r.length;
                          return (
                            <tr
                              key={r.id}
                              onClick={() => setSelectedRoomId(r.id || null)}
                              className={`cursor-pointer hover:bg-slate-50 transition ${
                                r.id === selectedRoomId ? 'bg-blue-50/50' : ''
                              }`}
                            >
                              <td className="p-2.5 font-bold text-slate-800">{r.name}</td>
                              <td className="p-2.5 font-mono text-slate-600">
                                {formatDistance(r.breadth, unit)} × {formatDistance(r.length, unit)}
                              </td>
                              <td className="p-2.5 font-mono font-bold text-right text-blue-700">
                                {area.toFixed(2)} m²
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Code Compliance & Efficiency */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">Layout Efficiency</span>
                    <span className="font-bold text-slate-900">{efficiencyPercent}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full"
                      style={{ width: `${Math.min(100, efficiencyPercent)}%` }}
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2 text-xs text-emerald-700 font-medium">
                    <CheckCircle2 size={16} />
                    <span>NBC & IBC compliant habitability standards verified ({backendStatus})</span>
                  </div>
                </div>

                {/* Backend Code Compliance Warnings */}
                {backendWarnings.length > 0 && (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                      <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                      <span>Architectural Code Notices ({backendWarnings.length})</span>
                    </div>
                    <ul className="text-xs text-amber-800 space-y-1 pl-5 list-disc font-medium">
                      {backendWarnings.map((warn, i) => (
                        <li key={i}>{warn}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* Right Canvas Area */}
        <main className="flex-1 h-full relative overflow-hidden bg-white">
          <FloorPlan
            rooms={activeRoomsList}
            selectedRoomId={selectedRoomId}
            onSelectRoom={setSelectedRoomId}
            onUpdateRoom={handleUpdateCurrentRoom}
            exteriorWallThickness={exteriorWallThickness}
            interiorWallThickness={interiorWallThickness}
            theme={theme}
            unit={unit}
            showDimensions={showDimensions}
            showGrid={showGrid}
            selectedOpeningId={selectedOpeningId}
            onSelectOpening={setSelectedOpeningId}
            onUpdateOpening={handleUpdateOpening}
            onDeleteOpening={handleDeleteOpening}
            zoom={zoom}
            onZoomChange={setZoom}
            panOffset={panOffset}
            onPanChange={setPanOffset}
            onCursorMove={setCursorCoords}
            orientation={orientation}
            onOrientationChange={setOrientation}
          />

          {/* Top-Center Drag & Reposition Instruction Banner */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-md border border-slate-200 shadow-lg rounded-full px-4 py-1.5 flex items-center gap-2.5 z-10 text-xs font-semibold text-slate-700 pointer-events-none">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
            <span>Drag rooms to move • Drag compass to rotate (0°–360°) • Double-click compass to reset North</span>
          </div>

          {/* Top-Right Floating Canvas HUD */}
          <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl p-1.5 flex items-center gap-1 shadow-lg z-20">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.5, Math.round((z + 0.15) * 100) / 100))}
              className="p-2 rounded-xl hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition"
              title="Zoom In"
            >
              <ZoomIn size={18} />
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.4, Math.round((z - 0.15) * 100) / 100))}
              className="p-2 rounded-xl hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition"
              title="Zoom Out"
            >
              <ZoomOut size={18} />
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setPanOffset({ x: 0, y: 0 });
              }}
              className="p-2 rounded-xl hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition"
              title="Reset View (100%)"
            >
              <RotateCcw size={18} />
            </button>

            <div className="w-px h-5 bg-slate-200 mx-1" />

            <button
              type="button"
              onClick={() => setOrientation(0)}
              className="px-2.5 py-1.5 rounded-xl hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition flex items-center gap-1.5 text-xs font-bold"
              title={`Orientation: ${Math.round(orientation)}° (${getCompassFullName(orientation)}). Double-click canvas compass or click here to reset North.`}
            >
              <Compass size={15} className={Math.round(orientation) !== 0 ? 'text-blue-600' : 'text-slate-500'} />
              <span>{Math.round(orientation)}°</span>
            </button>

            <div className="w-px h-5 bg-slate-200 mx-1.5" />

            <button
              type="button"
              onClick={() => setShowGrid((g) => !g)}
              className={`p-2 rounded-xl transition ${
                showGrid
                  ? 'bg-blue-50 text-blue-600 border border-blue-200 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              title="Toggle Architectural Grid"
            >
              <Grid size={18} />
            </button>

            <button
              type="button"
              onClick={() => setShowDimensions((d) => !d)}
              className={`p-2 rounded-xl transition ${
                showDimensions
                  ? 'bg-blue-50 text-blue-600 border border-blue-200 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              title="Toggle CAD Dimension Strings"
            >
              <Ruler size={18} />
            </button>
          </div>
        </main>
      </div>

      {/* 3. DOCKED FOOTER STATUS BAR */}
      <footer className="h-9 bg-white border-t border-slate-200 px-6 flex items-center justify-between text-xs font-mono text-slate-600 shrink-0 z-20 select-none">
        <div className="flex items-center gap-4">
          <div>
            Mode: <span className="font-bold text-blue-700 uppercase">{studioMode === 'single' ? 'Single Room' : 'Multi-Room'}</span>
          </div>
          <div className="w-px h-3.5 bg-slate-200" />
          <div>
            Zoom: <span className="font-bold text-slate-900">{Math.round(zoom * 100)}%</span>
          </div>
          <div className="w-px h-3.5 bg-slate-200" />
          <div>
            Scale: <span className="font-bold text-slate-900">{unit === 'imperial' ? '1/4" = 1\'-0"' : '1:50 (1m = 100u)'}</span>
          </div>
          <div className="w-px h-3.5 bg-slate-200" />
          <div>
            Grid: <span className="font-bold text-slate-900">{unit === 'imperial' ? '1.0ft (10 subdivisions)' : '1.0m (10 subdivisions · 10cm/cell)'}</span>
          </div>
          {cursorCoords && (
            <>
              <div className="w-px h-3.5 bg-slate-200" />
              <div>
                Cursor: X:{' '}
                <span className="font-bold text-slate-900">
                  {formatDistance(cursorCoords.x, unit)}
                </span>
                , Y:{' '}
                <span className="font-bold text-slate-900">
                  {formatDistance(cursorCoords.y, unit)}
                </span>
              </div>
            </>
          )}
        </div>
        <div className="hidden md:flex items-center gap-2 text-slate-500 font-sans">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Corner snapped to (0,0) grid · Walls: Ext {Math.round(exteriorWallThickness * 1000)}mm / Int {Math.round(interiorWallThickness * 1000)}mm</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
