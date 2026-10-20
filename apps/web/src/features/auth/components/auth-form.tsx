'use client';

import { LoginRequestSchema, RegisterRequestSchema } from '@forgeops/contracts';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  Input,
} from '@forgeops/ui';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type SubmitEvent, useState } from 'react';

import { describeSubmitError, type FieldErrors, safeNextPath, zodFieldErrors } from '@/shared';

import { useLogin, useRegister } from '../api';

type Mode = 'login' | 'register';

const copy = {
  login: {
    title: 'Sign in to ForgeOps',
    description: 'Welcome back.',
    submit: 'Sign in',
    switchText: 'New here?',
    switchLink: 'Create an account',
    switchHref: '/register',
  },
  register: {
    title: 'Create your account',
    description: 'Connect GitHub next and hand ForgeOps its first task.',
    submit: 'Create account',
    switchText: 'Already have an account?',
    switchLink: 'Sign in',
    switchHref: '/login',
  },
} as const;

/**
 * One form for both sign-in and sign-up (the fields and behaviour differ only slightly, so a
 * second component would be duplication). Validation uses the same Zod schemas as the API, so
 * the browser and the server can never disagree about what is valid.
 */
export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get('next'));
  const login = useLogin();
  const register = useRegister();
  const mutation = mode === 'login' ? login : register;
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const text = copy[mode];

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (mode === 'register' && values.displayName === '') delete values.displayName;

    const schema = mode === 'login' ? LoginRequestSchema : RegisterRequestSchema;
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error, 1));
      return;
    }
    setErrors({});

    try {
      if (mode === 'login') {
        await login.mutateAsync(LoginRequestSchema.parse(values));
      } else {
        await register.mutateAsync(RegisterRequestSchema.parse(values));
      }
      router.replace(next);
    } catch (error) {
      const { fieldErrors, formError: message } = describeSubmitError(
        error,
        'Something went wrong. Please try again.',
      );
      setErrors(fieldErrors);
      setFormError(message);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{text.title}</CardTitle>
        <CardDescription>{text.description}</CardDescription>
      </CardHeader>
      <form noValidate onSubmit={(event) => void onSubmit(event)}>
        <CardContent className="flex flex-col gap-4">
          {formError && <Alert tone="danger" title={formError} />}
          {mode === 'register' && (
            <Field label="Name" hint="Optional" error={errors.displayName}>
              {(control) => <Input name="displayName" autoComplete="name" {...control} />}
            </Field>
          )}
          <Field label="Email" error={errors.email}>
            {(control) => (
              <Input name="email" type="email" autoComplete="email" required {...control} />
            )}
          </Field>
          <Field
            label="Password"
            error={errors.password}
            hint={mode === 'register' ? 'At least 12 characters.' : undefined}
          >
            {(control) => (
              <Input
                name="password"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                {...control}
              />
            )}
          </Field>
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-3">
          <Button type="submit" loading={mutation.isPending}>
            {text.submit}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {text.switchText}{' '}
            <Link
              className="font-medium text-foreground underline-offset-4 hover:underline"
              href={text.switchHref}
            >
              {text.switchLink}
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
