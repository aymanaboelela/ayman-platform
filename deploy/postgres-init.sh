#!/bin/bash
# بيتشغّل مرة واحدة، أول ما الـ volume بتاع Postgres يتعمل. مرة تانية بعد كده
# الـ entrypoint بيتخطّاه تمامًا — فأي تعديل هنا محتاج volume جديد عشان يبان.
#
# صورة postgres بتعمل الداتابيز ودور `ayman_owner` لوحدها من POSTGRES_*.
# الناقص هو دور التشغيل المحدود، وده **مش تفصيلة**: `ayman_runtime` بيقرا
# ويكتب صفوف وبس، ومش قادر يعمل جدول ولا دالة. ده الضابط اللي بيمنع أي ثغرة
# SQL من إنها تعدّل بنية الداتابيز.
#
# النسخة اللي في scripts/db-bootstrap.sql فيها باسوردات تطوير مكتوبة صريحة
# واسم داتابيز مختلف — عشان كده مش بتتنسخ هنا؛ ده مكافئها للحاويات، بباسورد
# جاي من البيئة.
set -euo pipefail

: "${RUNTIME_PASSWORD:?RUNTIME_PASSWORD must be set}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
	CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION $POSTGRES_USER;

	-- الأدوار عالمية على مستوى السيرفر، فالإنشاء بيبقى مشروط.
	DO \$\$
	BEGIN
	  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ayman_runtime') THEN
	    CREATE ROLE ayman_runtime LOGIN PASSWORD '$RUNTIME_PASSWORD';
	  END IF;
	END
	\$\$;

	-- schema public بيبقى مفتوح للجميع افتراضيًا في نسخ Postgres القديمة.
	REVOKE ALL ON SCHEMA public FROM PUBLIC;

	-- ملحوظ: مفيش CREATE. الدور ده بيشتغل على الصفوف، مش على البنية.
	GRANT USAGE ON SCHEMA app TO ayman_runtime;
	GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO ayman_runtime;
	GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO ayman_runtime;

	-- الجداول لسه متعملتش (الميجريشن بتيجي بعدين، بدور الـ owner)، فالصلاحيات
	-- دي لازم تتطبّق على اللي جاي كمان — من غير السطرين دول أي جدول جديد
	-- بيبقى غير مقروء للـ runtime وبيبان كخطأ صلاحيات بعد أول نشر.
	ALTER DEFAULT PRIVILEGES FOR ROLE $POSTGRES_USER IN SCHEMA app
	  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ayman_runtime;
	ALTER DEFAULT PRIVILEGES FOR ROLE $POSTGRES_USER IN SCHEMA app
	  GRANT USAGE, SELECT ON SEQUENCES TO ayman_runtime;
SQL

echo "postgres-init: ayman_runtime created with row-level privileges only"
