import { Card, Page } from '../components/ui.tsx';
import { CommunitySearch } from '../components/CommunitySearch.tsx';

export function CommunitiesPage() {
  return (
    <Page title="Buscar comunidad" back="/">
      <p className="lead">Las comunidades ya están registradas. Elige la tuya: nadie tiene que crearla ni darte un código.</p>
      <Card>
        <CommunitySearch autoFocus />
      </Card>
    </Page>
  );
}
