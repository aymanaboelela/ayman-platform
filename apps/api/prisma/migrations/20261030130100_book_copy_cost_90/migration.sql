-- «سعر الطباعة نفسه بـ ٩٠ كل الكتب» — Ayman, 2026-10-30.
--
-- The catalogue carried 160 on two titles (more than the 150 they sell for)
-- and nothing on the other two, and every order line froze whichever of those
-- it saw, so «مكسب الكتب» was computed against a cost nobody pays.
--
-- Scoped to the four titles BY ID, which exist only on the Ayman stack: this
-- migration runs on every tenant and must be a no-op everywhere else. Order
-- lines are restated deliberately — the snapshot exists to stop an ordinary
-- price edit rewriting history, and this is the one-off correction of a
-- wrong figure, not a price change.
UPDATE "app"."books"
SET "unit_cost_cents" = 9000
WHERE "id" IN (
  'fef104e6-220f-4f64-9911-8f9ed06336a2',
  '2df18b30-7502-4e72-aa17-4b85db6e5d72',
  'e1242e46-7236-4043-b27c-dd6786caf9c4',
  'f2b9bed4-6dbf-4950-a266-d52e09d21931'
);

UPDATE "app"."book_order_items"
SET "unit_cost_cents" = 9000
WHERE "book_id" IN (
  'fef104e6-220f-4f64-9911-8f9ed06336a2',
  '2df18b30-7502-4e72-aa17-4b85db6e5d72',
  'e1242e46-7236-4043-b27c-dd6786caf9c4',
  'f2b9bed4-6dbf-4950-a266-d52e09d21931'
);
