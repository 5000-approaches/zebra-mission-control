import { describe, it, expect } from 'vitest';
import TestPage from './page';

function flatten(node: unknown): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  if (typeof node === 'object' && 'props' in (node as Record<string, unknown>)) {
    const props = (node as { props?: { children?: unknown } }).props;
    return flatten(props?.children);
  }
  return '';
}

describe('TestPage', () => {
  it('exports a default React component', () => {
    expect(typeof TestPage).toBe('function');
  });

  it('renders the pipeline smoke-test heading', () => {
    const text = flatten(TestPage());
    expect(text).toContain('Hello from the pipeline');
  });

  it('renders the pipeline-info card content', () => {
    const text = flatten(TestPage());
    expect(text).toContain('Pipeline is working');
    expect(text).toContain('Planner → Coder → Tester → Reviewer → Security');
  });
});
