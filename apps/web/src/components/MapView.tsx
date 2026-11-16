import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, MapMouseEvent, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre 6 carga su worker como módulo aparte: Vite lo empaqueta y nos da su URL
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

maplibregl.setWorkerUrl(workerUrl);
import type { LonLat } from '@qullqa/shared';

/** color: relleno propio (p. ej. por cultivo en el panel); si falta, amarillo = mía, blanco = vecino. */
export type MapParcel = { id: string; ring: LonLat[]; mine: boolean; color?: string; selected?: boolean };

type Props = {
  center: LonLat;
  parcels?: MapParcel[];
  /** Contorno en edición (se dibuja con vértices). */
  draft?: LonLat[];
  /** Posición actual del GPS. */
  me?: LonLat | null;
  onMapClick?: (p: LonLat) => void;
  onParcelClick?: (id: string) => void;
  /** Encuadra el mapa a estos puntos cuando cambian. */
  fitTo?: LonLat[];
  zoom?: number;
  height?: string;
};

const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    sat: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 17, // en el Colca Esri no tiene imagen sobre z17: se amplía la de z17
      attribution: 'Imagen: Esri, Maxar, Earthstar Geographics',
    },
  },
  layers: [{ id: 'sat', type: 'raster', source: 'sat' }],
};

const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features });

function parcelsFC(parcels: MapParcel[]) {
  return fc(
    parcels
      .filter((p) => p.ring.length >= 3)
      .map((p) => ({
        type: 'Feature',
        properties: { id: p.id, mine: p.mine, color: p.color ?? (p.mine ? '#f2c94c' : '#ffffff'), custom: !!p.color, selected: !!p.selected },
        geometry: { type: 'Polygon', coordinates: [[...p.ring, p.ring[0]!]] },
      })),
  );
}

function draftFC(draft: LonLat[]) {
  const feats: GeoJSON.Feature[] = draft.map((p) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } }));
  if (draft.length >= 2)
    feats.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: draft.length >= 3 ? [...draft, draft[0]!] : draft },
    });
  return fc(feats);
}

export function MapView({ center, parcels = [], draft, me, onMapClick, onParcelClick, fitTo, zoom = 15, height = '320px' }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const handlers = useRef({ onMapClick, onParcelClick });
  handlers.current = { onMapClick, onParcelClick };
  const latest = useRef({ parcels, draft, me });
  latest.current = { parcels, draft, me };

  useEffect(() => {
    const m = new maplibregl.Map({ container: el.current!, style: STYLE, center, zoom, maxZoom: 20, attributionControl: { compact: true } });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.on('load', () => {
      m.addSource('parcels', { type: 'geojson', data: parcelsFC(latest.current.parcels) });
      m.addSource('draft', { type: 'geojson', data: draftFC(latest.current.draft ?? []) });
      m.addSource('me', { type: 'geojson', data: fc([]) });
      m.addLayer({ id: 'parcels-fill', type: 'fill', source: 'parcels', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', ['get', 'custom'], 0.75, ['get', 'mine'], 0.45, 0.2] } });
      m.addLayer({ id: 'parcels-line', type: 'line', source: 'parcels', paint: { 'line-color': ['case', ['get', 'selected'], '#ffffff', ['get', 'custom'], '#1c1714', ['get', 'color']], 'line-width': ['case', ['get', 'selected'], 4, ['get', 'custom'], 1.5, ['get', 'mine'], 3, 1.5] } });
      m.addLayer({ id: 'draft-line', type: 'line', source: 'draft', filter: ['==', '$type', 'LineString'], paint: { 'line-color': '#ff7a45', 'line-width': 3, 'line-dasharray': [2, 1] } });
      m.addLayer({ id: 'draft-pts', type: 'circle', source: 'draft', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 6, 'circle-color': '#ff7a45', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
      m.addLayer({ id: 'me', type: 'circle', source: 'me', paint: { 'circle-radius': 8, 'circle-color': '#2f80ed', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
      ready.current = true;
      sync();
    });
    m.on('click', (e: MapMouseEvent) => {
      const hit = m.queryRenderedFeatures(e.point, { layers: ['parcels-fill'] })[0];
      if (hit && handlers.current.onParcelClick && !handlers.current.onMapClick) {
        handlers.current.onParcelClick(String(hit.properties?.id));
        return;
      }
      handlers.current.onMapClick?.([e.lngLat.lng, e.lngLat.lat]);
    });
    map.current = m;
    return () => {
      ready.current = false;
      m.remove();
    };
  }, []);

  function sync() {
    const m = map.current;
    if (!m || !ready.current) return;
    const { parcels, draft, me } = latest.current;
    (m.getSource('parcels') as GeoJSONSource).setData(parcelsFC(parcels));
    (m.getSource('draft') as GeoJSONSource).setData(draftFC(draft ?? []));
    (m.getSource('me') as GeoJSONSource).setData(fc(me ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: me } }] : []));
  }

  useEffect(sync, [parcels, draft, me]);

  const fitKey = fitTo ? JSON.stringify(fitTo) : '';
  useEffect(() => {
    const m = map.current;
    if (!m || !fitTo || fitTo.length === 0) return;
    const doFit = () => {
      if (fitTo.length === 1) return m.easeTo({ center: fitTo[0]!, zoom: Math.max(m.getZoom(), 17) });
      const b = new maplibregl.LngLatBounds(fitTo[0]!, fitTo[0]!);
      fitTo.forEach((p) => b.extend(p));
      m.fitBounds(b, { padding: 40, maxZoom: 18, duration: 600 });
    };
    if (ready.current) doFit();
    else m.once('load', doFit);
  }, [fitKey]);

  return <div ref={el} className="map" style={{ height }} />;
}
