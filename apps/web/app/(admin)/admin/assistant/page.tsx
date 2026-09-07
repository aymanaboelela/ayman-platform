import { redirect } from 'next/navigation';

/**
 * «أسئلة الطلبة» lives inside «صندوق الوارد» now — see `InboxTabs`.
 *
 * A permanent redirect rather than a deleted route. This URL is in the
 * instructor's history and, more importantly, in the sidebar of every tab he
 * already had open when the deploy landed: a route that 404s teaches him a
 * screen was removed, and it was not, it moved. Cheap to keep and it costs one
 * navigation.
 */
export default function AdminAssistantQuestionsRedirect(): never {
  redirect('/admin/inbox/questions');
}
