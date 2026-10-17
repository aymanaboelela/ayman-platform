import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CHUNK_SCRIPT_RESCUE, DOM_MUTATION_GUARD, PREPAINT_SCRIPT } from './prepaint-script';

/**
 * `DOM_MUTATION_GUARD` exists because a browser translator rewrites the DOM
 * React owns and React's next commit then throws — `insertBefore` on `/game`,
 * `removeChild` on a course page (facebook/react#11538).
 *
 * Proven the honest way: a REAL React root, a REAL re-render, and a
 * translator simulated the way Chrome's and Edge's actually behave — each text
 * node wrapped in, or swapped for, `<font>` elements. The first test shows the
 * simulation reproduces the production crash with the native methods; the
 * rest show the guard keeps the same commit alive and the page correct.
 */

// A bare `createRoot` rather than Testing Library, so React has to be told
// this is a test environment for `act` to flush synchronously.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const native = {
  removeChild: Node.prototype.removeChild,
  insertBefore: Node.prototype.insertBefore,
};
let guarded: typeof native;

beforeAll(() => {
  // Installed once, exactly as the inline <script> in <head> would be.
  window.eval(DOM_MUTATION_GUARD);
  guarded = {
    removeChild: Node.prototype.removeChild,
    insertBefore: Node.prototype.insertBefore,
  };
});

afterAll(() => {
  Node.prototype.removeChild = native.removeChild;
  Node.prototype.insertBefore = native.insertBefore;
});

let root: Root | null = null;
let container: HTMLElement;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  Node.prototype.removeChild = guarded.removeChild;
  Node.prototype.insertBefore = guarded.insertBefore;
  vi.restoreAllMocks();
});

/** A paragraph React keeps re-arranging: a text that comes and goes, items that grow. */
function Live({ greeting, items }: { greeting: boolean; items: string[] }) {
  return (
    <p>
      {greeting ? 'أهلاً بيك' : null}
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
      <b>ثابت</b>
    </p>
  );
}

function mount(element: React.ReactElement) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(element));
}

function rerender(element: React.ReactElement) {
  act(() => root!.render(element));
}

/** Chrome / Edge translation, shape one: the text node moves INTO a `<font>`. */
function translateByWrapping(scope: Node) {
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node as Text);
  for (const text of texts) {
    const font = document.createElement('font');
    text.parentNode!.insertBefore(font, text);
    font.appendChild(text);
  }
}

/** Shape two: the text node is REPLACED by a `<font>` holding a new one. */
function translateBySwapping(scope: Node) {
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node as Text);
  for (const text of texts) {
    const font = document.createElement('font');
    font.textContent = `[${text.data}]`;
    text.parentNode!.replaceChild(font, text);
  }
}

describe('DOM_MUTATION_GUARD', () => {
  it('the simulation reproduces the production crash without the guard', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    Node.prototype.removeChild = native.removeChild;
    Node.prototype.insertBefore = native.insertBefore;

    mount(<Live greeting items={['أ']} />);
    translateByWrapping(container);

    // React removes the greeting's text node from the <p> it left it in.
    expect(() => rerender(<Live greeting={false} items={['أ']} />)).toThrow(/not a child/);
  });

  it('keeps the commit alive when a translator wrapped the nodes, and the page right', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount(<Live greeting items={['أ']} />);
    translateByWrapping(container);

    // A removal of a wrapped text node, and an insertion before a wrapped one.
    expect(() => rerender(<Live greeting={false} items={['أ', 'ب']} />)).not.toThrow();

    const p = container.querySelector('p')!;
    expect(p.textContent).toBe('أبثابت');
    expect(p.textContent).not.toContain('أهلاً');
    // One line for whoever has devtools open, not one per call.
    rerender(<Live greeting items={['أ', 'ب', 'ج']} />);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('keeps the commit alive when a translator swapped the nodes for its own', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount(<Live greeting items={['أ']} />);
    translateBySwapping(container);

    expect(() => rerender(<Live greeting={false} items={['أ', 'ب']} />)).not.toThrow();
    expect(container.querySelector('p')!.querySelectorAll('span')).toHaveLength(2);
  });

  it('inserts before the wrapper that now holds the reference node', () => {
    const parent = document.createElement('div');
    const first = document.createTextNode('one');
    const last = document.createElement('i');
    parent.append(first, last);
    const font = document.createElement('font');
    parent.insertBefore(font, first);
    font.appendChild(first);

    const added = document.createElement('em');
    parent.insertBefore(added, first);

    expect(Array.from(parent.childNodes)).toEqual([added, font, last]);
  });

  it('removes a node only from inside the parent it was asked about', () => {
    const parent = document.createElement('div');
    const elsewhere = document.createElement('div');
    const child = document.createElement('span');
    elsewhere.append(child);

    expect(parent.removeChild(child)).toBe(child);
    // Moved somewhere else entirely — nothing of this parent's to remove.
    expect(child.parentNode).toBe(elsewhere);
  });

  it('changes nothing when the node is where React left it', () => {
    const warn = vi.spyOn(console, 'warn');
    const parent = document.createElement('div');
    const a = document.createElement('a');
    const b = document.createElement('b');
    parent.append(b);
    parent.insertBefore(a, b);
    expect(Array.from(parent.childNodes)).toEqual([a, b]);
    parent.removeChild(a);
    expect(Array.from(parent.childNodes)).toEqual([b]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('ships inside the one inline script the layout renders, after the other two jobs', () => {
    // It must be installed before React's first commit — hydration itself
    // inserts and removes — and the prepaint script is what runs that early.
    expect(PREPAINT_SCRIPT).toContain(DOM_MUTATION_GUARD);
    expect(PREPAINT_SCRIPT.indexOf(DOM_MUTATION_GUARD)).toBeGreaterThan(
      PREPAINT_SCRIPT.indexOf(CHUNK_SCRIPT_RESCUE),
    );
  });
});
