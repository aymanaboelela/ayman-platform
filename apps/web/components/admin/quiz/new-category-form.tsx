'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { copy } from '@ayman/contracts';
import { Button, Input, Label } from '@ayman/ui';
import { apiPost } from '@/lib/api';

const CategorySchema = z.object({ id: z.string(), name: z.string() });

/**
 * v1 has no category management screen (out of this plan's scope) — this is
 * the minimal affordance the question form needs to ever have a real
 * `categoryId` to offer, not a full CRUD page.
 */
export function NewCategoryForm({ categories }: { categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);

  async function create() {
    if (name.trim().length === 0) return;
    setPending(true);
    try {
      await apiPost('/api/admin/questions/categories', CategorySchema, { name: name.trim() });
      setName('');
      router.refresh();
    } catch {
      toast.error(copy.admin.common.saveFailed);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-sm border border-line-subtle bg-surface-2 p-3">
      <div className="min-w-0 flex-1">
        <Label htmlFor="new-category">{copy.quizAdmin.newCategory}</Label>
        <Input
          id="new-category"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={copy.quizAdmin.categoryNamePlaceholder}
        />
      </div>
      <Button type="button" variant="secondary" onClick={create} disabled={pending}>
        {copy.admin.common.create}
      </Button>
      {categories.length === 0 ? (
        <p className="w-full text-[length:var(--fs-text-xs)] text-fg-muted">{copy.quizAdmin.noCategories}</p>
      ) : null}
    </div>
  );
}
