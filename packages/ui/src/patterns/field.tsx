import { type ReactNode, useId } from 'react';

import { cn } from '../lib/cn';
import { Label } from '../primitives/label';

/** Props a form control needs to be correctly labelled and described. */
export interface FieldControlProps {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby': string | undefined;
}

export interface FieldProps {
  label: ReactNode;
  /** Shown under the control; switches it to the invalid state. */
  error?: string | undefined;
  hint?: ReactNode;
  className?: string;
  /** Render the control with the wiring props spread onto it. */
  children: (control: FieldControlProps) => ReactNode;
}

/**
 * Label + control + hint + error, wired for accessibility once instead of in every form:
 * the label targets the control, the control announces the error and hint, and an invalid
 * control is styled through `aria-invalid` (see Input).
 *
 *   <Field label="Email" error={errors.email}>{(p) => <Input type="email" {...p} />}</Field>
 */
export function Field({ label, error, hint, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
