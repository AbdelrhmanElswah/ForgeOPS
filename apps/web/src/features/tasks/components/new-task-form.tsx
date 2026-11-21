'use client';

import { CreateTaskRequestSchema, INSTRUCTION_MAX_LENGTH } from '@forgeops/contracts';
import {
  Alert,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Select,
  Skeleton,
  Textarea,
} from '@forgeops/ui';
import { FolderGit2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type SubmitEvent, useState } from 'react';

import { useBranches, useRepositories } from '@/features/repositories';
import { describeSubmitError, type FieldErrors, traceIdOf, zodFieldErrors } from '@/shared';

import { useCreateTask } from '../api';

export function NewTaskForm() {
  const router = useRouter();
  // shortcut: only the first page of repositories (20) is offered; add search when people have more.
  const repositories = useRepositories('');
  const create = useCreateTask();
  const [repositoryId, setRepositoryId] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  // One key per form: a double click or a retried request can never create two tasks.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  if (repositories.isPending) return <Skeleton className="h-72 w-full" />;
  if (repositories.isError) {
    return (
      <ErrorState
        title="Could not load repositories"
        traceId={traceIdOf(repositories.error)}
        onRetry={() => void repositories.refetch()}
      />
    );
  }
  const options = repositories.data.pages.flatMap((page) => page.items);
  if (options.length === 0) {
    return (
      <EmptyState
        icon={<FolderGit2 aria-hidden />}
        title="Connect a repository first"
        description="Tasks run on a repository the ForgeOps GitHub App can access."
        action={
          <Button asChild>
            <Link href="/settings/integrations">Connect GitHub</Link>
          </Button>
        }
      />
    );
  }
  const selectedId = repositoryId || (options[0]?.id ?? '');
  const selected = options.find((repository) => repository.id === selectedId);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const form = new FormData(event.currentTarget);
    const text = (name: string) => {
      const value = form.get(name);
      return typeof value === 'string' ? value : '';
    };

    const baseBranch = text('baseBranch');
    const request = CreateTaskRequestSchema.safeParse({
      repositoryId: selectedId,
      instruction: text('instruction'),
      // Empty = the repository's default branch, decided by the server.
      ...(baseBranch && { baseBranch }),
    });
    if (!request.success) {
      setErrors(zodFieldErrors(request.error));
      return;
    }
    setErrors({});

    try {
      await create.mutateAsync({ body: request.data, idempotencyKey });
      router.push('/tasks');
    } catch (error) {
      const { fieldErrors, formError: message } = describeSubmitError(
        error,
        'Could not create the task.',
      );
      setErrors(fieldErrors);
      setFormError(message);
    }
  }

  return (
    <form noValidate className="flex flex-col gap-5" onSubmit={(event) => void onSubmit(event)}>
      {formError && <Alert tone="danger" title={formError} />}

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Repository" error={errors.repositoryId}>
          {(control) => (
            <Select
              name="repositoryId"
              value={selectedId}
              onChange={(event) => {
                setRepositoryId(event.target.value);
              }}
              {...control}
            >
              {options.map((repository) => (
                <option key={repository.id} value={repository.id}>
                  {repository.fullName}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {selected && (
          // Keyed by repository so the branch choice resets when the repository changes.
          <BranchField
            key={selected.id}
            repositoryId={selected.id}
            defaultBranch={selected.defaultBranch}
            error={errors.baseBranch}
          />
        )}
      </div>

      <Field
        label="What should the agents do?"
        error={errors.instruction}
        hint="Describe the bug or change: what happens, what should happen, and where if you know."
      >
        {(control) => (
          <Textarea
            name="instruction"
            maxLength={INSTRUCTION_MAX_LENGTH}
            rows={6}
            placeholder="Checkout returns 500 when the cart is empty. It should return 400 with a clear message."
            {...control}
          />
        )}
      </Field>

      <div>
        <Button type="submit" loading={create.isPending}>
          Create task
        </Button>
      </div>
    </form>
  );
}

function BranchField({
  repositoryId,
  defaultBranch,
  error,
}: {
  repositoryId: string;
  defaultBranch: string;
  error: string | undefined;
}) {
  const branches = useBranches(repositoryId);
  // Until GitHub answers (or if it can't), the default branch is still a valid choice.
  const names = branches.data?.items.map((branch) => branch.name) ?? [];
  return (
    <Field
      label="Base branch"
      error={error}
      hint={branches.isError ? 'Could not load branches from GitHub.' : undefined}
    >
      {(control) => (
        <Select name="baseBranch" defaultValue="" {...control}>
          <option value="">{defaultBranch} (default)</option>
          {names
            .filter((name) => name !== defaultBranch)
            .map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
        </Select>
      )}
    </Field>
  );
}
