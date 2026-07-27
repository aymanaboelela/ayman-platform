import { z } from 'zod';

export const NavigationItemSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  labelAr: z.string(),
  href: z.string(),
  icon: z.string().nullable(),
  position: z.number().int(),
  visibleTo: z.array(z.string()),
  isPublished: z.boolean(),
});

export type NavigationItem = z.infer<typeof NavigationItemSchema>;

export const NavigationTreeSchema = z.array(
  NavigationItemSchema.extend({ children: z.array(NavigationItemSchema) }),
);
export type NavigationTree = z.infer<typeof NavigationTreeSchema>;

/**
 * `href` is restricted to site-relative paths. An admin-controlled menu that
 * accepts absolute URLs is an open redirect surface and, with `javascript:`,
 * a stored-XSS one. Off-site links belong in the contact settings block.
 */
const internalHref = z
  .string()
  .min(1)
  .max(200)
  .regex(/^\/[A-Za-z0-9\-._~/?#[\]@!$&'()*+,;=%]*$/, 'must be a site-relative path starting with /');

export const NavigationCreateSchema = z
  .object({
    parentId: z.string().uuid().nullable().default(null),
    labelAr: z.string().min(1).max(60),
    href: internalHref,
    icon: z.string().max(40).nullable().default(null),
    visibleTo: z.array(z.string().regex(/^[a-z-]+:[a-z-]+$/)).max(10).default([]),
    isPublished: z.boolean().default(true),
  })
  .strict();

export type NavigationCreate = z.infer<typeof NavigationCreateSchema>;

export const NavigationPatchSchema = NavigationCreateSchema.partial().strict();
export type NavigationPatch = z.infer<typeof NavigationPatchSchema>;

/**
 * ONE write for a whole reorder. `ids` is the complete ordered list for a
 * single parent level — the server rejects it if the set does not match
 * exactly, which turns a lost drag into a 409 instead of silent data loss.
 */
export const ReorderSchema = z
  .object({
    parentId: z.string().uuid().nullable(),
    ids: z.array(z.string().uuid()).min(1).max(200),
  })
  .strict()
  .refine((value) => new Set(value.ids).size === value.ids.length, {
    message: 'ids must be unique',
    path: ['ids'],
  });

export type Reorder = z.infer<typeof ReorderSchema>;
