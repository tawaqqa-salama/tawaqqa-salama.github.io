/**
 * NFPA 13 edition verification — project cover adoption (2025).
 *
 * Cover metadata only. Platform remains NOT_VERIFIED_OFFICIAL.
 * No numeric cells encoded from cover alone.
 */

import { describe, expect, it } from 'vitest';
import { parseProjectEngineeringData } from '@/lib/business/project-reports';
import {
  buildNfpa13_2025ProjectAdoption,
  buildNfpaEngineeringContext,
  evaluateNfpa13,
  isValidNfpa13EditionAdoption,
  NFPA13_2025_PROJECT_ADOPTION_TEMPLATE,
  NFPA13_PLATFORM_EDITION,
  NFPA13_PLATFORM_THRESHOLDS,
  runNfpaArchitectureFindings,
} from '@/lib/projects/compliance';
import {
  EMPTY_PROJECT_ENGINEERING_DATA,
  type ProjectEngineeringData,
} from '@/lib/types/project-reports';
import { EMPTY_FIRE_PROTECTION_DESIGN } from '@/lib/types/fire-protection-design';
import type { ClientRecord } from '@/lib/types/client';

function client(): ClientRecord {
  return {
    id: 'c-nfpa13-ed',
    name: 'NFPA13-ed',
    business_name: 'NFPA13-ed',
    activity_type: 'مكتب',
    floors_count: 2,
    building_area: 800,
  } as ClientRecord;
}

function dataWithAdoption(): ProjectEngineeringData {
  return {
    ...EMPTY_PROJECT_ENGINEERING_DATA,
    fire_protection_design: {
      ...EMPTY_FIRE_PROTECTION_DESIGN,
      occupancy: { ...EMPTY_FIRE_PROTECTION_DESIGN.occupancy, hazard_class: 'ordinary_1' },
      sprinkler: { ...EMPTY_FIRE_PROTECTION_DESIGN.sprinkler, required: 'yes' },
    },
    compliance: {
      nfpa13_numeric: {
        edition_adoption: buildNfpa13_2025ProjectAdoption({
          source_document_id: 'project_provided:NFPA-13-2025-cover',
          recorded_at: '2026-08-12T00:00:00.000Z',
        }),
        adopted_rows: [],
        inputs: { density_lpm_m2: 12 },
      },
    },
  };
}

describe('NFPA 13 edition verification (project cover 2025)', () => {
  it('records PROJECT_ADOPTED metadata without platform VERIFIED_OFFICIAL', () => {
    const meta = buildNfpa13_2025ProjectAdoption();
    expect(isValidNfpa13EditionAdoption(meta)).toBe(true);
    expect(meta.code).toBe('NFPA-13');
    expect(meta.edition).toBe('2025');
    expect(meta.title).toBe('Standard for the Installation of Sprinkler Systems');
    expect(meta.adoption_status).toBe('PROJECT_ADOPTED');
    expect(meta.source_type).toBe('PROJECT_PROVIDED_DOCUMENT');
    expect(meta.verification_status).toBe('PROJECT_COVER_IDENTIFIED');
    expect(meta.platform_verification_status).toBe('NOT_VERIFIED_OFFICIAL');
    expect(meta.platform_verification_status).not.toBe('VERIFIED_OFFICIAL');
    expect(NFPA13_2025_PROJECT_ADOPTION_TEMPLATE.edition).toBe('2025');
  });

  it('platform thresholds stay empty — cover does not encode numeric cells', () => {
    expect(NFPA13_PLATFORM_EDITION).toBeNull();
    expect(NFPA13_PLATFORM_THRESHOLDS).toEqual([]);
  });

  it('resolves project edition 2025 from adoption metadata', () => {
    const ctx = buildNfpaEngineeringContext({ client: client(), data: dataWithAdoption() });
    expect(ctx.nfpa13.nfpa13_edition.state).toBe('VALID');
    expect(ctx.nfpa13.nfpa13_edition.value).toBe('2025');
    expect(ctx.nfpa13.edition_adoption?.adoption_status).toBe('PROJECT_ADOPTED');
    expect(ctx.nfpa13.edition_adoption?.source_type).toBe('PROJECT_PROVIDED_DOCUMENT');
    expect(ctx.nfpa13.edition_adoption?.source_document_id).toBe(
      'project_provided:NFPA-13-2025-cover'
    );
  });

  it('edition known but tables unverified → RULE_NOT_CONFIGURED (never PASS from cover)', () => {
    const findings = evaluateNfpa13(
      buildNfpaEngineeringContext({ client: client(), data: dataWithAdoption() }).nfpa13
    );
    const density = findings.find((f) => f.rule_id === 'NFPA13-DENSITY');
    expect(density?.status).toBe('RULE_NOT_CONFIGURED');
    expect(findings.every((f) => f.status !== 'PASS')).toBe(true);
  });

  it('rejects adoption that claims platform VERIFIED_OFFICIAL from cover alone', () => {
    const bad = {
      ...buildNfpa13_2025ProjectAdoption(),
      platform_verification_status: 'VERIFIED_OFFICIAL' as const,
    };
    expect(isValidNfpa13EditionAdoption(bad)).toBe(false);
  });

  it('parseProjectEngineeringData preserves edition_adoption metadata only (no document body)', () => {
    const parsed = parseProjectEngineeringData(dataWithAdoption());
    const adoption = parsed.compliance?.nfpa13_numeric?.edition_adoption;
    expect(adoption?.edition).toBe('2025');
    expect(adoption?.source_type).toBe('PROJECT_PROVIDED_DOCUMENT');
    expect(adoption?.title).toBe('Standard for the Installation of Sprinkler Systems');
    expect(adoption?.source_document_id).toBe('project_provided:NFPA-13-2025-cover');
    // Metadata only — no PDF bytes / base64 document payload stored
    expect(JSON.stringify(parsed.compliance?.nfpa13_numeric)).not.toMatch(
      /data:application\/pdf|%PDF-|base64,[A-Za-z0-9+/]{100,}/
    );
  });

  it('runNfpaArchitectureFindings with 2025 adoption still blocks numeric PASS', () => {
    const { context, findings } = runNfpaArchitectureFindings({
      client: client(),
      data: dataWithAdoption(),
    });
    expect(context.nfpa13.nfpa13_edition.value).toBe('2025');
    expect(findings.some((f) => f.code === 'NFPA-13' && f.status === 'PASS')).toBe(false);
  });
});
