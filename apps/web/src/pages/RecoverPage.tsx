import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { AuthResult } from '@qullqa/shared';
import { api } from '../api.ts';
import { useSession } from '../lib/session.tsx';
import { Card, ErrorMsg, Field, Page } from '../components/ui.tsx';
import { RecoveryCodeNotice } from '../components/RecoveryCode.tsx';

/** «Olvidé mi PIN»: número + código de recuperación → PIN nuevo (y un código nuevo). */
export function RecoverPage() {
  const [params] = useSearchParams();
  const [phone, setPhone] = useState(params.get('tel') ?? '');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);
  const { refresh } = useSession();
  const nav = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (pin !== pin2) return setError('Los dos PIN no coinciden');
    setBusy(true);
    try {
      const r = await api<AuthResult>('/auth/reset-pin', { method: 'POST', json: { phone, recoveryCode: code, newPin: pin } });
      setNewCode(r.recoveryCode ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (newCode) {
    return (
      <Page title="PIN cambiado">
        <p className="success">✓ Listo, ya puedes usar tu PIN nuevo.</p>
        <Card className="accent">
          <p className="small">Tu código anterior ya no sirve. Este es el nuevo:</p>
          <RecoveryCodeNotice code={newCode} onDone={() => void refresh().then(() => nav('/', { replace: true }))} doneLabel="Ir a mi inicio" />
        </Card>
      </Page>
    );
  }

  return (
    <Page title="Recuperar mi PIN" back="/ingresar?modo=ingresar" variant="hero" kicker="¿Olvidaste tu PIN?">
      <p className="lead">Usa el código de recuperación que te mostramos al crear tu cuenta (8 letras y números, como ABCD-EF23).</p>
      <Card>
        <form onSubmit={submit}>
          <Field label="Número de celular" icon="phone">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" required />
          </Field>
          <Field label="Código de recuperación" icon="key">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 9))} className="code" placeholder="ABCD-EF23" autoCapitalize="characters" autoComplete="one-time-code" required />
          </Field>
          <Field label="PIN nuevo (4 números)" icon="lock">
            <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" type="password" autoComplete="new-password" pattern="\d{4}" required />
          </Field>
          <Field label="Repite el PIN nuevo" icon="lock">
            <input value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" type="password" autoComplete="new-password" pattern="\d{4}" required />
          </Field>
          <ErrorMsg error={error} />
          <button type="submit" disabled={busy}>{busy ? 'Comprobando…' : 'CAMBIAR MI PIN'}</button>
        </form>
      </Card>
      <Card title="¿Perdiste también tu código?">
        <p className="small">
          Por seguridad no podemos cambiar tu PIN sin el código. Puedes <Link to="/ingresar">crear una cuenta nueva</Link> y volver a unirte a tu
          comunidad, o escribirnos desde <Link to="/ayuda">Ayuda</Link> para que revisemos tu caso.
        </p>
      </Card>
    </Page>
  );
}
