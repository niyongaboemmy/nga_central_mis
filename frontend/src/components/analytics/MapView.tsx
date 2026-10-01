import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTheme } from "../../contexts/ThemeContext";

/**
 * A light Leaflet map of bubbles (plan §7.4). Only map coordinates go to the tile
 * server (OpenStreetMap); no user data does. Loaded lazily with the pages that use it.
 * Bubble area ∝ value; colour is one hue (magnitude) or the series colour given.
 */
export interface MapPoint {
  key: string;
  lat: number;
  lon: number;
  value: number;
  label: string;
  color?: string;
}

const MapView: React.FC<{ points: MapPoint[]; height?: number; ariaLabel: string; fit?: boolean }> = ({ points, height = 320, ariaLabel, fit = true }) => {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false);
  const { theme } = useTheme();
  const base = theme === "dark" ? "#3987e5" : "#2a78d6";

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView([-1.95, 29.9], 7);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 12,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · IP geolocation by <a href="https://db-ip.com">DB-IP</a>',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const max = Math.max(1, ...points.map((p) => p.value));
    for (const p of points) {
      const r = 5 + 20 * Math.sqrt(p.value / max);
      L.circleMarker([p.lat, p.lon], { radius: r, color: theme === "dark" ? "#0f172a" : "#ffffff", weight: 2, fillColor: p.color ?? base, fillOpacity: 0.75 })
        .bindTooltip(`${p.label}: ${p.value.toLocaleString()}`)
        .addTo(g);
    }
    if (fit && points.length && !fitted.current) {
      fitted.current = true;
      const b = L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number]));
      m.fitBounds(b.pad(0.4), { maxZoom: 9 });
    }
  }, [points, theme, base, fit]);

  // A region, not role="img": the map has its own controls (zoom, attribution links).
  return <div ref={el} style={{ height }} className="rounded-xl overflow-hidden z-0" role="region" aria-label={ariaLabel} />;
};

export default MapView;
