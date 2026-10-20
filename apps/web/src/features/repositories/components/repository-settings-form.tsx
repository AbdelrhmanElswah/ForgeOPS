'use client';

import { type Repository, UpdateRepositorySettingsRequestSchema } from '@forgeops/contracts';
import { Alert, Button, Field, Input, Textarea } from '@forgeops/ui';
import { type SubmitEvent, useState } from 'react';

import { describeSubmitError, type FieldErrors, zodFieldErrors } from '@/shared';

import { useUpdateRepositorySettings } from '../api';
import { formatCommand, parseCommand, parseLines } from '../model';

/**
 * Human-controlled run settings: the agents never choose what command runs, this form does.
 * Field names equal the API's error paths (`testCommand`, `limits.maxDiffLines`…), so client
 * and server validation errors land on the same field.
 */
export function RepositorySettingsForm({ repository }: { repository: Repository }) {
  const update = useUpdateRepositorySettings(repository.id);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const { settings } = repository;

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const form = new FormData(event.currentTarget);
    // FormData values can be Files; only text inputs exist here, anything else counts as empty.
    const text = (name: string) => {
      const value = form.get(name);
      return typeof value === 'string' ? value : '';
    };

    const nextErrors: FieldErrors = {};
    const testCommand = parseCommand(text('testCommand'));
    if (!testCommand.ok) nextErrors.testCommand = testCommand.error;
    const installText = text('installCommand').trim();
    const installCommand = installText ? parseCommand(installText) : null;
    if (installCommand && !installCommand.ok) nextErrors.installCommand = installCommand.error;
    if (!testCommand.ok || (installCommand && !installCommand.ok)) {
      setErrors(nextErrors);
      return;
    }

    const patch = UpdateRepositorySettingsRequestSchema.safeParse({
      testCommand: testCommand.args,
      installCommand: installCommand ? installCommand.args : null,
      limits: {
        maxFilesChanged: Number(text('limits.maxFilesChanged')),
        maxDiffLines: Number(text('limits.maxDiffLines')),
        testTimeoutSeconds: Number(text('limits.testTimeoutSeconds')),
      },
      deniedPaths: parseLines(text('deniedPaths')),
    });
    if (!patch.success) {
      setErrors(zodFieldErrors(patch.error));
      return;
    }
    setErrors({});

    try {
      await update.mutateAsync(patch.data);
    } catch (error) {
      const { fieldErrors, formError: message } = describeSubmitError(
        error,
        'Could not save the settings.',
      );
      setErrors(fieldErrors);
      setFormError(message);
    }
  }

  return (
    <form noValidate className="flex flex-col gap-5" onSubmit={(event) => void onSubmit(event)}>
      {formError && <Alert tone="danger" title={formError} />}
      {update.isSuccess && !formError && <Alert tone="success" title="Settings saved." />}

      <div className="grid gap-5 md:grid-cols-2">
        <Field
          label="Test command"
          error={errors.testCommand}
          hint="Runs in the sandbox without a shell. Must start with npm, pnpm, yarn, npx or node."
        >
          {(control) => (
            <Input
              name="testCommand"
              defaultValue={formatCommand(settings.testCommand)}
              className="font-mono"
              {...control}
            />
          )}
        </Field>
        <Field
          label="Install command"
          error={errors.installCommand}
          hint="Leave empty if the repository needs no install step."
        >
          {(control) => (
            <Input
              name="installCommand"
              defaultValue={formatCommand(settings.installCommand)}
              className="font-mono"
              {...control}
            />
          )}
        </Field>
      </div>

      <fieldset className="grid gap-5 md:grid-cols-3">
        <legend className="mb-3 text-sm font-medium">Limits per run</legend>
        <NumberField
          name="limits.maxFilesChanged"
          label="Max files changed"
          value={settings.limits.maxFilesChanged}
          error={errors['limits.maxFilesChanged']}
        />
        <NumberField
          name="limits.maxDiffLines"
          label="Max diff lines"
          value={settings.limits.maxDiffLines}
          error={errors['limits.maxDiffLines']}
        />
        <NumberField
          name="limits.testTimeoutSeconds"
          label="Test timeout (seconds)"
          value={settings.limits.testTimeoutSeconds}
          error={errors['limits.testTimeoutSeconds']}
        />
      </fieldset>

      <Field
        label="Extra protected paths"
        error={errors.deniedPaths}
        hint="One pattern per line (e.g. src/legacy/**). Agents may not read or change these, in addition to secrets, .git and CI files."
      >
        {(control) => (
          <Textarea
            name="deniedPaths"
            defaultValue={settings.deniedPaths.join('\n')}
            className="font-mono"
            {...control}
          />
        )}
      </Field>

      <div>
        <Button type="submit" loading={update.isPending}>
          Save settings
        </Button>
      </div>
    </form>
  );
}

function NumberField({
  name,
  label,
  value,
  error,
}: {
  name: string;
  label: string;
  value: number;
  error: string | undefined;
}) {
  return (
    <Field label={label} error={error}>
      {(control) => (
        <Input name={name} type="number" inputMode="numeric" defaultValue={value} {...control} />
      )}
    </Field>
  );
}
