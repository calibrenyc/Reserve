export interface Vendor {
  id: string;
  name: string;
  account_number?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  website?: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
  conversions?: { from_uom: string; to_uom: string; factor: number }[];
}

export interface InventoryItem {
  id: string;
  name: string;
  sku?: string;
  category: string;
  subcategory?: string;
  storage_location: string;
  base_uom: string;
  purchase_uom?: string;
  count_uom?: string;
  reporting_uom?: string;
  pack_count?: number;
  pack_unit_quantity?: number;
  pack_unit?: string;
  pack_size_raw?: string;
  enabled_count_units?: string[];
  current_cost: number;
  previous_cost: number;
  average_cost: number;
  last_purchase_cost: number;
  preferred_vendor_id?: string;
  is_key_item: boolean;
  is_active: boolean;
  created_at: string;
  conversions?: { from_uom: string; to_uom: string; factor: number }[];
}

export interface InvoiceLine {
  debug_id?: string;
  id?: string;
  line_number: number;
  vendor_sku?: string;
  description: string;
  quantity?: number | null;
  unit_of_measure?: string;
  pack_size?: string;
  unit_cost?: number | null;
  extended_cost?: number | null;
  confidence: number;
  field_confidence?: string;
  validation_status?: string;
  source_boxes?: string;
  mapped_inventory_item_id?: string;
  is_mapped?: boolean;
}

export interface Invoice {
  id: string;
  invoice_number?: string;
  vendor_id?: string;
  vendor_name_raw?: string;
  invoice_date?: string;
  due_date?: string;
  po_number?: string;
  status: 'Uploaded' | 'Processing' | 'Needs Review' | 'Approved' | 'Rejected' | 'Archived';
  subtotal: number;
  tax: number;
  delivery_fees: number;
  other_fees: number;
  credits: number;
  discounts: number;
  total_amount: number;
  vendor_confidence: number;
  invoice_number_confidence: number;
  total_confidence: number;
  file_path?: string;
  raw_ocr_text?: string;
  pipeline_debug?: string;
  notes?: string;
  created_at: string;
  approved_at?: string;
  approved_by?: string;
  lines: InvoiceLine[];
}

export interface AvTItem {
  item_id: string;
  item_name: string;
  category: string;
  base_uom: string;
  unit_cost: number;
  beginning_inventory: number;
  purchases: number;
  transfers_in: number;
  transfers_out: number;
  waste: number;
  ending_inventory: number;
  actual_usage: number;
  theoretical_usage: number;
  quantity_variance: number;
  dollar_variance: number;
  actual_dollar: number;
  theoretical_dollar: number;
  variance_pct: number;
  unexplained_variance: number;
  unexplained_dollar: number;
}

export interface AvTReport {
  summary: {
    total_actual_cost: number;
    total_theoretical_cost: number;
    total_dollar_variance: number;
    total_variance_pct: number;
  };
  items: AvTItem[];
}

export interface Deposit {
  id: string;
  business_date: string;
  deposit_date: string;
  expected_cash: number;
  actual_cash: number;
  deposit_amount: number;
  over_short: number;
  deposit_reference?: string;
  bank_reference?: string;
  manager?: string;
  status: 'Open' | 'Prepared' | 'Deposited' | 'Verified';
  notes?: string;
  created_at: string;
}
