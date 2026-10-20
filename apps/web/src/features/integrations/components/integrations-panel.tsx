'use client';

import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  ResourceList,
  ResourceListSkeleton,
  ResourceRow,
} from '@forgeops/ui';
import { Plug } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { traceIdOf } from '@/shared';

import { useInstallations, useStartGitHubInstall } from '../api';
import { connectResultMessage } from '../model';

export function IntegrationsPanel() {
  const params = useSearchParams();
  const result = connectResultMessage(params.get('github'), params.get('reason'));
  const installations = useInstallations();
  const startInstall = useStartGitHubInstall();

  return (
    <div className="flex flex-col gap-6">
      {result && (
        <Alert tone={result.tone} title={result.title}>
          {result.description}
        </Alert>
      )}

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>GitHub</CardTitle>
            <CardDescription>
              Install the ForgeOps GitHub App on the repositories the agents may work on. It can
              read code and open pull requests; it can never merge.
            </CardDescription>
          </div>
          <Button
            loading={startInstall.isPending}
            onClick={() => {
              startInstall.mutate();
            }}
          >
            <Plug aria-hidden />
            Install GitHub App
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {startInstall.isError && (
            <Alert tone="danger" title="Could not start the installation">
              {startInstall.error.message}
            </Alert>
          )}
          {installations.isPending ? (
            <ResourceListSkeleton rows={1} />
          ) : installations.isError ? (
            <ErrorState
              title="Could not load installations"
              traceId={traceIdOf(installations.error)}
              onRetry={() => void installations.refetch()}
            />
          ) : installations.data.items.length === 0 ? (
            <EmptyState
              icon={<Plug aria-hidden />}
              title="No installations yet"
              description="Install the app on your account or an organisation to get started."
            />
          ) : (
            <ResourceList aria-label="GitHub installations">
              {installations.data.items.map((installation) => (
                <ResourceRow
                  key={installation.id}
                  title={installation.accountLogin}
                  badges={
                    <>
                      <Badge tone="neutral">{installation.accountType}</Badge>
                      {installation.suspended && <Badge tone="warning">Suspended</Badge>}
                    </>
                  }
                  meta={
                    <span>
                      {installation.repositoryCount}{' '}
                      {installation.repositoryCount === 1 ? 'repository' : 'repositories'}
                    </span>
                  }
                  trailing={
                    <Button asChild variant="ghost" size="sm">
                      <Link href="/repositories">View repositories</Link>
                    </Button>
                  }
                />
              ))}
            </ResourceList>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
