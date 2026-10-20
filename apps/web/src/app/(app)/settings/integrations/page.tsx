import { PageHeader } from '@forgeops/ui';
import type { Metadata } from 'next';
import { Suspense } from 'react';

import { IntegrationsPanel } from '@/features/integrations';

export const metadata: Metadata = { title: 'Integrations' };

export default function IntegrationsPage() {
  return (
    <>
      <PageHeader title="Integrations" description="Connect ForgeOps to your code." />
      {/* The panel reads ?github=… set by the install callback. */}
      <Suspense>
        <IntegrationsPanel />
      </Suspense>
    </>
  );
}
