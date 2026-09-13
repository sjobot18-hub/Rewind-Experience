export type AdminRole = "owner" | "finance_admin" | "event_admin" | "custom_admin";
export type AdminStatus = "active" | "deactivated";
export type Gender = "male" | "female";
export type GuestStatus = "unpaid" | "part_payment" | "paid";
export type PaymentMethod = "cash" | "transfer" | "pos";
export type EventStatus = "active" | "archived";

export interface AdminProfile {
  id: string;
  full_name: string;
  email: string;
  role: AdminRole;
  status: AdminStatus;
  is_owner: boolean;
  created_at: string;
}

export interface EventRecord {
  id: string;
  name: string;
  year: number;
  event_date: string | null;
  presented_by: string;
  mens_ticket_price: number;
  womens_ticket_price: number;
  currency: string;
  status: EventStatus;
  is_currently_active: boolean;
  seat_selection_open?: boolean;
  seat_selection_deadline?: string | null;
  allow_member_seat_changes?: boolean;
}

export interface Guest {
  id: string;
  event_id: string;
  guest_code: string;
  full_name: string;
  phone_number: string;
  gender: Gender;
  ticket_fee: number;
  notes: string | null;
  registered_at: string;
}

export interface GuestFinancials extends Guest {
  guest_id: string;
  total_paid: number;
  balance: number;
  status: GuestStatus;
  is_overpaid: boolean;
  overpayment_amount: number;
  payment_count: number;
}

export interface Payment {
  id: string;
  event_id: string;
  guest_id: string;
  payment_code: string;
  public_payment_id?: string | null;
  receipt_number: string;
  amount: number;
  payment_method: PaymentMethod;
  received_by: string;
  paid_at: string;
  notes: string | null;
  is_overpayment: boolean;
  is_voided: boolean;
  created_at: string;
}

export interface Expense {
  id: string;
  event_id: string;
  expense_code: string;
  category: string;
  description: string;
  vendor: string | null;
  amount: number;
  payment_method: PaymentMethod;
  recorded_by: string;
  spent_at: string;
  notes: string | null;
  balance_before: number;
  balance_after: number;
  is_voided: boolean;
  created_at: string;
}

export interface EventDashboard {
  event_id: string;
  name: string;
  year: number;
  presented_by: string;
  mens_ticket_price: number;
  womens_ticket_price: number;
  status: EventStatus;
  total_expected_income: number;
  total_money_received: number;
  total_expenses: number;
  available_balance: number;
  total_guests: number;
  paid_guests: number;
  part_payment_guests: number;
  unpaid_guests: number;
  male_guests: number;
  female_guests: number;
  male_ticket_revenue: number;
  female_ticket_revenue: number;
}

export type GameLocation = "beach" | "apartment";
export type GameStatus = "pending" | "completed";

export interface Game {
  id: string;
  event_id: string;
  name: string;
  location: GameLocation;
  description: string | null;
  tiktok_url: string | null;
  notes: string | null;
  status: GameStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const EXPENSE_CATEGORIES = [
  "Venue", "Food", "Drinks", "Decoration", "Entertainment", "Transportation",
  "Security", "Photography", "Marketing", "Staff", "Equipment", "Other",
] as const;
