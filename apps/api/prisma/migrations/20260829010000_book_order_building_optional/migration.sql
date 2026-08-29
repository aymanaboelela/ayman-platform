-- «رقم العمارة» becomes optional — some addresses genuinely have no
-- building number (a named house, a rural address), and Ayman asked for
-- this field to stop being required.

ALTER TABLE "app"."book_orders"
  ALTER COLUMN "address_building" DROP NOT NULL;
