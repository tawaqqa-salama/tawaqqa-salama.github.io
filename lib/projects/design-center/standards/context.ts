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

/** Treat 0 / empty as missing so vision / inspection can fill gaps */
function numPositive(v: string | number | null | undefined): number | null {
  const n = num(v);
  return n != null && n > 0 ? n : null;
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

  const height = num(plan.building_height_m);
  const visionRaw = data.design_center?.analysis?.result?.raw as
    | {
        cad_vision?: string;
        cad_vision_result?: {
          occupancy?: string | null;
          gross_floor_area_m2?: number | null;
          drawing_inspection?: {
            building?: {
              floors_count?: number | null;
              total_area_m2?: number | null;
              occupancy?: string | null;
            } | null;
            drawing_type?: { type?: string } | null;
          } | null;
          zone_system_requirements?: Array<{
            systems?: FireSystemKind[];
            classification?: string;
            sprinkler_density_hint?: string | null;
          }> | null;
        } | null;
      }
    | undefined;
  const visionMeta =
    visionRaw?.cad_vision === 'local_client' ? visionRaw.cad_vision_result : null;
  const inspection = visionMeta?.drawing_inspection || null;
  const drawingType = inspection?.drawing_type?.type || null;

  const hasSprinkler =
    yes(plan.sprinkler_system) ||
    selectedSystems.includes('sprinkler') ||
    services.includes('firefighting_plans') ||
    drawingType === 'fire_fighting';

  const hasFireAlarm =
    yes(plan.fire_alarm_system) ||
    selectedSystems.includes('fire_alarm') ||
    services.includes('alarm_plans') ||
    drawingType === 'fire_alarm';

  const floors =
    numPositive(client.floors_count) ??
    (typeof inspection?.building?.floors_count === 'number' &&
    inspection.building.floors_count > 0
      ? inspection.building.floors_count
      : null);
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

  const zoneReqs = visionMeta?.zone_system_requirements || [];
  const zoneKitchen = zoneReqs.some((r) => r.classification === 'kitchen');
  const zoneSpecial = new Set<FireSystemKind>();
  for (const r of zoneReqs) {
    for (const s of r.systems || []) {
      if (SPECIAL.includes(s)) zoneSpecial.add(s);
    }
  }

  const kitchenActivity =
    isKitchenActivity({
      activityType: client.activity_type,
      activityLabel: client.activity_type,
    }) || zoneKitchen;

  const specialSuppression = Array.from(
    new Set([
      ...SPECIAL.filter(
        (k) => selectedSystems.includes(k) || (k === 'kitchen_hood' && kitchenActivity)
      ),
      ...zoneSpecial,
    ])
  );

  // Zone-detected specialty systems should participate in applicability selection
  const selectedSystemsWithZones = Array.from(
    new Set([...selectedSystems, ...zoneSpecial])
  );

  const occupancy =
    plan.occupancy_classification ||
    data.technical_report?.building_classification ||
    visionMeta?.occupancy ||
    inspection?.building?.occupancy ||
    null;

  return {
    projectId: client.id,
    projectName: client.business_name || client.name || client.id,
    occupancy,
    activityType: client.activity_type || null,
    buildingUse: occupancy || client.activity_type || null,
    buildingAreaM2:
      numPositive(client.building_area) ??
      numPositive(plan.total_site_area_m2) ??
      (typeof inspection?.building?.total_area_m2 === 'number' &&
      inspection.building.total_area_m2 > 0
        ? inspection.building.total_area_m2
        : null) ??
      (typeof visionMeta?.gross_floor_area_m2 === 'number' &&
      visionMeta.gross_floor_area_m2 > 0
        ? visionMeta.gross_floor_area_m2
        : null),
    floorsCount: floors,
    buildingHeightM: numPositive(height),
    hasFirePump,
    hasUndergroundMain,
    hasStandpipe,
    hasSprinkler,
    hasFireAlarm,
    highRise,
    kitchenActivity,
    specialSuppression,
    selectedSystems: selectedSystemsWithZones,
    saudiCodesApplied: ['SBC-801'],
    quotationServices: services,
  };
}
