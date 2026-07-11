-- Ensure employeeCode is not unique in environments where the index already exists
DROP INDEX IF EXISTS "User_employeeCode_key";
