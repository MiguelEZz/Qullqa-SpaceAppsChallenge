import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { AuthResult } from '@qullqa/shared';
import { api } from '../api.ts';
import { useSession } from '../lib/session.tsx';
import { Card, ErrorMsg, Field, Page } from '../components/ui.tsx';
import { Icon } from '../components/Icon.tsx';
import { RecoveryCodeNotice } from '../components/RecoveryCode.tsx';

const onlyDigits = (v: string, n: number) => v.replace(/\D/g, '').slice(0, n);

/** Ingreso y registro (diseño FrontIdea): una tarjeta, campos con ícono, un botón grande. */
export function AuthPage() {
  const [params] = useSearchParams();
  const next = params.get('next') ?? '/';
  const [mode, setMode] = useState<'register' | 'login'>(params.get('modo') === 'ingresar' ? 'login' : 'register');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const { refresh } = useSession();
  const nav = useNavigate();
  const isNew = mode === 'register';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (isNew && pin !== pin2) return setError('Los dos PIN no son iguales. Escríbelos otra vez.');
    if (isNew && !terms) return setError('Para seguir, marca que aceptas los términos.');
    setBusy(true);
    try {
      if (isNew) {
        const r = await api<AuthResult>('/auth/register', { method: 'POST', json: { name, phone, pin, acceptTerms: true } });
        setCode(r.recoveryCode ?? null);
        if (!r.recoveryCode) await finish();
      } else {
        await api('/auth/login', { method: 'POST', json: { phone, pin } });
        await finish();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    await refresh();
    nav(next, { replace: true });
  }

  function switchMode() {
    setMode(isNew ? 'login' : 'register');
    setError(null);
  }

  if (code) {
    return (
      <Page title="Guarda tu código" variant="hero" kicker="Un paso más">
        <Card className="accent">
          <RecoveryCodeNotice code={code} onDone={() => void finish()} />
        </Card>
      </Page>
    );
  }

  const pinType = showPin ? 'text' : 'password';
  return (
    <Page title={isNew ? 'Crea tu cuenta' : 'Ingresa'} variant="hero" kicker={isNew ? 'Bienvenido' : 'Qué gusto verte'}>
      <Card>
        <form onSubmit={submit}>
          {isNew && (
            <Field label="Tu nombre" icon="user" hint="Así te verán tus vecinos.">
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Ej.: Rosa Quispe" required minLength={2} maxLength={60} />
            </Field>
          )}
          <Field label="Número de celular" icon="phone">
            <input value={phone} onChange={(e) => setPhone(onlyDigits(e.target.value, 12))} inputMode="numeric" autoComplete="tel" placeholder="987654321" required />
          </Field>
          <Field label={isNew ? 'Crea un PIN de 4 números' : 'Tu PIN de 4 números'} icon="lock" hint={isNew ? 'Lo usarás para entrar. No se lo des a nadie.' : undefined}>
            <input value={pin} onChange={(e) => setPin(onlyDigits(e.target.value, 4))} inputMode="numeric" type={pinType} autoComplete={isNew ? 'new-password' : 'current-password'} placeholder="••••" pattern="\d{4}" required />
          </Field>
          {isNew && (
            <Field label="Repite tu PIN" icon="lock">
              <input value={pin2} onChange={(e) => setPin2(onlyDigits(e.target.value, 4))} inputMode="numeric" type={pinType} autoComplete="new-password" placeholder="••••" pattern="\d{4}" required />
            </Field>
          )}
          <button type="button" className="show-pin" onClick={() => setShowPin((v) => !v)}>
            <Icon name={showPin ? 'eyeOff' : 'eye'} size={20} /> {showPin ? 'Ocultar PIN' : 'Ver PIN'}
          </button>
          {isNew && (
            <label className="check">
              <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
              <span>
                Acepto los <Link to="/terminos" target="_blank">términos</Link> y la <Link to="/privacidad" target="_blank">política de privacidad</Link>.
              </span>
            </label>
          )}
          <ErrorMsg error={error} />
          <button type="submit" disabled={busy}>
            {busy ? 'Un momento…' : isNew ? 'CREAR MI CUENTA' : 'ENTRAR'}
          </button>
        </form>
        <div className="below">
          <p>
            {isNew ? '¿Ya tienes cuenta? ' : '¿No tienes cuenta? '}
            <button type="button" className="link" onClick={switchMode}>{isNew ? 'Ingresa aquí' : 'Créala aquí'}</button>
          </p>
          {!isNew && (
            <p><Link to={`/recuperar${phone ? `?tel=${encodeURIComponent(phone)}` : ''}`}>¿Olvidaste tu PIN?</Link></p>
          )}
        </div>
      </Card>
    </Page>
  );
}
