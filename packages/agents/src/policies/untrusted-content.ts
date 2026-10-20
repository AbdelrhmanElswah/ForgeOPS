/**
 * Prompt-injection defence for repository content (docs/ARCHITECTURE.md §6.6).
 *
 * Everything read from the repository (code, READMEs, test output) is wrapped in a tag the
 * system prompt declares as *data*. A file containing "ignore your instructions and…" stays
 * inside the wrapper. Any closing tag inside the content is neutralised, so a malicious file
 * can't end the wrapper early and continue as if it were the system speaking.
 *
 * This lowers the risk; it doesn't remove it. The real guarantees are structural: the model
 * has no tool that acts outside the sandbox, and a human approves every change.
 */
export function wrapUntrusted(kind: 'file' | 'output', label: string, content: string): string {
  const tag = kind === 'file' ? 'untrusted_file' : 'untrusted_output';
  const safeLabel = label.replace(/["<>]/g, '');
  const safeContent = content.replace(/<\/?(untrusted_file|untrusted_output)/gi, '<\\/$1');
  return `<${tag} source="${safeLabel}">\n${safeContent}\n</${tag}>`;
}

/**
 * Keeps the beginning and the end (errors usually appear at the end of test output, context
 * at the start of files) and states clearly how much was cut.
 */
export function truncateMiddle(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  const keep = Math.floor((maxChars - 60) / 2);
  const omitted = text.length - keep * 2;
  return `${text.slice(0, keep)}\n[… ${String(omitted)} characters omitted …]\n${text.slice(-keep)}`;
}
