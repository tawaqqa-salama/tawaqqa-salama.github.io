/**
 * Build ProjectDesignStandardsContext from live client + engineering data.
 * No invented equipment — flags come only from declared project fields.
 */

import { isKitchenActivity } from '@/lib/projects/completion-certificate-attachments';
import { normalizeQuotationServices } from '@/lib/constants/quotation-services';
import type { FireSystemKind } from '@/lib/projects/design-center/types';
import type { ProjectDesignStandardsContext } from '@/lib/projects/design-center/standards/types';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';

function num(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function yes(v: string | null | undefined): boolean {
  return v === 'نعم' || v === 'yes' || v === 'Yes' || v === 'true';
}

const SPECIAL: FireSystemKind[] = ['fm200', 'co2', 'clean_agent', 'kitchen_hood'];

export function buildProjectDesignStandardsContext(
  client: Pick<
    ClientRecord,
    | 'id'
    | 'name'
    | 'business_name'
    | 'activity_type'
    | 'building_area'
    | 'floors_count'
    | 'quotation_services'
  >,
  data: ProjectEngineeringData
): ProjectDesignStandardsContext {
  const plan = data.building_plan;
  const systems = data.design_center?.systems || [];
  const calcs = data.design_center?.calculations || [];
  const services = normalizeQuotationServices(client.quotation_services);

  const selectedSystems = systems
    .filter((s) => s.status === 'completed' || s.status === 'running' || s.status === 'queued')
    .map((s) => s.kind);

  const hasSprinkler =
    yes(plan.sprinkler_system) ||
    selectedSystems.includes('sprinkler') ||
    services.includes('firefighting_plans');

  const hasFireAlarm =
    yes(plan.fire_alarm_system) ||
    selectedSystems.includes('fire_alarm') ||
    services.includes('alarm_plans');

  const height = num(plan.building_height_m);
  const floors = num(client.floors_count);
  const highRise =
    yes(plan.high_rise_building) ||
    (height != null && height >= 23) ||
    (floors != null && floors >= 7);

  const hasStandpipe =
    selectedSystems.includes('hose_reel') || (highRise && hasSprinkler);

  // Fire pump: only when declared via pump calc completed, or hydraulic service with water-based system
  const pumpCalcDone = calcs.some((c) => c.kind === 'pump' && c.status === 'completed');
  const hasFirePump =
    pumpCalcDone ||
    (services.includes('hydraulic_calculations') &&
      (hasSprinkler || selectedSystems.includes('hose_reel') || hasStandpipe));

  const hasUndergroundMain =
    yes(plan.underground_building) || Boolean(plan.underground_depth_m?.trim());

  const kitchenActivity = isKitchenActivity({
    activityType: client.activity_type,
    activityLabel: client.activity_type,
  });

  const specialSuppression = SPECIAL.filter(
    (k) => selectedSystems.includes(k) || (k === 'kitchen_hood' && kitchenActivity)
  );

  const occupancy =
    plan.occupancy_classification ||
    data.technical_report?.building_classification ||
    null;

  return {
    projectId: client.id,
    projectName: client.business_name || client.name || client.id,
    occupancy,
    activityType: client.activity_type || null,
    buildingUse: occupancy || client.activity_type || null,
    buildingAreaM2: num(client.building_area) ?? num(plan.total_site_area_m2),
    floorsCount: floors,
    buildingHeightM: height,
    hasFirePump,
    hasUndergroundMain,
    hasStandpipe,
    hasSprinkler,
    hasFireAlarm,
    highRise,
    kitchenActivity,
    specialSuppression,
    selectedSystems,
    saudiCodesApplied: ['SBC-801'],
    quotationServices: services,
  };
}
