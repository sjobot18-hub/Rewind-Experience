-- ============================================================================
-- 9. Allow guest deletion with voided payment history
-- ============================================================================
-- payments.guest_id is currently NOT NULL with ON DELETE RESTRICT, which
-- physically blocks deleting any guest who has payment records -- even
-- voided ones. Since voided payments are already excluded from all
-- financial totals (guest_financials, event_dashboard, finance_timeline
-- all filter on `not is_voided`), making the column nullable allows us
-- to safely detach voided payment records from a guest before deletion
-- without deleting, modifying, or losing any financial history.
--
-- This migration only drops the NOT NULL constraint on guest_id.
-- The foreign key constraint (payments_guest_id_fkey) is preserved.
-- Active (non-voided) payments still prevent guest deletion via the
-- application-layer check in the delete API route.
-- ============================================================================

alter table public.payments alter column guest_id drop not null;
