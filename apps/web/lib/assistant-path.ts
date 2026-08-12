import { copy } from '@ayman/contracts/copy';
import {
  ASSISTANT_NODES,
  isAssistantNodeId,
  isNextChoice,
  type AssistantNodeId,
} from '@ayman/contracts/assistant/script';

/**
 * Turning a stored `entryPath` back into Arabic.
 *
 * The path is node IDS on the wire and in the database — that is what keeps
 * user-facing copy out of Postgres and lets a question be re-worded without a
 * data migration. Something has to resolve them at read time, and that
 * something has to be ONE function: the widget's trail and the admin inbox's
 * breadcrumbs must agree, or the instructor reads a route the student never
 * saw.
 *
 * ## The label is the CHOICE, not the node
 *
 * A node's copy is a paragraph — an answer, not a title — and no node carries
 * a short name. But every node except the root is arrived at by pressing
 * something, and that button's label is both short and exactly what the
 * student remembers pressing. So a stop is labelled by the choice that leads
 * to it, found on the stop before.
 */

/** The label for stop `index`, or `null` if the path does not describe a real walk. */
function labelFor(path: readonly string[], index: number): string | null {
  const id = path[index];
  if (id === undefined || !isAssistantNodeId(id)) return null;
  if (index === 0) return copy.assistant.title;

  const previous = path[index - 1];
  if (previous === undefined || !isAssistantNodeId(previous)) return null;

  const choice = ASSISTANT_NODES[previous].choices
    .filter(isNextChoice)
    .find((candidate) => candidate.next === id);

  /*
   * No edge from the previous stop to this one. Reachable two ways: a path
   * stored before the tree was re-shaped, and a hand-edited row. Either way
   * the honest thing is to drop the crumb rather than invent a label — a blank
   * breadcrumb and a crash are both worse than a shorter trail.
   */
  return choice ? copy.assistant.choices[choice.id] : null;
}

/**
 * Every stop on the path, as Arabic, skipping the root.
 *
 * The root is dropped because "مساعد المنصة ← الاشتراك والحساب ← الكورس بكام؟"
 * spends its first and widest crumb saying where every single path starts.
 */
export function assistantPathLabels(path: readonly string[]): string[] {
  return path
    .map((_, index) => labelFor(path, index))
    .slice(1)
    .filter((label): label is string => label !== null);
}

/** The same, for the widget's trail — which DOES render the root as its first
 *  stop, because that trail is a place to tap back TO rather than a summary. */
export function assistantTrailLabels(path: readonly AssistantNodeId[]): string[] {
  return path.map((_, index) => labelFor(path, index) ?? copy.assistant.title);
}
