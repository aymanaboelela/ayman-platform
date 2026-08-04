import { describe, expect, it } from 'vitest';
import { copy } from '../copy/ar';
import {
  ASSISTANT_NODES,
  ASSISTANT_ROOT,
  isAssistantNodeId,
  isEscalateChoice,
  isLinkChoice,
  isNextChoice,
  type AssistantChoiceId,
  type AssistantNodeId,
} from './script';

/**
 * The tree is data, so its integrity is a property that can be PROVEN rather
 * than clicked through. Dangling ids and missing copy are already compile
 * errors (see the header of `script.ts`); what remains are the failures a type
 * system cannot see — a branch nobody can reach, a corner with no way out, and
 * Arabic text stranded with no node to show it.
 *
 * Every one of these has a real failure mode behind it. They are not shape
 * assertions for their own sake.
 */

const nodeIds = Object.keys(ASSISTANT_NODES) as AssistantNodeId[];

/** Node ids reachable from `root` by following `next` edges. */
function reachable(): Set<AssistantNodeId> {
  const seen = new Set<AssistantNodeId>([ASSISTANT_ROOT]);
  const queue: AssistantNodeId[] = [ASSISTANT_ROOT];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const choice of ASSISTANT_NODES[id].choices) {
      if (isNextChoice(choice) && !seen.has(choice.next)) {
        seen.add(choice.next);
        queue.push(choice.next);
      }
    }
  }
  return seen;
}

/** Whether an exit — a real page, or a human — is reachable from `from`. */
function canEscape(from: AssistantNodeId): boolean {
  const seen = new Set<AssistantNodeId>([from]);
  const queue: AssistantNodeId[] = [from];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const choice of ASSISTANT_NODES[id].choices) {
      if (isLinkChoice(choice) || isEscalateChoice(choice)) return true;
      if (isNextChoice(choice) && !seen.has(choice.next)) {
        seen.add(choice.next);
        queue.push(choice.next);
      }
    }
  }
  return false;
}

describe('assistant script graph', () => {
  it('reaches every node from the root', () => {
    /*
     * An unreachable node is copy someone wrote, translated, and reviewed that
     * no student will ever see — and the only symptom is silence. This is the
     * single most likely way to break the tree while editing it, because
     * removing ONE choice can orphan a whole subtree several levels down.
     */
    const seen = reachable();
    const orphans = nodeIds.filter((id) => !seen.has(id));
    expect(orphans).toEqual([]);
  });

  it('lets every node reach a page or a human', () => {
    /*
     * A branch whose only choices loop back into other branches is a student
     * trapped in the widget with the answer nowhere in it. `root` carries the
     * escalate choice, so in practice this holds as long as every subtree
     * keeps its way back — which is exactly the edge an edit removes by
     * accident.
     */
    const trapped = nodeIds.filter((id) => !canEscape(id));
    expect(trapped).toEqual([]);
  });

  it('gives every node at least one choice', () => {
    // There is no terminal node type. A node with no buttons renders an answer
    // and then a dead panel — no back, no restart, nothing.
    const empty = nodeIds.filter((id) => ASSISTANT_NODES[id].choices.length === 0);
    expect(empty).toEqual([]);
  });

  it('never offers the same choice id twice on one node', () => {
    // React keys the buttons by choice id, and two `back`s on one node would
    // both collide in the DOM and read as a mistake to the student.
    const duplicated = nodeIds.filter((id) => {
      const ids = ASSISTANT_NODES[id].choices.map((choice) => choice.id);
      return new Set(ids).size !== ids.length;
    });
    expect(duplicated).toEqual([]);
  });

  it('links only to internal paths', () => {
    /*
     * `href` reaches a `<Link>`. An absolute URL here would be an off-site
     * navigation authored in a data file that no reviewer reads as one — the
     * same reasoning `admin/navigation.ts` records for the nav editor.
     */
    const external = nodeIds.flatMap((id) =>
      ASSISTANT_NODES[id].choices
        .filter(isLinkChoice)
        .filter((choice) => !choice.href.startsWith('/') || choice.href.startsWith('//'))
        .map((choice) => `${id} → ${choice.href}`),
    );
    expect(external).toEqual([]);
  });

  it('uses every choice label it declares', () => {
    // The mirror of the reachability check, for `copy.assistant.choices`:
    // stranded Arabic that no button renders.
    const used = new Set<AssistantChoiceId>(
      nodeIds.flatMap((id) => ASSISTANT_NODES[id].choices.map((choice) => choice.id)),
    );
    const declared = Object.keys(copy.assistant.choices) as AssistantChoiceId[];
    expect(declared.filter((id) => !used.has(id))).toEqual([]);
  });

  it('answers every node with a non-empty body', () => {
    const blank = nodeIds.filter((id) => copy.assistant.script[id].trim().length === 0);
    expect(blank).toEqual([]);
  });

  it('offers a way to a human from the root', () => {
    // The escalation is the feature's reason to exist. If an edit ever removes
    // it from the root, the widget becomes an FAQ nobody asked for.
    expect(ASSISTANT_NODES[ASSISTANT_ROOT].choices.some(isEscalateChoice)).toBe(true);
  });
});

describe('isAssistantNodeId', () => {
  it('accepts real node ids', () => {
    expect(isAssistantNodeId('root')).toBe(true);
    expect(isAssistantNodeId('joinPrice')).toBe(true);
  });

  it('rejects anything else', () => {
    // `entryPath` arrives from a browser. These are the shapes that actually
    // turn up — a typo, a prototype key, an injection attempt.
    expect(isAssistantNodeId('nope')).toBe(false);
    expect(isAssistantNodeId('')).toBe(false);
    expect(isAssistantNodeId('__proto__')).toBe(false);
    expect(isAssistantNodeId('constructor')).toBe(false);
    expect(isAssistantNodeId('toString')).toBe(false);
  });
});
