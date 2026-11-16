import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CROPS, OBSERVATION_META, type ObservationType, type ObservationValue } from '@qullqa/shared';
import { api } from '../api.ts';
import { analyzeGreenCover, thumbnailOf, type ExgResult } from '../field/exg.ts';
import { getFix, type Fix } from '../field/gps.ts';
import { compassLabel, requestSensorPermission, watchOrientation, type Reading } from '../field/inclinometer.ts';
import { Icon } from '../components/Icon.tsx';
import { Card, Choice, ErrorMsg, Field, Page } from '../components/ui.tsx';

const today = () => new Date().toISOString().slice(0, 10);
const cropOptions = CROPS.map((c) => ({ value: c.id as string, label: c.name }));

export function ObservationPage() {
  const { cid = '', pid = '', type = '' } = useParams();
  const t = type as ObservationType;
  const meta = OBSERVATION_META[t];
  const nav = useNavigate();
  const back = `/c/${cid}/p/${pid}`;

  const [fix, setFix] = useState<Fix | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [exg, setExg] = useState<ExgResult | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [reading, setReading] = useState<Reading | null>(null);
  const [locked, setLocked] = useState<Reading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const stopSensor = useRef<(() => void) | null>(null);

  useEffect(() => {
    getFix(15000).then(setFix).catch(() => {}); // la ubicación es opcional
    return () => stopSensor.current?.();
  }, []);

  if (!meta) return <Page title="Observación" back={back}><ErrorMsg error="Tipo de observación desconocido" /></Page>;

  const set = (k: string) => (v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      if (t === 'green_cover') {
        const r = await analyzeGreenCover(file);
        setExg(r);
        setPhoto(r.thumbnail);
      } else setPhoto(await thumbnailOf(file));
    } catch {
      setError('No se pudo leer la foto. Intenta de nuevo.');
    }
  }

  async function startSensor() {
    if (!(await requestSensorPermission())) return setError('Este teléfono no permite usar el inclinómetro desde el navegador.');
    stopSensor.current?.();
    setLocked(null);
    stopSensor.current = watchOrientation(setReading);
  }

  function buildValue(): ObservationValue | string {
    const f = form as Record<string, never>;
    switch (t) {
      case 'green_cover':
        return exg ? { type: t, fraction: exg.fraction, otsuThreshold: exg.otsuThreshold, method: 'ExG+Otsu' } : 'Toma la foto primero.';
      case 'residue':
        return f.level != null ? { type: t, level: f.level } : 'Elige un nivel.';
      case 'slope':
        return locked ? { type: t, slopeDeg: Math.round(locked.slopeDeg * 10) / 10, aspectDeg: locked.headingDeg != null ? Math.round(locked.headingDeg) : null } : 'Fija una lectura del inclinómetro.';
      case 'phenology':
        return f.crop && f.stage ? { type: t, crop: f.crop, stage: f.stage, sowingDate: f.sowingDate || null } : 'Elige cultivo y etapa.';
      case 'frost':
        return f.severity ? { type: t, severity: f.severity, minTempC: f.minTempC === '' || f.minTempC == null ? null : Number(f.minTempC), damagedCrop: f.damagedCrop || null } : 'Elige qué tan fuerte fue.';
      case 'wilting':
        return f.severity ? { type: t, severity: f.severity, crop: f.crop || null } : 'Elige qué tan fuerte es.';
      case 'soil_moisture':
        return f.fistTest ? { type: t, fistTest: f.fistTest } : 'Elige el resultado del puño.';
      case 'erosion':
        return f.level != null ? { type: t, level: f.level } : 'Elige un nivel.';
      case 'harvest':
        return f.crop && Number(f.kg) > 0 && Number(f.areaM2) > 0
          ? { type: t, crop: f.crop, kg: Number(f.kg), areaM2: Number(f.areaM2), harvestDate: f.harvestDate || today() }
          : 'Completa cultivo, kilos y área.';
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = buildValue();
    if (typeof value === 'string') return setError(value);
    if (meta.photo === 'required' && !photo) return setError('Esta observación necesita una foto.');
    setBusy(true);
    setError(null);
    try {
      await api(`/parcels/${pid}/observations`, {
        method: 'POST',
        json: { value, photo, lat: fix?.lat ?? null, lon: fix?.lon ?? null, accuracyM: fix?.accuracy ?? null, observedAt: new Date().toISOString() },
      });
      stopSensor.current?.();
      nav(back, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const f = form as Record<string, string | number | undefined>;

  return (
    <Page title={meta.label} back={back}>
      <p className="lead small">{meta.why}</p>
      <form onSubmit={submit}>
        {meta.photo !== 'none' && (
          <Card title={t === 'green_cover' ? 'Foto desde arriba' : 'Foto (opcional)'}>
            {t === 'green_cover' && <p className="muted small">Párate y toma la foto mirando hacia el suelo, a la altura del pecho. Que no salga tu sombra ni tus pies.</p>}
            <label className="btn secondary file">
              <Icon name="camera" size={22} /> {photo ? 'Tomar otra' : 'Tomar foto'}
              <input type="file" accept="image/*" capture="environment" onChange={(e) => onPhoto(e.target.files?.[0])} hidden />
            </label>
            {exg ? (
              <div className="exg">
                <img src={exg.maskPreview} alt="Zonas verdes detectadas" />
                <p className="big">{Math.round(exg.fraction * 100)} %</p>
                <p className="muted small">de cobertura verde estimada por la foto (método ExG). No es lo mismo que el «vigor» que mide el satélite.</p>
              </div>
            ) : (
              photo && <img className="preview" src={photo} alt="Foto tomada" />
            )}
          </Card>
        )}

        <Card>
          {t === 'residue' && (
            <Field label="¿Cuánto rastrojo hay en 1 m²?">
              <Choice value={(f.level as number) ?? null} onChange={set('level')} options={[{ value: 0, label: 'Poco', hint: 'menos del 10 %' }, { value: 1, label: 'Regular', hint: '10 a 50 %' }, { value: 2, label: 'Mucho', hint: 'más del 50 %' }]} />
            </Field>
          )}

          {t === 'slope' && (
            <>
              <p className="muted small">Apoya el celular sobre el suelo (o sobre una tabla) con la parte de arriba apuntando <strong>ladera abajo</strong>. Espera a que el número se quede quieto y pulsa «Fijar».</p>
              {!reading && <button type="button" className="secondary" onClick={startSensor}>Activar inclinómetro</button>}
              {reading && (
                <div className="sensor">
                  <p className="big">{(locked ?? reading).slopeDeg.toFixed(1)}°</p>
                  <p>{(locked ?? reading).headingDeg != null ? `La ladera baja hacia el ${compassLabel((locked ?? reading).headingDeg!)} (${Math.round((locked ?? reading).headingDeg!)}°)` : 'Brújula no disponible en este teléfono'}</p>
                  <button type="button" className="secondary" onClick={() => (locked ? setLocked(null) : setLocked(reading))}>{locked ? 'Medir de nuevo' : 'Fijar esta lectura'}</button>
                </div>
              )}
            </>
          )}

          {t === 'phenology' && (
            <>
              <Field label="Cultivo"><Choice value={(f.crop as string) ?? null} onChange={set('crop')} options={cropOptions} /></Field>
              <Field label="¿En qué etapa está?">
                <select value={(f.stage as string) ?? ''} onChange={(e) => set('stage')(e.target.value)}>
                  <option value="">Elegir…</option>
                  {['siembra', 'emergencia', 'desarrollo', 'floracion', 'llenado', 'madurez', 'cosecha'].map((s) => <option key={s} value={s}>{s === 'floracion' ? 'floración' : s}</option>)}
                </select>
              </Field>
              <Field label="Fecha de siembra (si la sabes)"><input type="date" max={today()} value={(f.sowingDate as string) ?? ''} onChange={(e) => set('sowingDate')(e.target.value)} /></Field>
            </>
          )}

          {(t === 'frost' || t === 'wilting') && (
            <Field label="¿Qué tan fuerte?">
              <Choice value={(f.severity as string) ?? null} onChange={set('severity')} options={[{ value: 'leve', label: 'Leve' }, { value: 'moderada', label: 'Moderada' }, { value: 'fuerte', label: 'Fuerte' }]} />
            </Field>
          )}
          {t === 'frost' && (
            <>
              <Field label="Temperatura mínima (°C), si tienes termómetro"><input type="number" inputMode="decimal" step={0.5} min={-30} max={15} value={(f.minTempC as number) ?? ''} onChange={(e) => set('minTempC')(e.target.value)} /></Field>
              <Field label="¿Qué cultivo dañó?">
                <select value={(f.damagedCrop as string) ?? ''} onChange={(e) => set('damagedCrop')(e.target.value)}>
                  <option value="">Ninguno / no sé</option>
                  {cropOptions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </Field>
            </>
          )}
          {t === 'wilting' && (
            <Field label="Cultivo afectado">
              <select value={(f.crop as string) ?? ''} onChange={(e) => set('crop')(e.target.value)}>
                <option value="">No sé</option>
                {cropOptions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
          )}

          {t === 'soil_moisture' && (
            <Field label="Toma un puñado de tierra a un palmo de hondo y apriétalo:">
              <Choice value={(f.fistTest as string) ?? null} onChange={set('fistTest')} options={[{ value: 'seco', label: 'Seco', hint: 'Se desmorona, no se pega' }, { value: 'humedo', label: 'Húmedo', hint: 'Forma una bola que se mantiene' }, { value: 'mojado', label: 'Mojado', hint: 'Gotea o mancha la mano' }]} />
            </Field>
          )}

          {t === 'erosion' && (
            <Field label="¿Qué ves en la parcela?">
              <Choice value={(f.level as number) ?? null} onChange={set('level')} options={[{ value: 0, label: 'Nada' }, { value: 1, label: 'Surcos leves', hint: 'canalitos de lluvia' }, { value: 2, label: 'Cárcavas pequeñas', hint: 'zanjas de un palmo' }, { value: 3, label: 'Cárcavas o derrumbes', hint: 'se fue la tierra' }]} />
            </Field>
          )}

          {t === 'harvest' && (
            <>
              <Field label="Cultivo"><Choice value={(f.crop as string) ?? null} onChange={set('crop')} options={cropOptions} /></Field>
              <div className="row">
                <Field label="Kilos cosechados"><input type="number" inputMode="decimal" min={0} value={(f.kg as number) ?? ''} onChange={(e) => set('kg')(e.target.value)} /></Field>
                <Field label="Área cosechada (m²)" hint="1 ha = 10 000 m²"><input type="number" inputMode="decimal" min={0} value={(f.areaM2 as number) ?? ''} onChange={(e) => set('areaM2')(e.target.value)} /></Field>
              </div>
              <Field label="Fecha de cosecha"><input type="date" max={today()} value={(f.harvestDate as string) ?? today()} onChange={(e) => set('harvestDate')(e.target.value)} /></Field>
            </>
          )}

          {t === 'green_cover' && !exg && <p className="muted">Toma la foto para calcular la cobertura.</p>}
          <p className="muted small">{fix ? `Ubicación registrada (±${Math.round(fix.accuracy)} m)` : 'Sin ubicación (opcional)'}</p>
          <ErrorMsg error={error} />
          <button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar observación'}</button>
        </Card>
      </form>
    </Page>
  );
}
