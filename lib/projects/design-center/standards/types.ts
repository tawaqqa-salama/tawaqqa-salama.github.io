/**
 * Design Center — Standards / Code applicability types.
 * Source of truth for what may appear on fire-protection system cards.
 * AI must not invent standards; only resolve against this model + catalog.
 */

import type { FireSystemKind } from '@/lib/projects/design-center/types';

export type StandardSourceKind =
  | 'official_code'
  | 'official_standard'
  | 'project_requirement'
  | 'engineer_verified'
  | 'internal_knowledge_base';

export type StandardJurisdiction = 'saudi' | 'international' | 'project';

export type StandardCategory =
  | 'saudi_code'
  | 'system_standard'
  | 'referenced_standard'
  | 'authority'
  | 'equipment';

export type StandardVerificationStatus =
  | 'verified'
  | 'edition_not_verified'
  | 'not_verified'
  | 'needs_engineer_review';

export type StandardApplicabilityTier =
  | 'primary'
  | 'saudi_code'
  | 'related'
  | 'conditional'
  | 'not_applicable';

/** Conditions evaluated against ProjectDesignStandardsContext */
export type StandardCondition =
  | { type: 'always' }
  | { type: 'system_is'; systems: FireSystemKind[] }
  | { type: 'project_has_system'; systems: FireSystemKind[] }
  | { type: 'has_fire_pump' }
  | { type: 'has_standpipe' }
  | { type: 'has_underground_main' }
  | { type: 'min_floors'; value: number }
  | { type: 'min_height_m'; value: number }
  | { type: 'min_area_m2'; value: number }
  | { type: 'kitchen_activity' }
  | { type: 'high_rise' }
  | { type: 'occupancy_matches'; patterns: string[] };

export type StandardReference = {
  id: string;
  code: string;
  title: string;
  title_ar: string;
  /** Never invent — null means UI shows "Edition not verified" */
  edition: string | null;
  jurisdiction: StandardJurisdiction;
  category: StandardCategory;
  applicableSystems: FireSystemKind[];
  /** Tier when conditions pass for the selected system */
  tier: Exclude<StandardApplicabilityTier, 'not_applicable'>;
  conditions: StandardCondition[];
  /** Extra systems that may show this as related/conditional when present */
  relatedSystems?: FireSystemKind[];
  priority: number;
  source: StandardSourceKind;
  status: StandardVerificationStatus;
  /** Why this row exists in the catalog (repo path / library) */
  catalogNote?: string;
};

export type ResolvedStandard = {
  reference: StandardReference;
  tier: StandardApplicabilityTier;
  why_ar: string;
  why_en: string;
  editionLabel: string;
  conditionMet: boolean;
};

export type ProjectDesignStandardsContext = {
  projectId: string;
  projectName: string;
  occupancy: string | null;
  activityType: string | null;
  buildingUse: string | null;
  buildingAreaM2: number | null;
  floorsCount: number | null;
  buildingHeightM: number | null;
  hasFirePump: boolean;
  hasUndergroundMain: boolean;
  hasStandpipe: boolean;
  hasSprinkler: boolean;
  hasFireAlarm: boolean;
  highRise: boolean;
  kitchenActivity: boolean;
  specialSuppression: FireSystemKind[];
  selectedSystems: FireSystemKind[];
  saudiCodesApplied: string[];
  quotationServices: string[];
};

export type StandardsApplicabilityResult = {
  applicable: ResolvedStandard[];
  conditional: ResolvedStandard[];
  notApplicable: ResolvedStandard[];
  warnings: string[];
  primary: ResolvedStandard[];
  saudiCode: ResolvedStandard[];
  related: ResolvedStandard[];
  whyApplicable_ar: string;
  whyApplicable_en: string;
  requirementsSummary: {
    total: number;
    verified: number;
    notes: number;
    reviewStatus: 'needs_engineer_review' | 'partially_verified' | 'not_verified';
  };
};

export type SystemStandardsSnapshot = {
  system: FireSystemKind;
  resolvedAt: string;
  primary: Array<{
    code: string;
    title: string;
    title_ar: string;
    editionLabel: string;
    source: StandardSourceKind;
    status: StandardVerificationStatus;
    why_ar: string;
    why_en: string;
  }>;
  saudiCode: Array<{
    code: string;
    title: string;
    title_ar: string;
    editionLabel: string;
    source: StandardSourceKind;
    status: StandardVerificationStatus;
    why_ar: string;
    why_en: string;
  }>;
  related: Array<{
    code: string;
    title: string;
    title_ar: string;
    editionLabel: string;
    source: StandardSourceKind;
    status: StandardVerificationStatus;
    why_ar: string;
    why_en: string;
  }>;
  conditional: Array<{
    code: string;
    title: string;
    title_ar: string;
    editionLabel: string;
    source: StandardSourceKind;
    status: StandardVerificationStatus;
    why_ar: string;
    why_en: string;
  }>;
  warnings: string[];
  whyApplicable_ar: string;
  whyApplicable_en: string;
  requirementsSummary: StandardsApplicabilityResult['requirementsSummary'];
};
