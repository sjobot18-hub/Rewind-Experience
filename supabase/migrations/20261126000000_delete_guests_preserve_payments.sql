-- Preserve payment history when a guest is removed from the active register.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS guest_name_snapshot text,
  ADD COLUMN IF NOT EXISTS guest_code_snapshot text,
  ADD COLUMN IF NOT EXISTS guest_phone_snapshot text,
  ADD COLUMN IF NOT EXISTS guest_ticket_fee_snapshot numeric;

UPDATE public.payments p
SET
  guest_name_snapshot = COALESCE(p.guest_name_snapshot, g.full_name),
  guest_code_snapshot = COALESCE(p.guest_code_snapshot, g.guest_code),
  guest_phone_snapshot = COALESCE(p.guest_phone_snapshot, g.phone_number),
  guest_ticket_fee_snapshot = COALESCE(p.guest_ticket_fee_snapshot, g.ticket_fee)
FROM public.guests g
WHERE p.guest_id = g.id
  AND (p.guest_name_snapshot IS NULL
    OR p.guest_code_snapshot IS NULL
    OR p.guest_phone_snapshot IS NULL
    OR p.guest_ticket_fee_snapshot IS NULL);

ALTER TABLE public.payments
  ALTER COLUMN guest_id DROP NOT NULL;

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_guest_id_fkey;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_guest_id_fkey
  FOREIGN KEY (guest_id) REFERENCES public.guests(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.capture_payment_guest_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.guest_id IS NOT NULL THEN
    SELECT
      COALESCE(NEW.guest_name_snapshot, g.full_name),
      COALESCE(NEW.guest_code_snapshot, g.guest_code),
      COALESCE(NEW.guest_phone_snapshot, g.phone_number),
      COALESCE(NEW.guest_ticket_fee_snapshot, g.ticket_fee)
    INTO
      NEW.guest_name_snapshot,
      NEW.guest_code_snapshot,
      NEW.guest_phone_snapshot,
      NEW.guest_ticket_fee_snapshot
    FROM public.guests g
    WHERE g.id = NEW.guest_id
      AND g.event_id = NEW.event_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_capture_guest_snapshot ON public.payments;
CREATE TRIGGER payments_capture_guest_snapshot
BEFORE INSERT OR UPDATE OF guest_id ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.capture_payment_guest_snapshot();

CREATE OR REPLACE VIEW public.finance_timeline AS
SELECT
  p.event_id,
  p.id AS txn_id,
  p.payment_code AS txn_code,
  'payment'::public.finance_txn_type AS txn_type,
  'Payment from ' || COALESCE(p.guest_name_snapshot, g.full_name, 'Deleted guest')
    || ' (' || COALESCE(p.guest_code_snapshot, g.guest_code, 'No guest code') || ')' AS description,
  p.amount AS money_in,
  0::numeric AS money_out,
  p.paid_at AS txn_date,
  p.created_at,
  p.payment_method,
  NULL::text AS category,
  p.guest_id AS guest_id,
  p.is_voided
FROM public.payments p
LEFT JOIN public.guests g ON g.id = p.guest_id
UNION ALL
SELECT
  e.event_id,
  e.id AS txn_id,
  e.expense_code AS txn_code,
  'expense'::public.finance_txn_type AS txn_type,
  e.description,
  0::numeric AS money_in,
  e.amount AS money_out,
  e.spent_at AS txn_date,
  e.created_at,
  e.payment_method,
  e.category,
  NULL::uuid AS guest_id,
  e.is_voided
FROM public.expenses e;

CREATE OR REPLACE FUNCTION public.delete_guest_preserve_payments(
  p_guest_id uuid,
  p_event_id uuid,
  p_actor_id uuid,
  p_actor_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_guest public.guests%ROWTYPE;
  v_payment_count integer := 0;
  v_payment_total numeric := 0;
  v_seat_count integer := 0;
BEGIN
  SELECT *
  INTO v_guest
  FROM public.guests
  WHERE id = p_guest_id
    AND event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guest not found.';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(amount), 0)
  INTO v_payment_count, v_payment_total
  FROM public.payments
  WHERE guest_id = p_guest_id
    AND event_id = p_event_id;

  UPDATE public.payments
  SET
    guest_name_snapshot = COALESCE(guest_name_snapshot, v_guest.full_name),
    guest_code_snapshot = COALESCE(guest_code_snapshot, v_guest.guest_code),
    guest_phone_snapshot = COALESCE(guest_phone_snapshot, v_guest.phone_number),
    guest_ticket_fee_snapshot = COALESCE(guest_ticket_fee_snapshot, v_guest.ticket_fee),
    guest_id = NULL
  WHERE guest_id = p_guest_id
    AND event_id = p_event_id;

  DELETE FROM public.seat_assignments
  WHERE guest_id = p_guest_id
    AND event_id = p_event_id;
  GET DIAGNOSTICS v_seat_count = ROW_COUNT;

  DELETE FROM public.guests
  WHERE id = p_guest_id
    AND event_id = p_event_id;

  INSERT INTO public.audit_logs (
    event_id, actor_id, actor_email, action, record_type, record_id,
    previous_value, new_value
  )
  VALUES (
    p_event_id,
    p_actor_id,
    p_actor_email,
    'guest_deleted_payments_preserved',
    'guest',
    p_guest_id::text,
    jsonb_build_object(
      'id', v_guest.id,
      'guest_code', v_guest.guest_code,
      'full_name', v_guest.full_name,
      'phone_number', v_guest.phone_number,
      'gender', v_guest.gender,
      'ticket_fee', v_guest.ticket_fee,
      'notes', v_guest.notes,
      'registered_at', v_guest.registered_at,
      'registered_by', v_guest.registered_by,
      'preserved_payment_count', v_payment_count,
      'preserved_payment_amount', v_payment_total,
      'released_seat_assignment_count', v_seat_count
    ),
    NULL
  );

  RETURN jsonb_build_object(
    'deleted_guest_code', v_guest.guest_code,
    'preserved_payment_count', v_payment_count,
    'preserved_payment_amount', v_payment_total,
    'released_seat_assignment_count', v_seat_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_guest_preserve_payments(uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_guest_preserve_payments(uuid, uuid, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_guest_preserve_payments(uuid, uuid, uuid, text) TO service_role;
