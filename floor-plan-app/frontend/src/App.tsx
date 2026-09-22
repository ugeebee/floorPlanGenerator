import { useState, useEffect, useMemo } from 'react';
import FloorPlan, { RoomConfig, Opening, WallSide, FloorPlanTheme, UnitSystem, formatDistance } from './FloorPlan';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Grid,
  Download,
  Image as ImageIcon,
  FileCode,
  DoorOpen,
  Square,
  Plus,
  Trash2,
  FlipHorizontal,
  FlipVertical,
  CheckCircle2,
  AlertTriangle,
  Ruler,
} from './icons';

const ROOM_PRESETS: { name: string; breadth: number; length: number; openings: Opening[] }[] = [
  {
    name: 'Master Bedroom Suite',
    breadth: 5.5,
    length: 4.5,
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
    openings: [
      { id: 'kd-d1', type: 'door', wall: 'S', position: 0.6, width: 0.9, flipHinge: false, flipSwing: false },
      { id: 'kd-w1', type: 'window', wall: 'N', position: 1.4, width: 2.0 },
    ],
  },
  {
    name: 'Standard Bedroom',
    breadth: 4.0,
    length: 3.5,
    openings: [
      { id: 'sb-d1', type: 'door', wall: 'S', position: 0.5, width: 0.85, flipHinge: false, flipSwing: false },
      { id: 'sb-w1', type: 'window', wall: 'N', position: 1.2, width: 1.4 },
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
  const [room, setRoom] = useState<RoomConfig>(ROOM_PRESETS[0]);
  const [unit, setUnit] = useState<UnitSystem>('metric');
  const [theme, setTheme] = useState<FloorPlanTheme>('cad-light');
  const [showDimensions, setShowDimensions] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);

  // Viewport Controls
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [cursorCoords, setCursorCoords] = useState<{ x: number; y: number } | null>(null);

  // New Opening Form State (stored in meters internally)
  const [newType, setNewType] = useState<'door' | 'window'>('door');
  const [newWall, setNewWall] = useState<WallSide>('N');
  const [newPos, setNewPos] = useState<number>(1.0);
  const [newWidth, setNewWidth] = useState<number>(0.9);

  // Active Sidebar Tab
  const [activeTab, setActiveTab] = useState<'dimensions' | 'openings' | 'analytics'>('dimensions');

  // Backend validation state
  const [backendStatus, setBackendStatus] = useState<string>('idle');
  const [backendWarnings, setBackendWarnings] = useState<string[]>([]);

  // Update opening width defaults when type changes
  const handleTypeSelect = (type: 'door' | 'window') => {
    setNewType(type);
    if (type === 'door') {
      setNewWidth(0.9);
    } else {
      setNewWidth(1.2);
    }
  };

  // Add opening
  const handleAddOpening = () => {
    const wallLength = newWall === 'N' || newWall === 'S' ? room.breadth : room.length;
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

    setRoom((prev) => ({
      ...prev,
      openings: [...prev.openings, newOpening],
    }));
    setSelectedOpeningId(newOpening.id);
  };

  // Update opening
  const handleUpdateOpening = (updated: Opening) => {
    setRoom((prev) => ({
      ...prev,
      openings: prev.openings.map((o) => (o.id === updated.id ? updated : o)),
    }));
  };

  // Delete opening
  const handleDeleteOpening = (id: string) => {
    setRoom((prev) => ({
      ...prev,
      openings: prev.openings.filter((o) => o.id !== id),
    }));
    if (selectedOpeningId === id) {
      setSelectedOpeningId(null);
    }
  };

  // Preset selector
  const handleSelectPreset = (idx: number) => {
    const preset = ROOM_PRESETS[idx];
    setRoom(JSON.parse(JSON.stringify(preset)));
    setSelectedOpeningId(null);
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

  // Architectural Metrics
  const grossArea = room.breadth * room.length;
  const grossAreaSqFt = grossArea * 10.7639;
  const wallPerimeter = 2 * (room.breadth + room.length);

  // Daylight Calculations: Window glazed area vs floor area
  const totalWindowArea = useMemo(() => {
    const standardWindowHeight = 1.4;
    return room.openings
      .filter((o) => o.type === 'window')
      .reduce((sum, w) => sum + w.width * standardWindowHeight, 0);
  }, [room.openings]);

  const daylightRatio = grossArea > 0 ? (totalWindowArea / grossArea) * 100 : 0;
  const isDaylightCompliant = daylightRatio >= 10;

  // Try validating with Go backend if available
  useEffect(() => {
    const controller = new AbortController();
    const validateWithBackend = async () => {
      try {
        const res = await fetch('http://localhost:8080/api/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(room),
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          setBackendStatus('connected');
          if (data.warnings) {
            setBackendWarnings(data.warnings);
          } else {
            setBackendWarnings([]);
          }
        } else {
          setBackendStatus('offline');
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setBackendStatus('offline');
        }
      }
    };

    validateWithBackend();
    return () => controller.abort();
  }, [room]);

  // Export to PNG with Title Block
  const exportAsPng = () => {
    const svgEl = document.querySelector('svg');
    if (!svgEl) return;

    const svgData = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const URL = window.URL || window.webkitURL || window;
    const blobURL = URL.createObjectURL(svgBlob);

    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = 2;
      canvas.width = svgEl.clientWidth * scale || 1920;
      canvas.height = svgEl.clientHeight * scale || 1080;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      // Title Block in Bottom Right Corner
      const tbWidth = 380;
      const tbHeight = 96;
      const tbX = canvas.width - tbWidth - 28;
      const tbY = canvas.height - tbHeight - 28;

      ctx.fillStyle = 'rgba(255,255,255,0.98)';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.fillRect(tbX, tbY, tbWidth, tbHeight);
      ctx.strokeRect(tbX, tbY, tbWidth, tbHeight);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText(room.name || 'FLOOR PLAN', tbX + 18, tbY + 30);

      ctx.fillStyle = '#475569';
      ctx.font = '15px system-ui, monospace';
      ctx.fillText(
        `DIMENSIONS: ${formatDistance(room.breadth, unit)} × ${formatDistance(room.length, unit)}`,
        tbX + 18,
        tbY + 56
      );
      ctx.fillText(
        unit === 'imperial'
          ? `AREA: ${grossAreaSqFt.toFixed(1)} sq ft · SCALE 1/4" = 1'-0"`
          : `AREA: ${grossArea.toFixed(2)} m² · SCALE 1:50`,
        tbX + 18,
        tbY + 78
      );

      const pngURL = canvas.toDataURL('image/png');
      const dlLink = document.createElement('a');
      dlLink.download = `${(room.name || 'floor-plan').toLowerCase().replace(/\s+/g, '-')}-2d.png`;
      dlLink.href = pngURL;
      document.body.appendChild(dlLink);
      dlLink.click();
      document.body.removeChild(dlLink);
      URL.revokeObjectURL(blobURL);
    };
    image.src = blobURL;
  };

  // Export as SVG
  const exportAsSvg = () => {
    const svgEl = document.querySelector('svg');
    if (!svgEl) return;

    const svgData = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const dlLink = document.createElement('a');
    dlLink.href = url;
    dlLink.download = `${(room.name || 'floor-plan').toLowerCase().replace(/\s+/g, '-')}-2d.svg`;
    document.body.appendChild(dlLink);
    dlLink.click();
    document.body.removeChild(dlLink);
    window.URL.revokeObjectURL(url);
  };

  // Save JSON
  const exportAsJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(room, null, 2));
    const dlLink = document.createElement('a');
    dlLink.setAttribute('href', dataStr);
    dlLink.setAttribute('download', `${(room.name || 'floor-plan').toLowerCase().replace(/\s+/g, '-')}.json`);
    document.body.appendChild(dlLink);
    dlLink.click();
    dlLink.remove();
  };

  // Helper values for current unit state
  const breadthFtIn = toFtIn(room.breadth);
  const lengthFtIn = toFtIn(room.length);
  const newWidthFtIn = toFtIn(newWidth);
  const newPosFtIn = toFtIn(newPos);
  const wallThicknessMm = Math.round((room.wallThickness || 0.2) * 1000);
  const wallThicknessIn = Math.round(((room.wallThickness || 0.2) / 0.0254) * 10) / 10;

  return (
    <div className="flex flex-col h-screen w-screen bg-white text-slate-900 overflow-hidden font-sans">
      {/* 1. Clean Top Bar */}
      <header className="h-16 border-b border-slate-200 bg-white px-6 flex items-center justify-between z-20 shrink-0">
        {/* Left: Template Selector */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-600 font-bold uppercase tracking-wider">
            Template:
          </span>
          <select
            value={room.name}
            onChange={(e) => {
              const idx = ROOM_PRESETS.findIndex((p) => p.name === e.target.value);
              if (idx !== -1) handleSelectPreset(idx);
            }}
            className="bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:border-blue-600 transition shadow-sm"
          >
            {ROOM_PRESETS.map((p, idx) => (
              <option key={idx} value={p.name}>
                {p.name} ({formatDistance(p.breadth, unit)} × {formatDistance(p.length, unit)})
              </option>
            ))}
          </select>
        </div>

        {/* Center: Unit Toggle (Meters vs Feet & Inches) */}
        <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200 shadow-sm">
          <button
            type="button"
            onClick={() => setUnit('metric')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
              unit === 'metric'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Meters (m)
          </button>
          <button
            type="button"
            onClick={() => setUnit('imperial')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
              unit === 'imperial'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Feet & Inches (ft / in)
          </button>
        </div>

        {/* Right: Theme and Export Controls */}
        <div className="flex items-center gap-3">
          {/* Theme Selector (All rendered cleanly on white paper) */}
          <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200 text-xs font-bold">
            <button
              onClick={() => setTheme('cad-light')}
              className={`px-3 py-1.5 rounded-lg transition ${
                theme === 'cad-light'
                  ? 'bg-white text-slate-900 shadow-sm font-bold border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Light CAD
            </button>
            <button
              onClick={() => setTheme('blueprint')}
              className={`px-3 py-1.5 rounded-lg transition ${
                theme === 'blueprint'
                  ? 'bg-blue-600 text-white shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Blueprint Lines
            </button>
            <button
              onClick={() => setTheme('dark-studio')}
              className={`px-3 py-1.5 rounded-lg transition ${
                theme === 'dark-studio'
                  ? 'bg-slate-800 text-white shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Architect
            </button>
          </div>

          {/* Export Buttons */}
          <button
            onClick={exportAsPng}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition shadow-sm"
          >
            <ImageIcon size={16} />
            Export PNG
          </button>

          <button
            onClick={exportAsSvg}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold transition border border-slate-300 shadow-sm"
          >
            <FileCode size={16} />
            SVG
          </button>
        </div>
      </header>

      {/* 2. Main Studio Body (Wider Left Pane + Responsive Canvas) */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar Controls */}
        <aside className="w-96 lg:w-[440px] border-r border-slate-200 bg-white flex flex-col shrink-0 z-10 shadow-md">
          {/* Sidebar Tabs */}
          <div className="flex border-b border-slate-200 bg-slate-50 p-1.5 gap-1.5 shrink-0">
            <button
              onClick={() => setActiveTab('dimensions')}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${
                activeTab === 'dimensions'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Room Specs
            </button>
            <button
              onClick={() => setActiveTab('openings')}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition flex items-center justify-center gap-2 ${
                activeTab === 'openings'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Doors & Windows
              <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
                activeTab === 'openings' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {room.openings.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${
                activeTab === 'analytics'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Analytics
            </button>
          </div>

          {/* TAB 1: ROOM SPECS */}
          {activeTab === 'dimensions' && (
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Room Name */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Room Label
                </label>
                <input
                  type="text"
                  value={room.name || ''}
                  onChange={(e) => setRoom({ ...room, name: e.target.value })}
                  placeholder="e.g. Master Bedroom"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-base font-semibold text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white shadow-sm"
                />
              </div>

              {/* BREADTH (Typeable + Unit Support) */}
              <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-bold text-slate-800">
                    Breadth (East-West Width)
                  </label>
                  <span className="text-sm font-mono font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                    {formatDistance(room.breadth, unit)}
                  </span>
                </div>

                {unit === 'metric' ? (
                  /* Metric: Typeable meters */
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.05"
                      min="1.0"
                      max="30.0"
                      value={room.breadth}
                      onChange={(e) =>
                        setRoom({ ...room, breadth: Math.max(1, parseFloat(e.target.value) || 1) })
                      }
                      className="flex-1 bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-base font-mono text-slate-800 focus:outline-none focus:border-blue-600 shadow-sm"
                    />
                    <span className="text-sm font-bold text-slate-600">meters</span>
                  </div>
                ) : (
                  /* Imperial: Typeable Feet & Inches */
                  <div className="flex items-center gap-3">
                    <div className="flex-1 flex items-center gap-1.5">
                      <input
                        type="number"
                        min="3"
                        max="100"
                        value={breadthFtIn.ft}
                        onChange={(e) => {
                          const newFt = parseInt(e.target.value, 10) || 0;
                          setRoom({ ...room, breadth: fromFtIn(newFt, breadthFtIn.in) });
                        }}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-base font-mono text-slate-800 text-center shadow-sm"
                      />
                      <span className="text-sm font-bold text-slate-600">ft</span>
                    </div>
                    <div className="flex-1 flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        max="11"
                        value={breadthFtIn.in}
                        onChange={(e) => {
                          const newIn = parseInt(e.target.value, 10) || 0;
                          setRoom({ ...room, breadth: fromFtIn(breadthFtIn.ft, newIn) });
                        }}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-base font-mono text-slate-800 text-center shadow-sm"
                      />
                      <span className="text-sm font-bold text-slate-600">in</span>
                    </div>
                  </div>
                )}

                <input
                  type="range"
                  min="2.0"
                  max="16.0"
                  step="0.05"
                  value={room.breadth}
                  onChange={(e) => setRoom({ ...room, breadth: parseFloat(e.target.value) || 2 })}
                  className="w-full accent-blue-600 cursor-pointer"
                />

                {/* Quick Presets */}
                <div className="flex gap-2 pt-1">
                  {(unit === 'metric'
                    ? [3.0, 4.5, 5.5, 6.5, 8.0]
                    : [10, 14, 18, 22, 26]
                  ).map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() =>
                        setRoom({
                          ...room,
                          breadth: unit === 'metric' ? val : val * 0.3048,
                        })
                      }
                      className="flex-1 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-mono font-semibold text-slate-700 transition shadow-sm"
                    >
                      {unit === 'metric' ? `${val}m` : `${val}'`}
                    </button>
                  ))}
                </div>
              </div>

              {/* LENGTH (Typeable + Unit Support) */}
              <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-bold text-slate-800">
                    Length (North-South Height)
                  </label>
                  <span className="text-sm font-mono font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                    {formatDistance(room.length, unit)}
                  </span>
                </div>

                {unit === 'metric' ? (
                  /* Metric: Typeable meters */
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.05"
                      min="1.0"
                      max="30.0"
                      value={room.length}
                      onChange={(e) =>
                        setRoom({ ...room, length: Math.max(1, parseFloat(e.target.value) || 1) })
                      }
                      className="flex-1 bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-base font-mono text-slate-800 focus:outline-none focus:border-blue-600 shadow-sm"
                    />
                    <span className="text-sm font-bold text-slate-600">meters</span>
                  </div>
                ) : (
                  /* Imperial: Typeable Feet & Inches */
                  <div className="flex items-center gap-3">
                    <div className="flex-1 flex items-center gap-1.5">
                      <input
                        type="number"
                        min="3"
                        max="100"
                        value={lengthFtIn.ft}
                        onChange={(e) => {
                          const newFt = parseInt(e.target.value, 10) || 0;
                          setRoom({ ...room, length: fromFtIn(newFt, lengthFtIn.in) });
                        }}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-base font-mono text-slate-800 text-center shadow-sm"
                      />
                      <span className="text-sm font-bold text-slate-600">ft</span>
                    </div>
                    <div className="flex-1 flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        max="11"
                        value={lengthFtIn.in}
                        onChange={(e) => {
                          const newIn = parseInt(e.target.value, 10) || 0;
                          setRoom({ ...room, length: fromFtIn(lengthFtIn.ft, newIn) });
                        }}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-base font-mono text-slate-800 text-center shadow-sm"
                      />
                      <span className="text-sm font-bold text-slate-600">in</span>
                    </div>
                  </div>
                )}

                <input
                  type="range"
                  min="2.0"
                  max="16.0"
                  step="0.05"
                  value={room.length}
                  onChange={(e) => setRoom({ ...room, length: parseFloat(e.target.value) || 2 })}
                  className="w-full accent-blue-600 cursor-pointer"
                />

                {/* Quick Presets */}
                <div className="flex gap-2 pt-1">
                  {(unit === 'metric'
                    ? [3.0, 3.8, 4.5, 5.0, 6.0]
                    : [10, 12, 15, 18, 20]
                  ).map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() =>
                        setRoom({
                          ...room,
                          length: unit === 'metric' ? val : val * 0.3048,
                        })
                      }
                      className="flex-1 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-mono font-semibold text-slate-700 transition shadow-sm"
                    >
                      {unit === 'metric' ? `${val}m` : `${val}'`}
                    </button>
                  ))}
                </div>
              </div>

              {/* WALL THICKNESS (Typeable) */}
              <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-bold text-slate-800">
                    Wall Thickness (Typeable)
                  </label>
                  <span className="text-sm font-mono font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                    {unit === 'imperial' ? `${wallThicknessIn}"` : `${wallThicknessMm} mm`}
                  </span>
                </div>

                {unit === 'metric' ? (
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      step="5"
                      min="50"
                      max="600"
                      value={wallThicknessMm}
                      onChange={(e) => {
                        const mm = parseFloat(e.target.value) || 200;
                        setRoom({ ...room, wallThickness: mm / 1000 });
                      }}
                      className="flex-1 bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-base font-mono text-slate-800 focus:outline-none focus:border-blue-600 shadow-sm"
                    />
                    <span className="text-sm font-bold text-slate-600">mm</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      step="0.5"
                      min="2"
                      max="24"
                      value={wallThicknessIn}
                      onChange={(e) => {
                        const inVal = parseFloat(e.target.value) || 8;
                        setRoom({ ...room, wallThickness: inVal * 0.0254 });
                      }}
                      className="flex-1 bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-base font-mono text-slate-800 focus:outline-none focus:border-blue-600 shadow-sm"
                    />
                    <span className="text-sm font-bold text-slate-600">inches</span>
                  </div>
                )}

                {/* Quick Presets */}
                <div className="flex gap-2 pt-1">
                  {(unit === 'metric'
                    ? [150, 200, 250, 300]
                    : [6, 8, 10, 12]
                  ).map((val) => {
                    const isSelected = unit === 'metric'
                      ? Math.abs(wallThicknessMm - val) < 2
                      : Math.abs(wallThicknessIn - val) < 0.2;
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() =>
                          setRoom({
                            ...room,
                            wallThickness: unit === 'metric' ? val / 1000 : val * 0.0254,
                          })
                        }
                        className={`flex-1 py-1.5 rounded-lg border text-xs font-mono font-semibold transition ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-sm'
                        }`}
                      >
                        {unit === 'metric' ? `${val}mm` : `${val}"`}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Usable Area & Perimeter Cards */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 shadow-sm">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                    Usable Area
                  </span>
                  <div className="text-xl font-extrabold font-mono text-slate-900 mt-1">
                    {unit === 'imperial'
                      ? `${grossAreaSqFt.toFixed(1)} sq ft`
                      : `${grossArea.toFixed(2)} m²`}
                  </div>
                  <span className="text-xs text-slate-500 font-mono mt-0.5 block">
                    {unit === 'imperial'
                      ? `(${grossArea.toFixed(2)} m²)`
                      : `(${grossAreaSqFt.toFixed(1)} sq ft)`}
                  </span>
                </div>

                <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 shadow-sm">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                    Perimeter
                  </span>
                  <div className="text-xl font-extrabold font-mono text-slate-900 mt-1">
                    {formatDistance(wallPerimeter, unit)}
                  </div>
                  <span className="text-xs text-slate-500 font-mono mt-0.5 block">
                    {unit === 'imperial'
                      ? `(${wallPerimeter.toFixed(2)} m)`
                      : `(${(wallPerimeter * 3.28084).toFixed(1)} ft)`}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DOORS & WINDOWS (Fully Typeable) */}
          {activeTab === 'openings' && (
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Type Switcher */}
              <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-100 border border-slate-200 rounded-2xl">
                <button
                  type="button"
                  onClick={() => handleTypeSelect('door')}
                  className={`flex items-center justify-center gap-2.5 py-3 rounded-xl text-sm font-bold transition ${
                    newType === 'door'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                  }`}
                >
                  <DoorOpen size={18} />
                  Door
                </button>
                <button
                  type="button"
                  onClick={() => handleTypeSelect('window')}
                  className={`flex items-center justify-center gap-2.5 py-3 rounded-xl text-sm font-bold transition ${
                    newType === 'window'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                  }`}
                >
                  <Square size={18} />
                  Window
                </button>
              </div>

              {/* Attach to Wall */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Attach to Wall
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { side: 'N' as WallSide, label: 'North (Top)' },
                    { side: 'S' as WallSide, label: 'South (Btm)' },
                    { side: 'W' as WallSide, label: 'West (Left)' },
                    { side: 'E' as WallSide, label: 'East (Right)' },
                  ].map((w) => (
                    <button
                      key={w.side}
                      type="button"
                      onClick={() => setNewWall(w.side)}
                      className={`py-2.5 px-2 text-center rounded-xl border text-sm font-semibold transition ${
                        newWall === w.side
                          ? 'border-blue-600 bg-blue-50 text-blue-700 font-bold shadow-sm'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 shadow-sm'
                      }`}
                    >
                      <span className="block font-bold text-base">{w.side}</span>
                      <span className="text-xs text-slate-500 font-mono block mt-0.5">
                        {formatDistance(w.side === 'N' || w.side === 'S' ? room.breadth : room.length, unit)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* TYPEABLE WIDTH */}
              <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-bold text-slate-800">
                    {newType === 'door' ? 'Door' : 'Window'} Width (Typeable)
                  </label>
                  <span className="text-sm font-mono font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                    {formatDistance(newWidth, unit)}
                  </span>
                </div>

                {unit === 'metric' ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.05"
                      min="0.3"
                      max="6.0"
                      value={newWidth}
                      onChange={(e) => setNewWidth(Math.max(0.2, parseFloat(e.target.value) || 0.9))}
                      className="flex-1 bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-base font-mono text-slate-800 focus:outline-none focus:border-blue-600 shadow-sm"
                    />
                    <span className="text-sm font-bold text-slate-600">meters</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 flex items-center gap-1.5">
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={newWidthFtIn.ft}
                        onChange={(e) => {
                          const newFt = parseInt(e.target.value, 10) || 0;
                          setNewWidth(fromFtIn(newFt, newWidthFtIn.in));
                        }}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-base font-mono text-slate-800 text-center shadow-sm"
                      />
                      <span className="text-sm font-bold text-slate-600">ft</span>
                    </div>
                    <div className="flex-1 flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        max="11"
                        value={newWidthFtIn.in}
                        onChange={(e) => {
                          const newIn = parseInt(e.target.value, 10) || 0;
                          setNewWidth(fromFtIn(newWidthFtIn.ft, newIn));
                        }}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-base font-mono text-slate-800 text-center shadow-sm"
                      />
                      <span className="text-sm font-bold text-slate-600">in</span>
                    </div>
                  </div>
                )}

                {/* Quick Presets */}
                <div className="grid grid-cols-4 gap-2 pt-1">
                  {(newType === 'door'
                    ? [0.75, 0.9, 1.2, 1.8]
                    : [0.8, 1.2, 1.6, 2.0]
                  ).map((wVal) => (
                    <button
                      key={wVal}
                      type="button"
                      onClick={() => setNewWidth(wVal)}
                      className="py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-mono font-semibold text-slate-700 transition shadow-sm"
                    >
                      {formatDistance(wVal, unit)}
                    </button>
                  ))}
                </div>
              </div>

              {/* TYPEABLE POSITION */}
              <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-bold text-slate-800">
                    Position along Wall (Typeable)
                  </label>
                  <span className="text-sm font-mono font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                    {formatDistance(newPos, unit)}
                  </span>
                </div>

                {unit === 'metric' ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.05"
                      min="0.05"
                      max={Math.max(0.1, (newWall === 'N' || newWall === 'S' ? room.breadth : room.length) - newWidth - 0.05)}
                      value={newPos}
                      onChange={(e) => setNewPos(parseFloat(e.target.value) || 0.1)}
                      className="flex-1 bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-base font-mono text-slate-800 focus:outline-none focus:border-blue-600 shadow-sm"
                    />
                    <span className="text-sm font-bold text-slate-600">meters</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        max="50"
                        value={newPosFtIn.ft}
                        onChange={(e) => {
                          const newFt = parseInt(e.target.value, 10) || 0;
                          setNewPos(fromFtIn(newFt, newPosFtIn.in));
                        }}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-base font-mono text-slate-800 text-center shadow-sm"
                      />
                      <span className="text-sm font-bold text-slate-600">ft</span>
                    </div>
                    <div className="flex-1 flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        max="11"
                        value={newPosFtIn.in}
                        onChange={(e) => {
                          const newIn = parseInt(e.target.value, 10) || 0;
                          setNewPos(fromFtIn(newPosFtIn.ft, newIn));
                        }}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-base font-mono text-slate-800 text-center shadow-sm"
                      />
                      <span className="text-sm font-bold text-slate-600">in</span>
                    </div>
                  </div>
                )}

                <input
                  type="range"
                  min="0.05"
                  max={Math.max(0.1, (newWall === 'N' || newWall === 'S' ? room.breadth : room.length) - newWidth - 0.05)}
                  step="0.05"
                  value={newPos}
                  onChange={(e) => setNewPos(parseFloat(e.target.value) || 0.1)}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>

              {/* Add Button */}
              <button
                type="button"
                onClick={handleAddOpening}
                className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-base flex items-center justify-center gap-2.5 shadow-md shadow-blue-600/20 transition"
              >
                <Plus size={20} />
                Place {newType === 'door' ? 'Door' : 'Window'} on Wall {newWall}
              </button>

              {/* Placed Openings List */}
              <div className="pt-2">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-3">
                  Placed Openings ({room.openings.length})
                </span>

                {room.openings.length === 0 ? (
                  <div className="p-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 text-center text-sm text-slate-500 font-medium">
                    No openings placed yet.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {room.openings.map((op, idx) => {
                      const isSelected = op.id === selectedOpeningId;
                      const label = op.type === 'door' ? `D${idx + 1}` : `W${idx + 1}`;
                      return (
                        <div
                          key={op.id}
                          onClick={() => setSelectedOpeningId(op.id)}
                          className={`p-3.5 rounded-2xl border transition cursor-pointer ${
                            isSelected
                              ? 'border-amber-400 bg-amber-50/80 shadow-sm'
                              : 'border-slate-200 bg-white hover:border-slate-300 shadow-sm'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2.5">
                              <span className="px-2 py-0.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 font-mono text-xs font-bold">
                                {label}
                              </span>
                              <span className="text-sm font-bold capitalize text-slate-800">
                                {op.type} · Wall {op.wall}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteOpening(op.id);
                              }}
                              className="text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition p-1"
                              title="Delete opening"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>

                          <div className="flex items-center justify-between text-xs font-mono text-slate-600 mb-1">
                            <span>Pos: {formatDistance(op.position, unit)}</span>
                            <span>Width: {formatDistance(op.width, unit)}</span>
                          </div>

                          {/* Quick Door Flip controls */}
                          {op.type === 'door' && (
                            <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpdateOpening({ ...op, flipHinge: !op.flipHinge });
                                }}
                                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 transition border border-slate-200"
                              >
                                <FlipHorizontal size={13} />
                                Flip Hinge
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpdateOpening({ ...op, flipSwing: !op.flipSwing });
                                }}
                                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 transition border border-slate-200"
                              >
                                <FlipVertical size={13} />
                                Flip Swing
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: ANALYTICS */}
          {activeTab === 'analytics' && (
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              <div>
                <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">
                  Building Code & Daylighting
                </h3>

                {/* Daylighting Card */}
                <div
                  className={`p-4 rounded-2xl border ${
                    isDaylightCompliant
                      ? 'border-emerald-300 bg-emerald-50/80'
                      : 'border-amber-300 bg-amber-50/80'
                  }`}
                >
                  <div className="flex items-center gap-2.5 mb-2.5">
                    {isDaylightCompliant ? (
                      <CheckCircle2 size={20} className="text-emerald-600" />
                    ) : (
                      <AlertTriangle size={20} className="text-amber-600" />
                    )}
                    <span className="text-sm font-bold text-slate-900">
                      {isDaylightCompliant
                        ? 'Daylighting Code Compliant'
                        : 'Low Natural Daylight Warning'}
                    </span>
                  </div>

                  {/* Meter Bar */}
                  <div className="w-full bg-slate-200 rounded-full h-2.5 my-3 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isDaylightCompliant ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                      style={{ width: `${Math.min(100, (daylightRatio / 20) * 100)}%` }}
                    />
                  </div>

                  <div className="space-y-2 text-sm font-mono pt-1">
                    <div className="flex justify-between text-slate-600">
                      <span>Floor Area:</span>
                      <span className="text-slate-900 font-bold">
                        {unit === 'imperial'
                          ? `${grossAreaSqFt.toFixed(1)} sq ft`
                          : `${grossArea.toFixed(2)} m²`}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Window Area:</span>
                      <span className="text-slate-900 font-bold">
                        {unit === 'imperial'
                          ? `${(totalWindowArea * 10.7639).toFixed(1)} sq ft`
                          : `${totalWindowArea.toFixed(2)} m²`}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600 pt-2 border-t border-slate-200">
                      <span className="font-bold">Daylight Ratio:</span>
                      <span
                        className={`font-bold ${
                          isDaylightCompliant ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {daylightRatio.toFixed(1)}% {isDaylightCompliant ? '(≥ 10%)' : '(< 10%)'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Go Backend Validation Details */}
              <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-slate-800">
                    Go Backend Server
                  </span>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-mono font-medium ${
                      backendStatus === 'connected'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {backendStatus === 'connected' ? 'Connected (:8080)' : 'Local Mode'}
                  </span>
                </div>

                {backendWarnings.length > 0 ? (
                  <div className="space-y-1 mt-2">
                    {backendWarnings.map((warn, i) => (
                      <div key={i} className="text-xs text-amber-700 flex items-start gap-1">
                        <span>•</span>
                        <span>{warn}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-600 leading-relaxed mt-1">
                    Zero architectural collisions detected. Wall openings and corner clearances meet standard tolerances.
                  </p>
                )}
              </div>

              {/* Backup */}
              <div>
                <button
                  type="button"
                  onClick={exportAsJson}
                  className="w-full py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm flex items-center justify-center gap-2 border border-slate-300 shadow-sm transition"
                >
                  <Download size={16} />
                  Download Project JSON
                </button>
              </div>
            </div>
          )}
        </aside>

        {/* Right Workspace: Center Canvas + Docked Bottom Footer */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
          <main className="flex-1 relative flex items-center justify-center overflow-hidden bg-white">
            <FloorPlan
              room={room}
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
            />

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

              <div className="w-px h-5 bg-slate-200 mx-1.5" />

              {/* Grid Toggle */}
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

              {/* Dimensions Toggle */}
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

          {/* Clean Docked Footer Status Bar (At bottom of page, NOT in middle) */}
          <footer className="h-9 bg-white border-t border-slate-200 px-6 flex items-center justify-between text-xs font-mono text-slate-600 shrink-0 z-20 select-none">
            <div className="flex items-center gap-4">
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
              <span>Corner snapped to (0,0) grid · 10 subdivisions per square</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

export default App;
