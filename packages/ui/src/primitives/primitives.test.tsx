import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Alert } from './alert';
import { Badge } from './badge';
import { Button } from './button';

describe('Button', () => {
  it('blocks clicks and announces itself as busy while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('stays disabled while loading even if disabled={false} is passed', () => {
    render(
      <Button loading disabled={false}>
        Save
      </Button>,
    );

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('renders its styles on the child with asChild (e.g. a link)', () => {
    render(
      <Button asChild variant="outline">
        <a href="/tasks/new">New task</a>
      </Button>,
    );

    const link = screen.getByRole('link', { name: 'New task' });
    expect(link).toHaveAttribute('href', '/tasks/new');
    expect(link.className).toContain('border');
  });

  it('lets the caller override styles (later class wins)', () => {
    render(<Button className="h-12">Tall</Button>);

    expect(screen.getByRole('button').className).toContain('h-12');
    expect(screen.getByRole('button').className).not.toContain('h-9');
  });
});

describe('Badge', () => {
  it('maps a tone to its colour classes', () => {
    render(<Badge tone="danger">failed</Badge>);

    expect(screen.getByText('failed').className).toContain('text-danger');
  });
});

describe('Alert', () => {
  it('interrupts screen readers only for danger', () => {
    const { rerender } = render(<Alert tone="danger" title="Could not sign in" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not sign in');

    rerender(<Alert tone="info" title="Saved" />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });
});
