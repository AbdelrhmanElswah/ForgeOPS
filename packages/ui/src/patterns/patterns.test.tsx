import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Input } from '../primitives/input';
import { Field } from './field';
import { NavItem } from './layout';
import { ErrorState } from './states';

describe('Field', () => {
  it('labels the control and announces its error and hint', () => {
    render(
      <Field label="Email" hint="We never share it." error="Enter a valid email">
        {(control) => <Input type="email" {...control} />}
      </Field>,
    );

    const input = screen.getByRole('textbox', { name: 'Email' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('We never share it. Enter a valid email');
  });

  it('is valid and undescribed when there is no error or hint', () => {
    render(<Field label="Name">{(control) => <Input {...control} />}</Field>);

    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(input).not.toHaveAttribute('aria-describedby');
  });
});

describe('ErrorState', () => {
  it('shows the trace id for support and retries on request', async () => {
    const onRetry = vi.fn();
    render(<ErrorState title="Could not load tasks" traceId="req-123" onRetry={onRetry} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Reference: req-123');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('NavItem', () => {
  it('marks the current page for assistive technology', () => {
    render(
      <NavItem active>
        <a href="/tasks">Tasks</a>
      </NavItem>,
    );

    expect(screen.getByRole('link', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page');
  });
});
