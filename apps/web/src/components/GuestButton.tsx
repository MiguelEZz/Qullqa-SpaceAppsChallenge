import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.ts';
import { useSession } from '../lib/session.tsx';
import { ErrorMsg } from './ui.tsx';
import { Icon } from './Icon.tsx';

/** Acceso sin registro para el jurado: el servidor crea una cuenta de invitado al momento. */
export function GuestButton({ next = '/' }: { next?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { refresh } = useSession();
  const nav = useNavigate();

  async function enter() {
    setBusy(true);
    setError(null);
    try {
      await api('/auth/guest', { method: 'POST', json: {} });
      await refresh();
      nav(next, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="guest">
      <button type="button" className="guest-btn" onClick={() => void enter()} disabled={busy}>
        <Icon name="user" size={22} />
        <span>
          {busy ? 'Un momento…' : 'ACCEDER COMO INVITADO'}
          <small>NASA Space Apps Challenge</small>
        </span>
      </button>
      <p className="small muted">
        Sin nombre, celular ni PIN. Al entrar aceptas los <Link to="/terminos">términos</Link>.
      </p>
      <ErrorMsg error={error} />
    </div>
  );
}
