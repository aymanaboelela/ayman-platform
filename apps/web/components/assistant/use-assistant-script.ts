'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  ASSISTANT_NODES,
  ASSISTANT_ROOT,
  isNextChoice,
  type AssistantChoice,
  type AssistantNode,
  type AssistantNodeId,
} from '@ayman/contracts/assistant/script';

/**
 * Walking the tree. Pure state — no DOM, no fetch, no `motion`.
 *
 * Separated from the panel so the thing worth testing (where a student ends up
 * after a sequence of taps, and what path is recorded when they give up) can be
 * tested without rendering anything. `use-assistant-script.test.ts` does
 * exactly that.
 */

export interface AssistantScriptState {
  /** The node being shown. */
  node: AssistantNode;
  nodeId: AssistantNodeId;
  /**
   * Every node visited, oldest first, INCLUDING the current one. This is what
   * the trail renders, and — unchanged — what the API stores as `entryPath`
   * when the student escalates. The two are the same value on purpose: what
   * the instructor reads in the inbox is literally what the student saw.
   */
  path: AssistantNodeId[];
  choose: (choice: AssistantChoice) => void;
  /** Jump back to an earlier stop, truncating everything after it. */
  rewindTo: (index: number) => void;
  restart: () => void;
}

export function useAssistantScript(): AssistantScriptState {
  const [path, setPath] = useState<AssistantNodeId[]>([ASSISTANT_ROOT]);

  const nodeId = path[path.length - 1] ?? ASSISTANT_ROOT;

  const choose = useCallback((choice: AssistantChoice) => {
    // Link and escalate choices are the caller's business — navigation and the
    // handoff form, neither of which is a move within the tree.
    if (!isNextChoice(choice)) return;

    setPath((current) => {
      const existing = current.indexOf(choice.next);
      /*
       * Revisiting a node TRUNCATES rather than appends.
       *
       * Every branch carries a `back` choice, so `root → courses → back` would
       * otherwise record `[root, courses, root]` and grow without bound as the
       * student explored — turning the trail into a history log and the stored
       * `entryPath` into a transcript of wandering rather than the route they
       * actually took. Truncating means the path always reads as the shortest
       * way to where they are.
       */
      if (existing !== -1) return current.slice(0, existing + 1);
      return [...current, choice.next];
    });
  }, []);

  const rewindTo = useCallback((index: number) => {
    setPath((current) => (index < 0 || index >= current.length ? current : current.slice(0, index + 1)));
  }, []);

  const restart = useCallback(() => setPath([ASSISTANT_ROOT]), []);

  const node = useMemo(() => ASSISTANT_NODES[nodeId], [nodeId]);

  return { node, nodeId, path, choose, rewindTo, restart };
}
