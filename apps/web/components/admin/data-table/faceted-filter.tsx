'use client';

import { ListFilter } from 'lucide-react';
import {
  Badge,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ayman/ui';

export interface FacetedFilterOption {
  value: string;
  label: string;
}

export interface FacetedFilterProps {
  title: string;
  options: readonly FacetedFilterOption[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
}

/** A multi-select column filter, driven by the route's own nuqs array parser. */
export function FacetedFilter({ title, options, selected, onChange }: FacetedFilterProps) {
  const selectedSet = new Set(selected);

  function toggle(value: string) {
    const next = new Set(selectedSet);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange([...next]);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-8 rounded-[var(--r-sm)] border border-line px-12 py-8 text-[length:var(--fs-text-sm)] text-fg-muted hover:bg-surface-3"
        >
          <ListFilter className="size-4" aria-hidden="true" />
          <span>{title}</span>
          {selectedSet.size > 0 ? <Badge>{selectedSet.size}</Badge> : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>{title}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selectedSet.has(option.value)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => toggle(option.value)}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
