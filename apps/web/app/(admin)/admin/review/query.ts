/**
 * The pending queue, oldest first — the order a student who has been waiting
 * longest is owed. Fifty is the largest page the list route allows that the
 * desk screen also uses (`PAGE_SIZES` is a closed list); a phone that clears
 * fifty in one sitting gets the next fifty from the live re-read.
 *
 * Its own module so the server page and the client deck read ONE string: a
 * plain `export const` from a `'use client'` file reaches a server component
 * as a client reference, not as the value.
 */
export const REVIEW_QUERY = 'status=pending&sort=oldest&perPage=50&page=1';
