import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { CommunityView, LonLat, Parcel } from '@qullqa/shared';
import { api } from '../api.ts';
import { useApi } from '../lib/hooks.ts';
import { areaM2, averageSamples, distanceM, formatArea, getFix, gpsError, keepAwake, thin, type Sample } from '../field/gps.ts';
import { Card, ErrorMsg, Loading, Page } from '../components/ui.tsx';
import { Icon } from '../components/Icon.tsx';
import { MapView } from '../components/MapView.tsx';
import { ParcelForm } from '../components/ParcelForm.tsx';

/** Cuánto escuchar el GPS en cada esquina y qué precisión basta para cortar antes. */
const MARK_MAX_MS = 8000;
const MARK_MIN_SAMPLES = 4;
const GOOD_ACCURACY_M = 10;
const WEAK_ACCURACY_M = 30;
/** «Volviste a la primera esquina» si estás a menos de esto (o de la precisión del GPS). */
const CLOSE_LOOP_M = 10;

type Corner = { point: LonLat; accuracy: number };

export function ParcelNewPage() {
  const { cid = '' } = useParams();
  const nav = useNavigate();
  const community = useApi<CommunityView>(`/communities/${cid}`);
  const [mode, setMode] = useState<'corners' | 'draw' | null>(null);
  const [corners, setCorners] = useState<Corner[]>([]);
  const [drawn, setDrawn] = useState<LonLat[]>([]);
  const [me, setMe] = useState<LonLat | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [altitude, setAltitude] = useState<number | null>(null);
  const [marking, setMarking] = useState<{ left: number } | null>(null);
  const [step, setStep] = useState<'trace' | 'details'>('trace');
  const [error, setError] = useState<string | null>(null);
  const [fit, setFit] = useState<LonLat[] | undefined>();
  const watchId = useRef<number | null>(null);
  const samples = useRef<Sample[] | null>(null);
  const release = useRef<() => void>(() => {});

  // Ubicarse al entrar: centra el mapa donde está el agricultor
  useEffect(() => {
    getFix()
      .then((f) => { setMe([f.lon, f.lat]); setAccuracy(f.accuracy); setAltitude(f.altitude); setFit([[f.lon, f.lat]]); })
      .catch(() => {});
    return () => stopGps();
  }, []);

  /** GPS siempre encendido mientras marca esquinas: así cada esquina se toma con el GPS ya «despierto». */
  async function startCorners() {
    setMode('corners');
    setCorners([]);
    setError(null);
    if (!('geolocation' in navigator)) return setError('Este teléfono no tiene GPS disponible.');
    release.current = await keepAwake();
    // Sin «timeout»: parado en una esquina el celular puede no mandar lecturas nuevas y eso NO es un error.
    watchId.current = navigator.geolocation.watchPosition(onPosition, onGpsError, { enableHighAccuracy: true, maximumAge: 0 });
  }

  const gotFix = useRef(false);
  function onPosition(p: GeolocationPosition) {
    const s: Sample = { lon: p.coords.longitude, lat: p.coords.latitude, accuracy: p.coords.accuracy, altitude: p.coords.altitude };
    gotFix.current = true;
    setMe([s.lon, s.lat]);
    setAccuracy(s.accuracy);
    if (s.altitude != null) setAltitude(s.altitude);
    setError((e) => (e && e.startsWith('No llegó señal') ? null : e));
    samples.current?.push(s);
  }
  /** Solo avisamos si falta el permiso o si nunca hubo señal; las pausas del GPS son normales. */
  function onGpsError(e: GeolocationPositionError) {
    if (e.code === e.PERMISSION_DENIED || !gotFix.current) setError(gpsError(e));
  }

  function stopGps() {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    release.current();
    release.current = () => {};
  }

  /** Quieto en la esquina: junta lecturas unos segundos y guarda el promedio. */
  async function markCorner() {
    setError(null);
    samples.current = [];
    const t0 = performance.now();
    setMarking({ left: Math.ceil(MARK_MAX_MS / 1000) });
    await new Promise<void>((done) => {
      // Pedimos lecturas activamente cada ~1 s: quieto en la esquina, watchPosition puede no enviar nuevas
      const ask = setInterval(() => navigator.geolocation.getCurrentPosition(onPosition, () => {}, { enableHighAccuracy: true, maximumAge: 0, timeout: 4000 }), 1000);
      const tick = setInterval(() => {
        const s = samples.current ?? [];
        const elapsed = performance.now() - t0;
        const good = s.filter((x) => x.accuracy <= GOOD_ACCURACY_M).length;
        setMarking({ left: Math.max(0, Math.ceil((MARK_MAX_MS - elapsed) / 1000)) });
        if (elapsed >= MARK_MAX_MS || (good >= MARK_MIN_SAMPLES && elapsed >= 2500)) {
          clearInterval(tick);
          clearInterval(ask);
          done();
        }
      }, 300);
    });
    const avg = averageSamples(samples.current ?? []);
    samples.current = null;
    setMarking(null);
    if (!avg) return setError('No llegó señal del GPS. Sal a cielo abierto, espera unos segundos e intenta otra vez.');
    if (avg.accuracy > WEAK_ACCURACY_M) setError(`La señal está débil (±${Math.round(avg.accuracy)} m). Marcamos la esquina, pero si puedes, espera y vuelve a marcarla.`);
    navigator.vibrate?.(120);
    if (avg.altitude != null) setAltitude(avg.altitude);
    const next = [...corners, { point: avg.point, accuracy: avg.accuracy }];
    setCorners(next);
    if (next.length >= 2) setFit(next.map((x) => x.point)); // encuadra la chacra a medida que crece
  }

  async function create(v: Parameters<Parameters<typeof ParcelForm>[0]['onSubmit']>[0]) {
    const meanAcc = corners.length ? corners.reduce((s, c) => s + c.accuracy, 0) / corners.length : accuracy;
    const p = await api<Parcel>('/parcels', {
      method: 'POST',
      json: { ...v, communityId: cid, ring: thin(ring), captureMethod: mode === 'corners' ? 'walk' : 'draw', gps: { altitudeM: altitude, accuracyM: meanAcc } },
    });
    void p;
    nav('/', { replace: true }); // el inicio muestra el siguiente paso
  }

  const c = community.data;
  if (!c) return <Page title="Nueva chacra" back={`/c/${cid}`}>{community.error ? <ErrorMsg error={community.error} /> : <Loading />}</Page>;

  const ring: LonLat[] = mode === 'corners' ? corners.map((x) => x.point) : drawn;
  const area = areaM2(ring);
  const first = corners[0]?.point;
  const backAtStart = mode === 'corners' && corners.length >= 3 && !!me && !!first && distanceM(me, first) <= Math.max(CLOSE_LOOP_M, accuracy ?? 0);
  const signal = accuracy == null ? null : accuracy <= GOOD_ACCURACY_M ? 'buena' : accuracy <= WEAK_ACCURACY_M ? 'regular' : 'débil';

  if (step === 'details')
    return (
      <Page title="Datos de la chacra" back={`/c/${cid}`}>
        <Card>
          <p className="headline">{formatArea(area)}</p>
          <p className="muted small">{ring.length} esquinas {mode === 'corners' ? 'marcadas con GPS' : 'dibujadas en el mapa'}</p>
          <button className="link" onClick={() => setStep('trace')}>← Volver a marcar</button>
        </Card>
        <Card>
          <ParcelForm submitLabel="GUARDAR MI CHACRA" onSubmit={create} />
        </Card>
      </Page>
    );

  return (
    <Page title="Nueva chacra" back={`/c/${cid}`}>
      {!mode && (
        <Card title="¿Cómo quieres marcar tu chacra?">
          <div className="choices">
            <button type="button" className="choice big-choice" onClick={() => void startCorners()}>
              <span className="choice-ico" aria-hidden><Icon name="pin" size={28} /></span>
              <span><strong>Parado en cada esquina</strong><small>Vas a cada esquina de tu chacra y tocas «Marcar esta esquina». Es lo más exacto.</small></span>
            </button>
            <button type="button" className="choice big-choice" onClick={() => { setMode('draw'); setDrawn([]); }}>
              <span className="choice-ico" aria-hidden><Icon name="pencil" size={28} /></span>
              <span><strong>Dibujar en el mapa</strong><small>Toca las esquinas de tu chacra sobre la foto del satélite.</small></span>
            </button>
          </div>
        </Card>
      )}

      {mode === 'corners' && (
        <Card className="accent">
          <ol className="todo-steps">
            <li className={corners.length ? 'done' : ''}>
              <span className="num" aria-hidden>{corners.length ? <Icon name="check" size={20} /> : 1}</span>
              <div><strong>Párate en una esquina</strong><small>Quédate quieto y toca el botón.</small></div>
            </li>
            <li className={corners.length >= 3 ? 'done' : ''}>
              <span className="num" aria-hidden>{corners.length >= 3 ? <Icon name="check" size={20} /> : 2}</span>
              <div><strong>Camina a la siguiente esquina y repite</strong><small>Sigue el borde, una esquina tras otra.</small></div>
            </li>
            <li>
              <span className="num" aria-hidden>3</span>
              <div><strong>Vuelve a la primera esquina</strong><small>La app cierra tu chacra.</small></div>
            </li>
          </ol>
          <div className="corner-status">
            <span><strong>{corners.length}</strong> esquinas</span>
            <span><strong>{corners.length >= 3 ? formatArea(area) : '—'}</strong> área</span>
            <span className={`signal ${signal ?? ''}`}><strong>{signal ?? '…'}</strong> señal GPS{accuracy != null ? ` (±${Math.round(accuracy)} m)` : ''}</span>
          </div>

          {backAtStart ? (
            <div className="notice green"><Icon name="check" size={22} /> <span><strong>¡Volviste a la primera esquina!</strong> Ya puedes cerrar tu chacra.</span></div>
          ) : null}

          {marking ? (
            <button disabled className="marking"><span className="spinner" aria-hidden /> Quédate quieto… {marking.left} s</button>
          ) : backAtStart ? (
            <button onClick={() => { stopGps(); setStep('details'); }}><Icon name="check" size={22} /> CERRAR MI CHACRA</button>
          ) : (
            <button className="mark-btn" onClick={() => void markCorner()} disabled={!!error && !accuracy}>
              <Icon name="pin" size={26} /> MARCAR ESTA ESQUINA {corners.length ? `(${corners.length + 1})` : ''}
            </button>
          )}
          {!backAtStart && corners.length >= 3 && !marking && (
            <button className="secondary" onClick={() => { stopGps(); setStep('details'); }}>Ya marqué todas: terminar</button>
          )}
          <div className="row actions">
            <button className="secondary" onClick={() => setCorners((x) => x.slice(0, -1))} disabled={!corners.length || !!marking}>Borrar la última</button>
            <button className="secondary" onClick={() => { stopGps(); setMode(null); setCorners([]); }} disabled={!!marking}>Cambiar forma</button>
          </div>
        </Card>
      )}

      {mode === 'draw' && (
        <Card>
          <p>Toca cada esquina de tu chacra en orden, sobre la foto del satélite.</p>
          <p className="muted small">{drawn.length} esquinas · {formatArea(area)}</p>
        </Card>
      )}

      <ErrorMsg error={error} />

      <MapView
        center={me ?? c.center}
        parcels={c.parcels}
        draft={ring}
        me={me}
        fitTo={fit}
        zoom={18}
        height="50vh"
        onMapClick={mode === 'draw' ? (p) => setDrawn((r) => [...r, p]) : undefined}
      />

      {mode === 'draw' && (
        <>
          <button className="secondary" onClick={() => setDrawn((r) => r.slice(0, -1))} disabled={!drawn.length}>Borrar la última esquina</button>
          <button disabled={drawn.length < 3} onClick={() => setStep('details')}>{drawn.length < 3 ? 'Faltan esquinas (mínimo 3)' : 'LISTO, SIGUIENTE'}</button>
          <button className="link" onClick={() => { setMode(null); setDrawn([]); }}>Cambiar forma</button>
        </>
      )}
    </Page>
  );
}
