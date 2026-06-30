-- Merge existing split note fields into Job.notes before removing columns.
UPDATE "Job"
SET "notes" = TRIM(BOTH E'\n' FROM CONCAT_WS(
  E'\n\n',
  NULLIF("notes", ''),
  CASE WHEN "internalNotes" IS NOT NULL AND "internalNotes" <> '' THEN CONCAT('Internal Notes: ', "internalNotes") END,
  CASE WHEN "customerNotes" IS NOT NULL AND "customerNotes" <> '' THEN CONCAT('Customer Notes: ', "customerNotes") END,
  CASE WHEN "crewInstructions" IS NOT NULL AND "crewInstructions" <> '' THEN CONCAT('Crew Instructions: ', "crewInstructions") END,
  CASE WHEN "completionNotes" IS NOT NULL AND "completionNotes" <> '' THEN CONCAT('Completion Notes: ', "completionNotes") END
))
WHERE "internalNotes" IS NOT NULL
   OR "customerNotes" IS NOT NULL
   OR "crewInstructions" IS NOT NULL
   OR "completionNotes" IS NOT NULL;

-- Drop split note columns now that notes are merged.
ALTER TABLE "Job"
DROP COLUMN "internalNotes",
DROP COLUMN "customerNotes",
DROP COLUMN "crewInstructions",
DROP COLUMN "completionNotes";
