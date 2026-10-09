"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, Marker, LayerGroup } from "leaflet";
import type { LatLng } from "@/lib/geo";

interface LocationPickerProps {
  // Texto de la dirección a buscar (el campo lo dibuja quien usa el componente).
  query: string;
  value: LatLng | null;
  onChange: (point: LatLng) => void;
  // Ubicación del local: centra el mapa y es el centro de los anillos.
  origin?: LatLng | null;
  // Radios (km) de las zonas por distancia, para dibujarlos.
  rings?: number[];
  height?: number;
  buttonClassName?: string;
  hintClassName?: string;
  listClassName?: string;
  itemClassName?: string;
  searchLabel?: string;
}

interface Found {
  label: string;
  lat: number;
  lng: number;
}

const ARGENTINA: [number, number] = [-38.4, -63.6];

const PIN_HTML =
  '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#ff5a1f;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45);transform:rotate(-45deg)"></div>';
const HOME_HTML =
  '<div style="width:16px;height:16px;border-radius:4px;background:#1c1917;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45)"></div>';

// Mapa de OpenStreetMap con un pin que se mueve tocando el mapa o arrastrándolo,
// más un buscador de direcciones. No usa claves ni servicios de pago.
export function LocationPicker({
  query,
  value,
  onChange,
  origin,
  rings,
  height = 240,
  buttonClassName,
  hintClassName,
  listClassName,
  itemClassName,
  searchLabel = "Ubicar en el mapa",
}: LocationPickerProps) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const pinRef = useRef<Marker | null>(null);
  const originLayer = useRef<LayerGroup | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [found, setFound] = useState<Found[]>([]);

  // Crear el mapa una sola vez (Leaflet necesita el navegador, por eso se carga acá).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !el.current || mapRef.current) return;
      leafletRef.current = L;
      const start = origin ?? value;
      const map = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(
        start ? [start.lat, start.lng] : ARGENTINA,
        start ? 15 : 4
      );
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      map.on("click", (e) => onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
      originLayer.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      pinRef.current = null;
      originLayer.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Local y anillos de las zonas.
  const ringsKey = (rings ?? []).join(",");
  useEffect(() => {
    const L = leafletRef.current;
    const layer = originLayer.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers();
    if (!origin) return;
    L.marker([origin.lat, origin.lng], {
      icon: L.divIcon({ html: HOME_HTML, className: "", iconSize: [16, 16], iconAnchor: [8, 8] }),
      interactive: false,
    }).addTo(layer);
    (rings ?? []).forEach((km) =>
      L.circle([origin.lat, origin.lng], {
        radius: km * 1000,
        color: "#ff5a1f",
        weight: 1.5,
        dashArray: "6 6",
        fillOpacity: 0.04,
        interactive: false,
      }).addTo(layer)
    );
    if (!value) mapRef.current?.setView([origin.lat, origin.lng], 14);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, origin?.lat, origin?.lng, ringsKey]);

  // Pin del cliente (o del local, cuando se está configurando).
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    if (!value) {
      pinRef.current?.remove();
      pinRef.current = null;
      return;
    }
    const latlng: [number, number] = [value.lat, value.lng];
    if (!pinRef.current) {
      const pin = L.marker(latlng, {
        draggable: true,
        icon: L.divIcon({ html: PIN_HTML, className: "", iconSize: [22, 22], iconAnchor: [11, 22] }),
      }).addTo(map);
      pin.on("dragend", () => {
        const p = pin.getLatLng();
        onChangeRef.current({ lat: p.lat, lng: p.lng });
      });
      pinRef.current = pin;
    } else {
      pinRef.current.setLatLng(latlng);
    }
    if (!map.getBounds().contains(latlng)) map.setView(latlng, Math.max(map.getZoom(), 15));
  }, [ready, value?.lat, value?.lng]);

  function choose(r: Found) {
    setFound([]);
    setMessage("");
    onChange({ lat: r.lat, lng: r.lng });
    mapRef.current?.setView([r.lat, r.lng], 17);
  }

  async function search() {
    setMessage("");
    setFound([]);
    if (query.trim().length < 3) {
      setMessage("Escribí la dirección (calle, número y ciudad) y tocá el botón.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`);
      const data = (await res.json()) as { results?: Found[]; error?: string };
      if (!res.ok) {
        setMessage(data.error ?? "No pudimos buscar la dirección. Marcala tocando el mapa.");
      } else if (!data.results || data.results.length === 0) {
        setMessage("No encontramos esa dirección. Probá agregando la ciudad, o tocá el mapa para marcarla.");
      } else if (data.results.length === 1) {
        choose(data.results[0]);
      } else {
        setFound(data.results);
        setMessage("Elegí la correcta:");
      }
    } catch {
      setMessage("No pudimos buscar la dirección. Marcala tocando el mapa.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={search} disabled={busy} className={buttonClassName}>
        {busy ? "Buscando…" : `📍 ${searchLabel}`}
      </button>
      {message && <p className={hintClassName}>{message}</p>}
      {found.length > 0 && (
        <ul className={listClassName}>
          {found.map((r, i) => (
            <li key={i}>
              <button type="button" onClick={() => choose(r)} className={itemClassName}>
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div
        ref={el}
        style={{ height, marginTop: 8, borderRadius: 10, overflow: "hidden", zIndex: 0, position: "relative" }}
      />
      <p className={hintClassName} style={{ marginTop: 4 }}>
        Podés tocar el mapa o arrastrar el pin para ajustar el punto exacto.
      </p>
    </div>
  );
}
