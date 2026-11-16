import { LinkButton, Page } from '../components/ui.tsx';

export function NotFoundPage() {
  return (
    <Page title="Página no encontrada">
      <div className="center">
        <img src="/logo-qullqa-lg.png" alt="Qullqa" width={200} style={{ margin: '24px 0 8px', height: 'auto' }} />
        <p className="lead">El enlace no existe o cambió. Vuelve al inicio para seguir.</p>
      </div>
      <LinkButton to="/">Ir al inicio</LinkButton>
    </Page>
  );
}
