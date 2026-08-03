/** Engineering Rules Engine — domain types */

export type EngineeringFieldKey =
  | 'building_type'
  | 'occupancy'
  | 'risk_classification'
  | 'applicable_codes'
  | 'fire_protection_system'
  | 'sprinkler_type'
  | 'sprinkler_density'
  | 'water_demand'
  | 'pump_requirement'
  | 'pump_capacity'
  | 'tank_size'
  | 'alarm_category'
  | 'required_reports'
  | 'required_drawings'
  | 'required_checklists';

export type EngineeringValueKind = 'select' | 'multi' | 'computed' | 'text';

export type EngineeringOption = {
  value: string;
  label_en: string;
  label_ar: string;
};

export type EngineeringFieldDef = {
  field_key: EngineeringFieldKey | string;
  label_en: string;
  label_ar: string;
  value_kind: EngineeringValueKind;
  depends_on: string[];
  cascade_order: number;
  is_active?: boolean;
};

export type EngineeringRuleRow = {
  id?: string;
  rule_code: string;
  field_key: EngineeringFieldKey | string;
  when_conditions: Record<string, string | string[]>;
  allowed_options?: EngineeringOption[] | null;
  set_value?: string | number | string[] | null;
  lock_field?: boolean;
  hide_when_empty?: boolean;
  explanation_en: string;
  explanation_ar?: string;
  code_refs: string[];
  priority: number;
  version_label: string;
  is_active: boolean;
};

/** Current engineer selections (upstream + locked downstream). */
export type EngineeringSelection = Partial<Record<EngineeringFieldKey, string | string[] | null>>;

export type EngineeringFieldState = {
  field_key: string;
  label_en: string;
  label_ar: string;
  value_kind: EngineeringValueKind;
  value: string | string[] | null;
  options: EngineeringOption[];
  locked: boolean;
  visible: boolean;
  explanation: string;
  explanation_ar: string;
  code_refs: string[];
  matched_rule_codes: string[];
};

export type EngineeringFormState = {
  selection: EngineeringSelection;
  fields: EngineeringFieldState[];
  violations: { field_key: string; message: string; code_refs: string[] }[];
};
