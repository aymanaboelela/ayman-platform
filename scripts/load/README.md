# Load testing

See [`docs/runbooks/dos-response.md`](../../docs/runbooks/dos-response.md) §5.

**Never run against a live stack** — the three tenants share one 4-core VPS and
a flood takes all three down (CLAUDE.md §5). Run against a local production build
on a throwaway DB seeded with `loadtest-NNNN@load.test` students.

- `student-journey.js` — k6 script. Profiles: `smoke` (20), `1000`, `spike`, `breakpoint`.
- `monitor.sh` — samples api/web/pg CPU + RSS + free disk into a CSV during a run.

```bash
k6 run -e PROFILE=1000 scripts/load/student-journey.js
```
