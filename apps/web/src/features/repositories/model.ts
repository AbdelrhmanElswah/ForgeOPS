/**
 * Commands are stored as argument lists (`["pnpm", "test"]`) and run without a shell; people
 * type them as text. These two functions are the only translation between the two.
 */

export type ParsedCommand = { ok: true; args: string[] } | { ok: false; error: string };

/** "pnpm test -- --coverage" → ["pnpm", "test", "--", "--coverage"]. */
export function parseCommand(text: string): ParsedCommand {
  // Quoting would need a shell-style parser; refusing it keeps the rule obvious: spaces separate
  // arguments, nothing else is special.
  if (/["'`]/.test(text)) {
    return { ok: false, error: 'Quotes are not supported: separate arguments with spaces.' };
  }
  const args = text.trim().split(/\s+/).filter(Boolean);
  return args.length > 0 ? { ok: true, args } : { ok: false, error: 'Enter a command.' };
}

export function formatCommand(args: readonly string[] | null): string {
  return args?.join(' ') ?? '';
}

/** One path pattern per line, blank lines ignored. */
export function parseLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}
