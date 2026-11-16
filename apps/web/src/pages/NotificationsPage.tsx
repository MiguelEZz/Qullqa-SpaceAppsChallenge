import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useNotifications } from '../lib/notifications.ts';
import { Card, Page } from '../components/ui.tsx';
import { Icon } from '../components/Icon.tsx';
import { PushButton } from '../components/Waiting.tsx';

export function NotificationsPage() {
  const n = useNotifications(true);
  // Al abrir los avisos, quedan leídos
  useEffect(() => {
    if (n.unread > 0) void n.markRead();
  }, [n.unread, n]);
  return (
    <Page title="Avisos" back="/">
      <Card title="Recibir avisos en el celular" icon="bell">
        <p className="small">Te avisamos cuando tu plan esté listo, aunque tengas la app cerrada.</p>
        <PushButton />
      </Card>
      {n.items.length === 0 ? (
        <p className="lead center">Todavía no tienes avisos.</p>
      ) : (
        <ul className="navlist">
          {n.items.map((i) => {
            const inner = (
              <>
                <span className="ico-tile"><Icon name={i.kind.startsWith('plan') ? 'sprout' : 'bell'} size={22} /></span>
                <span className="txt">
                  <strong>{i.title}{!i.read && <span className="badge" style={{ marginLeft: 8 }}>nuevo</span>}</strong>
                  <small>{i.body}</small>
                  <small>{new Date(i.createdAt).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}</small>
                </span>
                {i.link && <Icon name="chevron" />}
              </>
            );
            return <li key={i.id}>{i.link ? <Link to={i.link}>{inner}</Link> : <div className="navitem">{inner}</div>}</li>;
          })}
        </ul>
      )}
    </Page>
  );
}
