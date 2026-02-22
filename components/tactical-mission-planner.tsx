"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import L from "leaflet";
import {
  Navigation, Crosshair, Anchor, Radio, Shield, AlertTriangle, Target,
  MapPin, Play, Pause, Trash2, Settings, Globe2, Activity, RefreshCw, Radar,
  Eye, EyeOff, Layers, Waves, Wind, Zap, ChevronDown,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════
interface Waypoint {
  id: string; lat: number; lng: number; label: string;
  type: "waypoint" | "patrol" | "strike" | "rendezvous" | "refuel";
  notes: string; marker?: L.Marker; circle?: L.Circle;
}
interface ThreatZone {
  lat: number; lon: number; radius: number;
  level: "low" | "medium" | "high" | "critical";
  name: string; threatLevel: number;
}
interface ApiZone {
  id: string; name: string; lat: number; lon: number; command: string; hq: string;
  threat: { level: number; category: string; factors: { name: string; score: number; detail: string }[] };
  marine: any; weather: any;
  ops: { operation: string; ready: boolean; confidence: number; status: string; conditions: string }[];
}
interface IntelResponse {
  timestamp: string; zones: ApiZone[];
  summary: { totalZones: number; criticalZones: number; highZones: number; moderateZones: number; lowZones: number; avgThreat: number; overallReadiness: number };
  brief: string;
}
interface MissionProfile {
  name: string; type: "patrol" | "strike" | "recon" | "escort" | "blockade";
  vessel: string; speed: number; fuelCapacity: number; maxRange: number;
  armament: string; crew: number; displacement: string;
}

// ═══════════════════════════════════════════════════════════
// MISSION PROFILES (real Indian Navy vessels)
// ═══════════════════════════════════════════════════════════
const MISSION_PROFILES: MissionProfile[] = [
  { name: "Long Range Patrol", type: "patrol", vessel: "INS Shivalik (P-17)", speed: 18, fuelCapacity: 4000, maxRange: 5500, armament: "BrahMos, 76mm OTO, Barak-1", crew: 257, displacement: "6,200t" },
  { name: "Strike Mission", type: "strike", vessel: "INS Kolkata (P-15A)", speed: 30, fuelCapacity: 3200, maxRange: 4200, armament: "BrahMos x16, Barak-8 x32", crew: 325, displacement: "7,500t" },
  { name: "Submarine Recon", type: "recon", vessel: "INS Arihant (SSBN)", speed: 12, fuelCapacity: 999999, maxRange: 999999, armament: "K-15 SLBM x12, 533mm Torpedoes", crew: 95, displacement: "6,000t" },
  { name: "Carrier Escort", type: "escort", vessel: "INS Vikrant CBG", speed: 16, fuelCapacity: 8000, maxRange: 7500, armament: "MiG-29K x26, KA-31 x10, Barak-8", crew: 1600, displacement: "45,000t" },
  { name: "Naval Blockade", type: "blockade", vessel: "Task Force Bravo", speed: 14, fuelCapacity: 5000, maxRange: 4800, armament: "Mixed — 3 DDG + 2 FFG + 1 SSK", crew: 1800, displacement: "Combined 32,000t" },
];

// ═══════════════════════════════════════════════════════════
// NAVAL MARKERS (real locations)
// ═══════════════════════════════════════════════════════════
interface NavalMarker { lat: number; lng: number; name: string; type: "base" | "port" | "choke" | "airfield"; details: string; }
const MARKERS: NavalMarker[] = [
  { lat: 18.94, lng: 72.84, name: "Mumbai (WNC HQ)", type: "base", details: "Western Naval Command Headquarters" },
  { lat: 14.82, lng: 74.12, name: "Karwar (Project Seabird)", type: "base", details: "Largest naval base in Indian Ocean — INS Kadamba" },
  { lat: 9.97, lng: 76.27, name: "Kochi (SNC HQ)", type: "base", details: "Southern Naval Command — Training Command" },
  { lat: 17.70, lng: 83.30, name: "Visakhapatnam (ENC HQ)", type: "base", details: "Eastern Naval Command HQ — Submarine Arm" },
  { lat: 6.83, lng: 93.93, name: "INS Baaz (Campbell Bay)", type: "airfield", details: "Southernmost air station — A&N Islands" },
  { lat: 11.67, lng: 92.73, name: "Port Blair (A&N Command)", type: "base", details: "Andaman & Nicobar Command — Tri-service" },
  { lat: 10.00, lng: 76.27, name: "INS Garuda (Kochi NAS)", type: "airfield", details: "Naval Air Station — P-8I, MiG-29K" },
  { lat: 19.09, lng: 72.87, name: "INS Hansa (Dabolim NAS)", type: "airfield", details: "Naval Air Station Goa — MiG-29K OTU" },
  { lat: 13.08, lng: 80.28, name: "Chennai", type: "port", details: "Major commercial port — Eastern seaboard" },
  { lat: 15.41, lng: 73.88, name: "Goa (Mormugao)", type: "port", details: "Naval Dockyard — Fleet maintenance" },
  { lat: 4.17, lng: 73.51, name: "Malé (Maldives)", type: "port", details: "Republic of Maldives — Strategic partner" },
  { lat: 6.93, lng: 79.85, name: "Colombo", type: "port", details: "Sri Lanka — Key shipping hub" },
  { lat: 25.27, lng: 55.30, name: "Dubai (Jebel Ali)", type: "port", details: "UAE — Largest port in Middle East" },
  { lat: 23.61, lng: 58.54, name: "Muscat", type: "port", details: "Oman — Strategic ally at Hormuz approach" },
  { lat: 11.59, lng: 43.15, name: "Djibouti", type: "port", details: "Horn of Africa — Anti-piracy operations" },
  { lat: 1.29, lng: 103.85, name: "Singapore (Changi NB)", type: "port", details: "Key transit port — Malacca Strait" },
  { lat: 12.63, lng: 45.03, name: "Bab el-Mandeb", type: "choke", details: "Chokepoint — 20nm wide — Red Sea entry" },
  { lat: 26.60, lng: 56.50, name: "Strait of Hormuz", type: "choke", details: "Chokepoint — 21nm wide — 40% global oil" },
  { lat: 2.50, lng: 101.40, name: "Malacca Strait", type: "choke", details: "Chokepoint — 1.5nm narrowest — 25% global trade" },
  { lat: -8.40, lng: 115.70, name: "Lombok Strait", type: "choke", details: "Alternative to Malacca — Deep water passage" },
  { lat: 21.15, lng: 72.68, name: "Surat", type: "port", details: "Gujarat — Growing commercial port" },
  { lat: 12.91, lng: 74.86, name: "Mangalore (New Mangalore)", type: "port", details: "Karnataka — Oil imports hub" },
  { lat: 8.48, lng: 76.95, name: "Thiruvananthapuram", type: "port", details: "Kerala — Vizhinjam deep-water port (under construction)" },
];

// Shipping lanes (real routes)
const SHIPPING_LANES: [number, number][][] = [
  [[25.0,56.5],[22.0,60.0],[18.0,65.0],[15.0,70.0],[10.0,76.0],[6.0,80.0],[2.0,98.0],[1.5,103.5]], // Gulf-Malacca
  [[12.5,44.0],[12.0,50.0],[10.0,55.0],[8.0,60.0],[6.0,70.0],[5.0,73.5],[4.0,80.0],[2.0,95.0]], // Suez-SE Asia
  [[18.0,72.5],[15.0,73.5],[10.0,76.0],[8.0,77.5],[6.5,80.0],[5.0,85.0],[6.0,90.0],[8.0,93.0],[10.0,98.0]], // India West-East
  [[12.5,44.0],[10.0,51.0],[8.0,60.0],[9.0,72.0],[15.0,73.5],[18.0,72.8]], // E Africa-Mumbai
  [[-6.0,39.0],[-4.0,45.0],[-2.0,50.0],[0.0,60.0],[2.0,73.0],[5.0,80.0],[1.0,103.5]], // Cape route feeder
];

// EEZ boundaries (approximate)
const EEZ_LINES: [number, number][][] = [
  [[24.0,65.0],[22.0,62.0],[18.0,64.0],[15.0,65.0],[12.0,67.0],[8.0,72.0],[5.0,75.0],[5.0,80.0],[7.0,84.0],[10.0,86.0],[14.0,85.0],[17.0,86.0],[20.0,88.5],[22.0,90.0]],
  [[24.0,65.0],[25.0,68.0],[23.0,69.0],[20.0,66.0],[18.0,64.0]],
  [[3.0,71.5],[5.0,74.0],[7.0,72.0],[5.0,70.0],[3.0,71.5]], // Lakshadweep EEZ
];

// ═══════════════════════════════════════════════════════════
// MAP TILE LAYERS
// ═══════════════════════════════════════════════════════════
const TILE_LAYERS = {
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com">CARTO</a>',
    name: "Dark (Tactical)",
    subdomains: "abcd",
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: '&copy; Esri, Maxar, Earthstar Geographics',
    name: "Satellite",
    subdomains: undefined,
  },
  ocean: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: '&copy; Esri, GEBCO, NOAA',
    name: "Ocean Chart",
    subdomains: undefined,
  },
  topo: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    name: "Street Map",
    subdomains: "abc",
  },
};

// ═══════════════════════════════════════════════════════════
// WAYPOINT COLORS & ICONS
// ═══════════════════════════════════════════════════════════
const WP_COLORS: Record<Waypoint["type"], string> = {
  waypoint: "#10b981",
  patrol: "#06b6d4",
  strike: "#ef4444",
  rendezvous: "#a78bfa",
  refuel: "#eab308",
};

function createWaypointIcon(type: Waypoint["type"], index: number, selected: boolean) {
  const color = WP_COLORS[type];
  const size = selected ? 32 : 24;
  const border = selected ? `3px solid ${color}` : `2px solid ${color}`;
  const glow = selected ? `0 0 12px ${color}88, 0 0 4px ${color}66` : `0 0 6px ${color}44`;

  const shape = type === "strike" ? "polygon(50% 0%, 100% 100%, 0% 100%)" :
                type === "patrol" ? "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" :
                "circle(50%)";

  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${color}cc;
      clip-path:${shape};
      border:${border};
      box-shadow:${glow};
      display:flex;align-items:center;justify-content:center;
      color:#fff;font-size:${selected ? 11 : 9}px;font-weight:bold;font-family:monospace;
      position:relative;
    "><span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-shadow:0 0 4px #000">${index + 1}</span></div>`,
  });
}

function createNavalIcon(type: NavalMarker["type"]) {
  const colors: Record<string, string> = { base: "#06b6d4", port: "#94a3b8", choke: "#f97316", airfield: "#a78bfa" };
  const icons: Record<string, string> = { base: "◆", port: "●", choke: "▲", airfield: "✦" };
  const c = colors[type] || "#94a3b8";
  const ic = icons[type] || "●";
  return L.divIcon({
    className: "",
    iconSize: [12, 12],
    iconAnchor: [6, 6],
    html: `<div style="color:${c};font-size:12px;text-shadow:0 0 6px ${c}88;line-height:1">${ic}</div>`,
  });
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════
export function TacticalMissionPlanner() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const simMarkerRef = useRef<L.Marker | null>(null);
  const simTrailRef = useRef<L.Polyline | null>(null);
  const threatLayersRef = useRef<L.LayerGroup | null>(null);
  const markerLayersRef = useRef<L.LayerGroup | null>(null);
  const shippingLayersRef = useRef<L.LayerGroup | null>(null);
  const eezLayersRef = useRef<L.LayerGroup | null>(null);
  const wpLayersRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const [intel, setIntel] = useState<IntelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [threatZones, setThreatZones] = useState<ThreatZone[]>([]);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [selectedWp, setSelectedWp] = useState<string | null>(null);
  const [wpType, setWpType] = useState<Waypoint["type"]>("waypoint");
  const [missionProfile, setMissionProfile] = useState<MissionProfile>(MISSION_PROFILES[0]);
  const [simulating, setSimulating] = useState(false);
  const [simProgress, setSimProgress] = useState(0);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showShipping, setShowShipping] = useState(true);
  const [showEEZ, setShowEEZ] = useState(true);
  const [showThreats, setShowThreats] = useState(true);
  const [tileType, setTileType] = useState<keyof typeof TILE_LAYERS>("topo");
  const [cursorPos, setCursorPos] = useState<{lat: number; lng: number} | null>(null);

  // ── Fetch intel ──
  const fetchIntel = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/intelligence");
      if (!res.ok) throw new Error("Intel API failed");
      const data: IntelResponse = await res.json();
      setIntel(data);
      setThreatZones(data.zones.map(z => ({
        lat: z.lat, lon: z.lon,
        radius: 120000 + z.threat.level * 2500, // meters
        level: z.threat.level >= 75 ? "critical" : z.threat.level >= 50 ? "high" : z.threat.level >= 25 ? "medium" : "low",
        name: z.name, threatLevel: z.threat.level,
      })));
    } catch (e) { console.error("Intel fetch:", e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchIntel(); }, [fetchIntel]);
  useEffect(() => { const iv = setInterval(fetchIntel, 60000); return () => clearInterval(iv); }, [fetchIntel]);

  // ── Route calculations ──
  const routeStats = useMemo(() => {
    if (waypoints.length < 2) return { distance: 0, eta: "—", fuel: 0, legs: 0 };
    let dist = 0;
    for (let i = 1; i < waypoints.length; i++) {
      const p1 = L.latLng(waypoints[i - 1].lat, waypoints[i - 1].lng);
      const p2 = L.latLng(waypoints[i].lat, waypoints[i].lng);
      dist += p1.distanceTo(p2) / 1852; // meters to nautical miles
    }
    const hours = dist / missionProfile.speed;
    const etaH = Math.floor(hours);
    const etaM = Math.round((hours - etaH) * 60);
    const fuel = dist * (missionProfile.fuelCapacity / missionProfile.maxRange);
    return { distance: Math.round(dist), eta: `${etaH}h ${etaM}m`, fuel: Math.round(fuel), legs: waypoints.length - 1 };
  }, [waypoints, missionProfile]);

  // Threat assessment for each leg
  const legThreats = useMemo(() => {
    if (waypoints.length < 2) return [];
    return waypoints.slice(1).map((wp, i) => {
      const prev = waypoints[i];
      let maxThreat = 0;
      let nearestZone = "";
      threatZones.forEach(z => {
        // Check midpoint of leg proximity to threat zone
        const midLat = (prev.lat + wp.lat) / 2;
        const midLng = (prev.lng + wp.lng) / 2;
        const dist = L.latLng(midLat, midLng).distanceTo(L.latLng(z.lat, z.lon));
        if (dist < z.radius * 1.5 && z.threatLevel > maxThreat) {
          maxThreat = z.threatLevel;
          nearestZone = z.name;
        }
      });
      return { legIndex: i, maxThreat, nearestZone };
    });
  }, [waypoints, threatZones]);

  // ── Initialize Leaflet Map ──
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [20, 78], // India-centric view for immediate visible landmass
      zoom: 5,
      minZoom: 3,
      maxZoom: 12,
      zoomControl: false,
      attributionControl: false,
    });

    // Add zoom control (top-right to avoid overlapping toolbar)
    L.control.zoom({ position: "bottomright" }).addTo(map);

    // Attribution (bottom)
    L.control.attribution({ position: "bottomleft", prefix: false }).addTo(map);

    // Set initial tile layer
    const initialLayer = TILE_LAYERS[tileType];
    const tileOptions: L.TileLayerOptions = {
      attribution: initialLayer.attribution,
      maxZoom: 19,
    };
    if (initialLayer.subdomains) tileOptions.subdomains = initialLayer.subdomains;
    const tile = L.tileLayer(initialLayer.url, tileOptions).addTo(map);
    let initialFallbackApplied = false;
    let initialTileLoaded = false;
    tile.on("tileload", () => {
      initialTileLoaded = true;
    });
    tile.on("tileerror", () => {
      if (initialFallbackApplied) return;
      initialFallbackApplied = true;
      tile.options.subdomains = "abc";
      tile.setUrl("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");
    });
    setTimeout(() => {
      if (!initialTileLoaded && !initialFallbackApplied) {
        initialFallbackApplied = true;
        tile.options.subdomains = "abc";
        tile.setUrl("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");
      }
    }, 2000);
    tileLayerRef.current = tile;

    // Layer groups
    threatLayersRef.current = L.layerGroup().addTo(map);
    markerLayersRef.current = L.layerGroup().addTo(map);
    shippingLayersRef.current = L.layerGroup().addTo(map);
    eezLayersRef.current = L.layerGroup().addTo(map);
    wpLayersRef.current = L.layerGroup().addTo(map);

    // Cursor position tracking
    map.on("mousemove", (e: L.LeafletMouseEvent) => {
      setCursorPos({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    mapRef.current = map;

    // Force map to recalculate size after CSS loads and container renders
    const timers = [
      setTimeout(() => map.invalidateSize(), 100),
      setTimeout(() => map.invalidateSize(), 300),
      setTimeout(() => map.invalidateSize(), 800),
    ];

    return () => {
      timers.forEach(clearTimeout);
      map.remove();
      mapRef.current = null;
    };
  }, [tileType]);

  // ── Tile layer switching ──
  useEffect(() => {
    if (!mapRef.current) return;
    const cfg = TILE_LAYERS[tileType];
    if (tileLayerRef.current) {
      mapRef.current.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }
    const tileOptions: L.TileLayerOptions = {
      attribution: cfg.attribution,
      maxZoom: 19,
    };
    if (cfg.subdomains) tileOptions.subdomains = cfg.subdomains;
    const nextLayer = L.tileLayer(cfg.url, tileOptions).addTo(mapRef.current);
    let fallbackApplied = false;
    let tileLoaded = false;
    nextLayer.on("tileload", () => {
      tileLoaded = true;
    });
    nextLayer.on("tileerror", () => {
      if (fallbackApplied) return;
      fallbackApplied = true;
      nextLayer.options.subdomains = "abc";
      nextLayer.setUrl("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");
    });
    setTimeout(() => {
      if (!tileLoaded && !fallbackApplied) {
        fallbackApplied = true;
        nextLayer.options.subdomains = "abc";
        nextLayer.setUrl("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");
      }
    }, 2000);
    tileLayerRef.current = nextLayer;
  }, [tileType]);

  // ── Click to add waypoints ──
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    const onClick = (e: L.LeafletMouseEvent) => {
      const id = `wp-${Date.now()}`;
      setWaypoints(prev => [
        ...prev,
        { id, lat: e.latlng.lat, lng: e.latlng.lng, label: `WP-${prev.length + 1}`, type: wpType, notes: "" },
      ]);
      setSelectedWp(id);
    };

    map.on("click", onClick);
    return () => { map.off("click", onClick); };
  }, [wpType]);

  // ── Draw threat zones ──
  useEffect(() => {
    if (!threatLayersRef.current) return;
    threatLayersRef.current.clearLayers();
    if (!showThreats) return;

    threatZones.forEach(z => {
      const color = z.level === "critical" ? "#ef4444" : z.level === "high" ? "#f97316" : z.level === "medium" ? "#eab308" : "#10b981";

      // Outer zone
      L.circle([z.lat, z.lon], {
        radius: z.radius,
        color: color,
        weight: 1.5,
        opacity: 0.4,
        fillColor: color,
        fillOpacity: 0.06,
        dashArray: "8,6",
      }).addTo(threatLayersRef.current!);

      // Inner core
      L.circle([z.lat, z.lon], {
        radius: z.radius * 0.4,
        color: color,
        weight: 1,
        opacity: 0.3,
        fillColor: color,
        fillOpacity: 0.1,
      }).addTo(threatLayersRef.current!);

      // Label
      L.marker([z.lat, z.lon], {
        icon: L.divIcon({
          className: "",
          iconSize: [140, 40],
          iconAnchor: [70, -10],
          html: `<div style="text-align:center;pointer-events:none">
            <div style="color:${color};font-size:9px;font-family:'Orbitron',monospace;font-weight:bold;text-shadow:0 0 8px ${color}44">${z.name.toUpperCase()}</div>
            <div style="color:${color}99;font-size:7px;font-family:monospace">THREAT: ${z.threatLevel}% [${z.level.toUpperCase()}]</div>
          </div>`,
        }),
        interactive: false,
      }).addTo(threatLayersRef.current!);
    });
  }, [threatZones, showThreats]);

  // ── Draw naval markers ──
  useEffect(() => {
    if (!markerLayersRef.current) return;
    markerLayersRef.current.clearLayers();
    if (!showMarkers) return;

    MARKERS.forEach(m => {
      const marker = L.marker([m.lat, m.lng], { icon: createNavalIcon(m.type) })
        .addTo(markerLayersRef.current!);

      const color = m.type === "base" ? "#06b6d4" : m.type === "choke" ? "#f97316" : m.type === "airfield" ? "#a78bfa" : "#94a3b8";
      marker.bindPopup(`
        <div style="background:#0f172a;border:1px solid ${color}44;border-radius:8px;padding:8px 12px;min-width:180px;font-family:monospace">
          <div style="color:${color};font-size:10px;font-weight:bold;font-family:'Orbitron',monospace;margin-bottom:4px">${m.name}</div>
          <div style="color:#94a3b8;font-size:8px">${m.details}</div>
          <div style="color:#64748b;font-size:7px;margin-top:4px">${m.lat.toFixed(2)}°N / ${m.lng.toFixed(2)}°E</div>
          <div style="color:${color}88;font-size:7px;text-transform:uppercase;margin-top:2px">${m.type}</div>
        </div>
      `, { className: "tactical-popup" });

      // Name label
      L.marker([m.lat, m.lng], {
        icon: L.divIcon({
          className: "",
          iconSize: [100, 14],
          iconAnchor: [50, -8],
          html: `<div style="text-align:center;color:${color}aa;font-size:7px;font-family:monospace;text-shadow:0 0 4px #00000088;pointer-events:none;white-space:nowrap">${m.name.split("(")[0].trim()}</div>`,
        }),
        interactive: false,
      }).addTo(markerLayersRef.current!);
    });
  }, [showMarkers]);

  // ── Draw shipping lanes ──
  useEffect(() => {
    if (!shippingLayersRef.current) return;
    shippingLayersRef.current.clearLayers();
    if (!showShipping) return;

    SHIPPING_LANES.forEach(lane => {
      L.polyline(lane.map(([lat, lng]) => [lat, lng] as [number, number]), {
        color: "#eab308",
        weight: 1.2,
        opacity: 0.18,
        dashArray: "6,10",
      }).addTo(shippingLayersRef.current!);
    });
  }, [showShipping]);

  // ── Draw EEZ ──
  useEffect(() => {
    if (!eezLayersRef.current) return;
    eezLayersRef.current.clearLayers();
    if (!showEEZ) return;

    EEZ_LINES.forEach(line => {
      L.polyline(line.map(([lat, lng]) => [lat, lng] as [number, number]), {
        color: "#06b6d4",
        weight: 1.5,
        opacity: 0.15,
        dashArray: "10,8",
      }).addTo(eezLayersRef.current!);
    });
  }, [showEEZ]);

  // ── Draw waypoints & route ──
  useEffect(() => {
    if (!wpLayersRef.current || !mapRef.current) return;
    wpLayersRef.current.clearLayers();

    // Remove old route line
    if (routeLineRef.current) {
      mapRef.current.removeLayer(routeLineRef.current);
      routeLineRef.current = null;
    }

    // Route line
    if (waypoints.length > 1) {
      const latlngs = waypoints.map(wp => [wp.lat, wp.lng] as [number, number]);
      routeLineRef.current = L.polyline(latlngs, {
        color: "#06b6d4",
        weight: 2.5,
        opacity: 0.7,
        dashArray: "8,5",
      }).addTo(mapRef.current);

      // Distance labels at midpoints
      for (let i = 1; i < waypoints.length; i++) {
        const midLat = (waypoints[i - 1].lat + waypoints[i].lat) / 2;
        const midLng = (waypoints[i - 1].lng + waypoints[i].lng) / 2;
        const dist = Math.round(L.latLng(waypoints[i - 1].lat, waypoints[i - 1].lng).distanceTo(L.latLng(waypoints[i].lat, waypoints[i].lng)) / 1852);
        const threat = legThreats[i - 1];
        const threatColor = threat && threat.maxThreat > 50 ? "#ef4444" : threat && threat.maxThreat > 25 ? "#eab308" : "#06b6d4";

        L.marker([midLat, midLng], {
          icon: L.divIcon({
            className: "",
            iconSize: [70, 24],
            iconAnchor: [35, 28],
            html: `<div style="text-align:center;pointer-events:none">
              <div style="color:#06b6d4aa;font-size:8px;font-family:monospace;background:#0f172acc;padding:1px 4px;border-radius:3px;border:1px solid #06b6d422">${dist} nm</div>
              ${threat && threat.maxThreat > 0 ? `<div style="color:${threatColor};font-size:6px;font-family:monospace">⚠ ${threat.maxThreat}%</div>` : ""}
            </div>`,
          }),
          interactive: false,
        }).addTo(wpLayersRef.current!);
      }
    }

    // Waypoint markers
    waypoints.forEach((wp, i) => {
      const isSelected = selectedWp === wp.id;
      const marker = L.marker([wp.lat, wp.lng], {
        icon: createWaypointIcon(wp.type, i, isSelected),
        draggable: true,
        zIndexOffset: isSelected ? 1000 : 0,
      }).addTo(wpLayersRef.current!);

      marker.on("click", (e: L.LeafletEvent) => {
        L.DomEvent.stopPropagation(e as any);
        setSelectedWp(wp.id);
      });

      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        setWaypoints(prev => prev.map(w => w.id === wp.id ? { ...w, lat: pos.lat, lng: pos.lng } : w));
      });

      // Tooltip
      const color = WP_COLORS[wp.type];
      marker.bindTooltip(`
        <div style="font-family:monospace;font-size:8px">
          <div style="color:${color};font-weight:bold">${wp.label} (${wp.type.toUpperCase()})</div>
          <div style="color:#94a3b8">${wp.lat.toFixed(3)}°N ${wp.lng.toFixed(3)}°E</div>
        </div>
      `, { className: "tactical-tooltip", direction: "top", offset: [0, -12] });
    });
  }, [waypoints, selectedWp, legThreats]);

  // ── Simulation ──
  useEffect(() => {
    if (!simulating || waypoints.length < 2) return;
    const iv = setInterval(() => {
      setSimProgress(p => {
        if (p >= 1) { setSimulating(false); return 0; }
        return p + 0.002;
      });
    }, 50);
    return () => clearInterval(iv);
  }, [simulating, waypoints.length]);

  // Sim marker movement
  useEffect(() => {
    if (!mapRef.current) return;

    // Clear old sim markers
    if (simMarkerRef.current) { mapRef.current.removeLayer(simMarkerRef.current); simMarkerRef.current = null; }
    if (simTrailRef.current) { mapRef.current.removeLayer(simTrailRef.current); simTrailRef.current = null; }

    if (!simulating || waypoints.length < 2) return;

    const total = waypoints.length - 1;
    const legIdx = Math.min(Math.floor(simProgress * total), total - 1);
    const legProg = simProgress * total - legIdx;
    const lat = waypoints[legIdx].lat + (waypoints[legIdx + 1].lat - waypoints[legIdx].lat) * legProg;
    const lng = waypoints[legIdx].lng + (waypoints[legIdx + 1].lng - waypoints[legIdx].lng) * legProg;

    // Trail (completed path)
    const trailPts: [number, number][] = [];
    for (let i = 0; i <= legIdx; i++) trailPts.push([waypoints[i].lat, waypoints[i].lng]);
    trailPts.push([lat, lng]);
    simTrailRef.current = L.polyline(trailPts, { color: "#10b981", weight: 3, opacity: 0.6 }).addTo(mapRef.current);

    // Ship marker
    simMarkerRef.current = L.marker([lat, lng], {
      icon: L.divIcon({
        className: "",
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        html: `<div style="width:20px;height:20px;background:#10b981;border-radius:50%;box-shadow:0 0 12px #10b98188,0 0 24px #10b98144;border:2px solid #10b981;display:flex;align-items:center;justify-content:center">
          <div style="width:6px;height:6px;background:#fff;border-radius:50%"></div>
        </div>`,
      }),
      zIndexOffset: 2000,
    }).addTo(mapRef.current);
  }, [simulating, simProgress, waypoints]);

  // ── Actions ──
  const deleteWp = (id: string) => {
    setWaypoints(prev => prev.filter(wp => wp.id !== id));
    if (selectedWp === id) setSelectedWp(null);
  };
  const clearRoute = () => {
    setWaypoints([]); setSelectedWp(null); setSimulating(false); setSimProgress(0);
  };
  const centerOnIndia = () => {
    mapRef.current?.flyTo([12, 78], 5, { duration: 1.5 });
  };

  const fuelPct = missionProfile.fuelCapacity > 0 && missionProfile.fuelCapacity < 999999
    ? Math.min(100, (routeStats.fuel / missionProfile.fuelCapacity) * 100) : 0;
  const rangePct = missionProfile.maxRange > 0 && missionProfile.maxRange < 999999
    ? Math.min(100, (routeStats.distance / missionProfile.maxRange) * 100) : 0;

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  if (loading && !intel) return (
    <div className="min-h-screen bg-slate-950 pt-[128px] flex items-center justify-center">
      <div className="text-center">
        <Radar className="w-12 h-12 text-cyan-400 mx-auto mb-4 animate-spin" />
        <p className="text-cyan-400 font-orbitron animate-pulse">LOADING INTELLIGENCE DATA...</p>
        <p className="text-[10px] font-space-mono text-cyan-400/40 mt-2">Fetching live threat data for mission planning</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 pt-[128px] pb-20 px-3">
      <div className="max-w-[1600px] mx-auto">
        <div className="text-center mb-3">
          <div className="flex items-center justify-center gap-3 mb-1">
            <div className="h-px w-16 bg-gradient-to-r from-transparent to-cyan-500/30" />
            <h1 className="text-xl md:text-2xl font-orbitron font-black text-cyan-400 tracking-[0.2em]">TACTICAL MISSION PLANNER</h1>
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-cyan-500/30" />
          </div>
          <p className="text-[9px] font-space-mono text-cyan-400/30 tracking-[0.3em]">
            NAVAL OPERATIONS CENTER // REAL-TIME MAP // ROUTE PLANNING & THREAT ANALYSIS
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* ─── MAP ─── */}
          <div className="lg:col-span-9">
            <div className="relative bg-slate-900/50 border border-cyan-500/15 rounded-xl overflow-hidden shadow-2xl shadow-cyan-500/5"
                 style={{ height: "clamp(450px, 70vh, 700px)" }}>
              <div ref={mapContainerRef} className="leaflet-host" style={{ width: "100%", height: "100%", minHeight: "500px", background: "#060d18", position: "relative", zIndex: 10 }} />

              {/* Waypoint type toolbar */}
              <div className="absolute top-3 left-3 flex flex-wrap gap-1 z-[1000]">
                {(["waypoint","patrol","strike","rendezvous","refuel"] as const).map(t => (
                  <button key={t} onClick={() => setWpType(t)}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[7px] font-orbitron transition-all backdrop-blur-sm ${wpType === t ? "text-white border" : "bg-slate-900/70 text-slate-500 border border-slate-700/20 hover:text-slate-300"}`}
                    style={wpType === t ? { backgroundColor: `${WP_COLORS[t]}22`, borderColor: `${WP_COLORS[t]}55`, color: WP_COLORS[t] } : {}}>
                    {t === "waypoint" && <MapPin className="w-3 h-3" />}
                    {t === "patrol" && <Navigation className="w-3 h-3" />}
                    {t === "strike" && <Target className="w-3 h-3" />}
                    {t === "rendezvous" && <Anchor className="w-3 h-3" />}
                    {t === "refuel" && <Radio className="w-3 h-3" />}
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Layer toggles */}
              <div className="absolute top-3 right-3 space-y-1 z-[1000]">
                {([
                  { key: "markers", label: "MARKERS", show: showMarkers, set: setShowMarkers, color: "cyan" },
                  { key: "shipping", label: "SHIPPING", show: showShipping, set: setShowShipping, color: "amber" },
                  { key: "eez", label: "EEZ", show: showEEZ, set: setShowEEZ, color: "cyan" },
                  { key: "threats", label: "THREATS", show: showThreats, set: setShowThreats, color: "red" },
                ] as const).map(l => (
                  <button key={l.key} onClick={() => l.set((p: boolean) => !p)}
                    className={`block w-full text-left px-2 py-1 rounded text-[7px] font-orbitron transition-all backdrop-blur-sm ${l.show
                      ? `bg-${l.color}-500/15 text-${l.color}-400 border border-${l.color}-500/20`
                      : "bg-slate-900/70 text-slate-600 border border-slate-700/20"}`}>
                    {l.show ? <Eye className="w-2.5 h-2.5 inline mr-1" /> : <EyeOff className="w-2.5 h-2.5 inline mr-1" />}
                    {l.label}
                  </button>
                ))}

                {/* Map type */}
                <select value={tileType} onChange={e => setTileType(e.target.value as keyof typeof TILE_LAYERS)}
                  className="block w-full px-2 py-1 rounded text-[7px] font-orbitron bg-slate-900/70 text-cyan-400 border border-cyan-500/20 backdrop-blur-sm focus:outline-none cursor-pointer">
                  {Object.entries(TILE_LAYERS).map(([k, v]) => (
                    <option key={k} value={k}>{v.name}</option>
                  ))}
                </select>

                <button onClick={fetchIntel}
                  className="block w-full text-left px-2 py-1 rounded text-[7px] font-orbitron bg-slate-900/70 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/10 backdrop-blur-sm">
                  <RefreshCw className="w-2.5 h-2.5 inline mr-1" /> REFRESH
                </button>
                <button onClick={centerOnIndia}
                  className="block w-full text-left px-2 py-1 rounded text-[7px] font-orbitron bg-slate-900/70 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/10 backdrop-blur-sm">
                  <Crosshair className="w-2.5 h-2.5 inline mr-1" /> CENTER
                </button>
              </div>

              {/* Sim controls */}
              <div className="absolute bottom-3 left-3 flex gap-2 z-[1000]">
                <button disabled={waypoints.length < 2}
                  onClick={() => { setSimulating(!simulating); if (!simulating) setSimProgress(0); }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded text-[7px] font-orbitron bg-slate-900/70 text-emerald-400 border border-emerald-500/20 disabled:opacity-30 hover:bg-emerald-500/10 backdrop-blur-sm transition-all">
                  {simulating ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  {simulating ? "PAUSE" : "SIMULATE"}
                </button>
                <button onClick={clearRoute}
                  className="flex items-center gap-1 px-2.5 py-1 rounded text-[7px] font-orbitron bg-slate-900/70 text-red-400 border border-red-500/20 hover:bg-red-500/10 backdrop-blur-sm transition-all">
                  <Trash2 className="w-3 h-3" /> CLEAR
                </button>
              </div>

              {/* Sim progress bar */}
              {simulating && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-slate-900/85 border border-emerald-500/20 rounded-lg px-4 py-2 z-[1000] backdrop-blur-sm">
                  <div className="text-[7px] font-orbitron text-emerald-400 mb-1">MISSION SIMULATION — {Math.round(simProgress * 100)}%</div>
                  <div className="w-40 h-1.5 bg-slate-800 rounded-full">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${simProgress * 100}%` }} />
                  </div>
                </div>
              )}

              {/* Cursor coords */}
              {cursorPos && (
                <div className="absolute bottom-3 right-16 bg-slate-900/70 border border-cyan-500/10 rounded px-2 py-0.5 z-[1000] backdrop-blur-sm">
                  <span className="text-[7px] font-space-mono text-cyan-400/50">
                    {cursorPos.lat.toFixed(3)}°{cursorPos.lat >= 0 ? "N" : "S"} / {cursorPos.lng.toFixed(3)}°{cursorPos.lng >= 0 ? "E" : "W"}
                  </span>
                </div>
              )}

              {/* HUD corners */}
              <div className="absolute inset-0 pointer-events-none z-[999]">
                <div className="absolute top-0 left-0 w-6 h-6 border-l-2 border-t-2 border-cyan-500/15" />
                <div className="absolute top-0 right-0 w-6 h-6 border-r-2 border-t-2 border-cyan-500/15" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-l-2 border-b-2 border-cyan-500/15" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-r-2 border-b-2 border-cyan-500/15" />
              </div>
            </div>
          </div>

          {/* ─── RIGHT PANEL ─── */}
          <div className="lg:col-span-3 space-y-3">
            {/* Mission Profile */}
            <div className="bg-slate-900/60 border border-cyan-500/15 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2.5">
                <Settings className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-[10px] font-orbitron text-cyan-400 tracking-wider">MISSION PROFILE</span>
              </div>
              <select value={MISSION_PROFILES.indexOf(missionProfile)}
                onChange={e => setMissionProfile(MISSION_PROFILES[+e.target.value])}
                className="w-full bg-slate-800/40 border border-cyan-500/15 rounded px-2 py-1.5 text-[8px] font-space-mono text-cyan-400 mb-2 focus:outline-none">
                {MISSION_PROFILES.map((p, i) => (<option key={i} value={i}>{p.name}</option>))}
              </select>
              <div className="space-y-1 text-[8px] font-space-mono">
                {[
                  { l: "Vessel", v: missionProfile.vessel },
                  { l: "Speed", v: `${missionProfile.speed} kn` },
                  { l: "Max Range", v: missionProfile.maxRange >= 999999 ? "UNLIMITED (Nuclear)" : `${missionProfile.maxRange} nm` },
                  { l: "Displacement", v: missionProfile.displacement },
                  { l: "Crew", v: missionProfile.crew.toString() },
                  { l: "Armament", v: missionProfile.armament },
                ].map(r => (
                  <div key={r.l} className="flex justify-between items-start">
                    <span className="text-slate-600">{r.l}:</span>
                    <span className="text-slate-300 text-right max-w-[60%]">{r.v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Route Analysis */}
            <div className="bg-slate-900/60 border border-cyan-500/15 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2.5">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-[10px] font-orbitron text-cyan-400 tracking-wider">ROUTE ANALYSIS</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 mb-2.5">
                {[
                  { label: "NM", value: routeStats.distance, color: "text-cyan-400" },
                  { label: "ETA", value: routeStats.eta, color: "text-cyan-400" },
                  { label: "FUEL (L)", value: routeStats.fuel, color: fuelPct > 90 ? "text-red-400" : "text-cyan-400" },
                  { label: "WAYPOINTS", value: waypoints.length, color: "text-cyan-400" },
                ].map(s => (
                  <div key={s.label} className="bg-slate-800/20 rounded-lg p-2 text-center">
                    <div className={`text-sm font-orbitron ${s.color}`}>{s.value}</div>
                    <div className="text-[6px] font-space-mono text-slate-600 mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-[6px] font-space-mono text-slate-600 mb-0.5">
                    <span>FUEL CONSUMPTION</span>
                    <span>{fuelPct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full">
                    <div className={`h-full rounded-full transition-all ${fuelPct > 90 ? "bg-red-500" : fuelPct > 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                      style={{ width: `${fuelPct}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[6px] font-space-mono text-slate-600 mb-0.5">
                    <span>RANGE USAGE</span>
                    <span>{rangePct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full">
                    <div className={`h-full rounded-full transition-all ${rangePct > 90 ? "bg-red-500" : rangePct > 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                      style={{ width: `${rangePct}%` }} />
                  </div>
                </div>
              </div>
              {/* Leg threat summary */}
              {legThreats.length > 0 && legThreats.some(l => l.maxThreat > 0) && (
                <div className="mt-2 pt-2 border-t border-slate-800/30">
                  <div className="text-[6px] font-orbitron text-amber-400/60 mb-1">LEG THREAT ASSESSMENT</div>
                  {legThreats.filter(l => l.maxThreat > 0).map(l => (
                    <div key={l.legIndex} className="flex items-center justify-between text-[7px] font-space-mono mb-0.5">
                      <span className="text-slate-500">Leg {l.legIndex + 1}→{l.legIndex + 2}</span>
                      <span className={`${l.maxThreat > 50 ? "text-red-400" : l.maxThreat > 25 ? "text-amber-400" : "text-emerald-400"}`}>
                        ⚠ {l.maxThreat}% ({l.nearestZone.split(" ").slice(0, 2).join(" ")})
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Waypoints */}
            <div className="bg-slate-900/60 border border-cyan-500/15 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2.5">
                <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-[10px] font-orbitron text-cyan-400 tracking-wider">WAYPOINTS</span>
                <span className="ml-auto text-[7px] font-space-mono text-slate-600">{waypoints.length} pts</span>
              </div>
              {waypoints.length === 0 ? (
                <p className="text-[8px] font-space-mono text-slate-600 text-center py-4">Click on map to add waypoints</p>
              ) : (
                <div className="space-y-1 max-h-44 overflow-y-auto plan-scroll">
                  {waypoints.map((wp, i) => (
                    <div key={wp.id}
                      className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-[8px] font-space-mono cursor-pointer transition-all border ${selectedWp === wp.id
                        ? "bg-cyan-500/10 border-cyan-500/20"
                        : "hover:bg-slate-800/40 border-transparent"}`}
                      onClick={() => {
                        setSelectedWp(wp.id);
                        mapRef.current?.panTo([wp.lat, wp.lng], { animate: true });
                      }}>
                      <div className="flex items-center gap-2">
                        <span className="w-4 h-4 flex items-center justify-center rounded-full text-[7px] font-bold"
                          style={{ backgroundColor: `${WP_COLORS[wp.type]}22`, color: WP_COLORS[wp.type] }}>{i + 1}</span>
                        <div>
                          <div className="text-slate-300">{wp.label} <span className="text-slate-600 text-[6px]">({wp.type})</span></div>
                          <div className="text-slate-600 text-[7px]">{wp.lat.toFixed(2)}°N {wp.lng.toFixed(2)}°E</div>
                        </div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); deleteWp(wp.id); }}
                        className="text-red-400/40 hover:text-red-400 transition-colors"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Live Threat Zones */}
            <div className="bg-slate-900/60 border border-cyan-500/15 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[10px] font-orbitron text-amber-400 tracking-wider">LIVE THREAT ZONES</span>
              </div>
              {threatZones.length === 0 ? (
                <p className="text-[8px] font-space-mono text-slate-600 text-center">No threat data</p>
              ) : (
                <div className="space-y-1.5">
                  {threatZones.sort((a, b) => b.threatLevel - a.threatLevel).map((z, i) => (
                    <div key={i} className="bg-slate-800/20 rounded-lg p-1.5"
                      onClick={() => mapRef.current?.flyTo([z.lat, z.lon], 6, { duration: 1 })}>
                      <div className="flex items-center justify-between text-[8px] font-space-mono cursor-pointer">
                        <span className="text-slate-400 truncate max-w-[55%]">{z.name}</span>
                        <span className={`text-[6px] font-orbitron px-1.5 py-0.5 rounded ${
                          z.level === "critical" ? "bg-red-500/20 text-red-400" :
                          z.level === "high" ? "bg-orange-500/15 text-orange-400" :
                          z.level === "medium" ? "bg-amber-500/10 text-amber-400" :
                          "bg-emerald-500/10 text-emerald-400"
                        }`}>{z.level.toUpperCase()} ({z.threatLevel}%)</span>
                      </div>
                      <div className="mt-1 h-0.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${
                          z.level === "critical" ? "bg-red-500" : z.level === "high" ? "bg-orange-500" :
                          z.level === "medium" ? "bg-amber-500" : "bg-emerald-500"
                        }`} style={{ width: `${z.threatLevel}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sea State */}
            {intel && (
              <div className="bg-slate-900/60 border border-cyan-500/15 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2.5">
                  <Wind className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-[10px] font-orbitron text-cyan-400 tracking-wider">SEA STATE (LIVE)</span>
                </div>
                <div className="space-y-1 text-[8px] font-space-mono">
                  {intel.zones.slice(0, 4).map(z => (
                    <div key={z.id} className="flex items-center justify-between">
                      <span className="text-slate-500 truncate max-w-[35%]">{z.name.split(" ").slice(0, 2).join(" ")}</span>
                      <div className="flex items-center gap-2 text-slate-400">
                        <span><Waves className="w-2.5 h-2.5 inline" /> {z.marine?.wave_height ?? "—"}m</span>
                        <span><Wind className="w-2.5 h-2.5 inline" /> {z.weather?.wind_speed ?? "—"}km/h</span>
                        <span className="text-slate-600">{z.weather?.temperature ?? "—"}°C</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Intel Brief */}
            {intel?.brief && (
              <div className="bg-slate-900/60 border border-cyan-500/15 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Globe2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-[10px] font-orbitron text-cyan-400 tracking-wider">INTEL BRIEF</span>
                </div>
                <p className="text-[8px] font-space-mono text-slate-500 leading-relaxed">{intel.brief}</p>
                <div className="mt-2 pt-2 border-t border-slate-800/30 grid grid-cols-2 gap-1">
                  <div className="text-center">
                    <div className={`text-sm font-orbitron ${(intel.summary.avgThreat || 0) >= 50 ? "text-red-400" : "text-emerald-400"}`}>{intel.summary.avgThreat}%</div>
                    <div className="text-[6px] font-space-mono text-slate-600">AVG THREAT</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-orbitron text-emerald-400">{intel.summary.overallReadiness}%</div>
                    <div className="text-[6px] font-space-mono text-slate-600">READINESS</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* @ts-ignore */}
      <style dangerouslySetInnerHTML={{ __html: `
        .plan-scroll::-webkit-scrollbar { width: 2px; }
        .plan-scroll::-webkit-scrollbar-track { background: transparent; }
        .plan-scroll::-webkit-scrollbar-thumb { background: rgba(6, 182, 212, 0.15); border-radius: 2px; }
        .tactical-popup .leaflet-popup-content-wrapper {
          background: transparent !important;
          box-shadow: none !important;
          padding: 0 !important;
          border-radius: 0 !important;
        }
        .tactical-popup .leaflet-popup-tip { display: none !important; }
        .tactical-popup .leaflet-popup-content { margin: 0 !important; }
        .tactical-tooltip {
          background: #0f172aee !important;
          border: 1px solid #06b6d433 !important;
          border-radius: 6px !important;
          padding: 4px 8px !important;
          box-shadow: 0 0 12px #06b6d422 !important;
          color: #e2e8f0 !important;
          font-family: monospace !important;
        }
        .tactical-tooltip::before { border-top-color: #06b6d433 !important; }
        .leaflet-control-zoom a {
          background: #0f172acc !important;
          color: #06b6d4 !important;
          border-color: #06b6d422 !important;
          font-family: 'Orbitron', monospace !important;
        }
        .leaflet-control-zoom a:hover {
          background: #0f172a !important;
          color: #22d3ee !important;
        }
        .leaflet-control-attribution {
          background: #0f172a88 !important;
          color: #64748b !important;
          font-size: 7px !important;
        }
        .leaflet-control-attribution a { color: #06b6d4 !important; }
        .leaflet-host .leaflet-container,
        .leaflet-host .leaflet-pane,
        .leaflet-host .leaflet-map-pane,
        .leaflet-host .leaflet-tile-pane {
          z-index: 10 !important;
        }
        .leaflet-host .leaflet-tile-pane img.leaflet-tile {
          opacity: 1 !important;
          visibility: visible !important;
          display: block !important;
          filter: none !important;
          mix-blend-mode: normal !important;
        }
      ` }} />
    </div>
  );
}
