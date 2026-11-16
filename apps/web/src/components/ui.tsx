import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { DISCLAIMER } from '@qullqa/shared';
import { useInstallPrompt } from '../lib/hooks.ts';
import { useNotifications } from '../lib/notifications.ts';
import { useSession } from '../lib/session.tsx';
import { api } from '../api.ts';
import { Icon, type IconName } from './Icon.tsx';

/**
 * Página con el estilo FrontIdea:
 *  - variant «hero»: banda ladrillo grande con el hongo en un círculo blanco y el título centrado (ingreso, portada, inicio).
 *  - variant «compact» (por defecto): banda ladrillo baja con «Volver» y el título en blanco.
 * Para personas que usan poco el celular: letras grandes, botones anchos, ícono + palabra, barra fija abajo.
 */
export function Page({
  title, back, children, actions, hideTitle, variant = 'compact', kicker,
}: { title: string; back?: string; children: ReactNode; actions?: ReactNode; hideTitle?: boolean; variant?: 'hero' | 'compact'; kicker?: string }) {
  const nav = useNavigate();
  const { me } = useSession();
  const { standalone } = useInstallPrompt();
  useEffect(() => {
    document.title = title === 'Qullqa' ? 'Qullqa — Decidir juntos qué sembrar' : `${title} · Qullqa`;
  }, [title]);

  // La barra de arriba queda fija al hacer scroll. En las páginas con logotipo grande, el pequeño aparece
  // en la barra cuando el grande sale de la pantalla: «Qullqa» siempre visible.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > (variant === 'hero' ? 110 : 8));
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [variant]);
  const showSmallLogo = variant !== 'hero' || scrolled;

  return (
    <div className={`app ${me ? 'with-nav' : ''}`}>
      <div className={`topbar ${scrolled ? 'scrolled' : ''}`}>
        <div className="hero-row">
          <div className="tb-side">
            {back && (
              <button className="back" onClick={() => nav(back)}>
                <Icon name="back" size={22} /> Volver
              </button>
            )}
          </div>
          <Link to="/" className={`wordmark tb-logo ${showSmallLogo ? 'on' : ''}`} aria-label="Qullqa, ir al inicio" tabIndex={showSmallLogo ? 0 : -1}>
            <img src="/logo-qullqa-white.png" alt="Qullqa" width={71} height={32} />
          </Link>
          <div className="tb-side right hero-actions">
            {actions}
            {me && <Bell />}
            {!standalone && (
              <Link to="/descargar" className="getapp" aria-label="Descargar app"><Icon name="download" size={18} /><span className="getapp-txt"> Descargar app</span></Link>
            )}
          </div>
        </div>
      </div>
      {variant === 'hero' ? (
        <header className="hero hero-lg">
          <span className="hero-deco" aria-hidden />
          <Link to="/" className="wordmark big" aria-label="Qullqa, ir al inicio">
            <img src="/logo-qullqa-white-lg.png" alt="Qullqa" width={178} height={80} />
          </Link>
        </header>
      ) : (
        <header className="hero">
          <span className="hero-deco" aria-hidden />
          {!hideTitle && (
            <div className="hero-title">
              <h1>{title}</h1>
            </div>
          )}
        </header>
      )}
      <main>
        {variant === 'hero' && (
          <div className="hero-head">
            {kicker && <p className="kicker">{kicker}</p>}
            {!hideTitle && <h1>{title}</h1>}
          </div>
        )}
        <ActingBanner />
        {children}
        <SiteFooter />
      </main>
      {me && <BottomNav />}
    </div>
  );
}

/** Campana de avisos con el número de no leídos. */
function Bell() {
  const { unread } = useNotifications(true);
  return (
    <Link to="/avisos" className="bell" aria-label={unread ? `Avisos: ${unread} sin leer` : 'Avisos'}>
      <Icon name="bell" size={22} />
      {unread > 0 && <span className="bell-count">{unread > 9 ? '9+' : unread}</span>}
    </Link>
  );
}

/** Barra fija abajo, como en WhatsApp: siempre a un toque de lo importante. */
function BottomNav() {
  const { me } = useSession();
  const first = me?.communities[0];
  const items: { to: string; icon: IconName; label: string; end?: boolean }[] = [
    { to: '/', icon: 'home', label: 'Inicio', end: true },
    { to: first ? `/c/${first.id}/plan` : '/comunidades', icon: 'sprout', label: 'Mi plan' },
    { to: '/ayuda', icon: 'help', label: 'Ayuda' },
    { to: '/cuenta', icon: 'account', label: 'Mi cuenta' },
  ];
  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      {items.map((i) => (
        <NavLink key={i.label} to={i.to} end={i.end} className={({ isActive }) => (isActive ? 'on' : '')}>
          <Icon name={i.icon} size={26} />
          <span>{i.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

/** Aviso cuando un administrador está «viendo como» una familia demo. */
function ActingBanner() {
  const { me, refresh } = useSession();
  const nav = useNavigate();
  if (!me?.actingFor) return null;
  return (
    <div className="acting">
      <span>Estás viendo la app como <strong>{me.name}</strong> (datos sintéticos).</span>
      <button onClick={() => void api('/auth/stop-acting', { method: 'POST' }).then(refresh).then(() => nav('/admin'))}>Volver al panel</button>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="site">
      <nav aria-label="Información">
        <Link to="/como-funciona">Cómo funciona</Link>
        <Link to="/terminos">Términos</Link>
        <Link to="/privacidad">Privacidad</Link>
        <Link to="/ayuda">Ayuda</Link>
      </nav>
      <p>{DISCLAIMER}</p>
      <p>© 2026 Qullqa · Datos de NASA y otras fuentes citadas</p>
    </footer>
  );
}

export function Card({ title, children, className = '', icon }: { title?: ReactNode; children: ReactNode; className?: string; icon?: IconName }) {
  return (
    <section className={`card ${className}`}>
      {title && <h2>{icon && <span className="ico-tile sm"><Icon name={icon} size={20} /></span>}{title}</h2>}
      {children}
    </section>
  );
}

export function ErrorMsg({ error }: { error: string | null }) {
  return error ? <p className="error" role="alert"><Icon name="alert" size={20} /> {error}</p> : null;
}

export function Loading() {
  return <p className="loading"><span className="spinner" aria-hidden /> Cargando…</p>;
}

/** Campo de formulario. Con `icon`, se ve como en el diseño: cuadrito ladrillo + etiqueta en negrita dentro. */
export function Field({ label, hint, children, icon }: { label: string; hint?: string; children: ReactNode; icon?: IconName }) {
  if (icon) {
    return (
      <div className="field">
        <label className="iconed">
          <span className="ico-tile"><Icon name={icon} size={22} /></span>
          <span className="stack">
            <span className="lbl">{label}</span>
            {children}
          </span>
        </label>
        {hint && <small>{hint}</small>}
      </div>
    );
  }
  return (
    <label className="field">
      <span className="lbl">{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Choice<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T | null;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="choices">
      {options.map((o) => (
        <button type="button" key={String(o.value)} className={`choice ${value === o.value ? 'on' : ''}`} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          <span className="radio" aria-hidden>{value === o.value && <Icon name="check" size={16} />}</span>
          <span>
            <strong>{o.label}</strong>
            {o.hint && <small>{o.hint}</small>}
          </span>
        </button>
      ))}
    </div>
  );
}

export function LinkButton({ to, children, variant = 'primary', icon }: { to: string; children: ReactNode; variant?: 'primary' | 'secondary'; icon?: IconName }) {
  return (
    <Link className={`btn ${variant}`} to={to}>
      {icon && <Icon name={icon} size={22} />}
      {children}
    </Link>
  );
}

export function InstallBanner() {
  const { canInstall, install, standalone } = useInstallPrompt();
  if (standalone) return null;
  return (
    <div className="install">
      <img src="/icon-192.png" alt="" width={44} height={44} />
      <span>Instala Qullqa en tu celular y ábrela como una app.</span>
      {canInstall ? <button onClick={() => void install()}>Instalar</button> : <Link className="btn" to="/descargar">Ver cómo</Link>}
    </div>
  );
}
