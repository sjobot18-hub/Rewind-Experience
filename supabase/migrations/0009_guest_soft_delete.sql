-- ============================================================================
-- 9. Guest soft-delete support
-- ============================================================================
-- Adds a deleted_at column to the guests table to allow safe removal of
-- guests whose only payment records are already voided, without deleting
-- or modifying any financial history.
--
-- Physical deletion is blocked by the payments_guest_id_fkey FK constraint
-- (ON DELETE RESTRICT). This column enables a non-destructive "archive"
-- approach: the guest is marked as deleted and excluded from active views,
-- while all payment records and their financial history remain fully intact.
-- ============================================================================

alter table public.guests add column if not exists deleted_at timestamptz;

create index if not exists idx_guests_deleted_at
  on public.guests (deleted_at)
  where deleted_at is not null;
