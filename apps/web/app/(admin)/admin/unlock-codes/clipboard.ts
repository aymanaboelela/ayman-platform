/**
 * Copy a string, and say whether it worked.
 *
 * Two paths, for the reason `platforms-form.tsx` and `subscribe-panel.tsx`
 * give: `navigator.clipboard` needs a secure context and can be refused by
 * permissions policy outright, and `execCommand('copy')` on a selected
 * off-screen textarea still works where it is. A code the admin THINKS was
 * copied and pastes as the previous one is a student with the wrong lecture.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fall through to the legacy path.
  }

  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.appendChild(field);
  try {
    field.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
  }
}
