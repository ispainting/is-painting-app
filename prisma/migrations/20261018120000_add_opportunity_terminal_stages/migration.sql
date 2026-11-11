-- Phase 2B: two new terminal OpportunityStage values for record hygiene.
-- Additive only: no enum renames, removals, or data changes.
-- PostgreSQL enum values are appended; existing rows are untouched.

ALTER TYPE "OpportunityStage" ADD VALUE 'invalid_duplicate';
ALTER TYPE "OpportunityStage" ADD VALUE 'spam_fraud';
