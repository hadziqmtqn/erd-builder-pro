-- Normalize legacy local-PostgreSQL timestamp columns.
--
-- The old local schema used TIMESTAMP WITHOUT TIME ZONE. JavaScript Date
-- values are UTC instants, so their wall-clock values must be interpreted as
-- UTC before changing the column type. New writes use TIMESTAMPTZ and can no
-- longer be confused with the database session timezone.
DO $$
DECLARE
  column_record RECORD;
BEGIN
  FOR column_record IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type = 'timestamp without time zone'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE TIMESTAMPTZ(3) USING %I AT TIME ZONE ''UTC''',
      column_record.table_name,
      column_record.column_name,
      column_record.column_name
    );
  END LOOP;
END $$;
