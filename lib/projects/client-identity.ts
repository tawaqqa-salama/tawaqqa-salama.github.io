/**
 * Single source of identity for engineering stages.
 * Enter once in Sales/Clients — later stages only display these values.
 */

import { ACTIVITY_RULES } from '@/lib/constants/clients';
import type { ClientRecord } from '@/lib/types/client';

export type ClientIdentitySnapshot = {
  owner_name: string;
  facility_name: string;
  client_name: string;
  activity_type: string;
  activity_label: string;
  city: string;
  region: string;
  district: string;
  street: string;
  plot_number: string;
  national_address: string;
  land_area: string;
  building_area: string;
  floors_count: string;
  phone: string;
  location_summary: string;
};

export function getClientIdentitySnapshot(
  client: ClientRecord | null | undefined
): ClientIdentitySnapshot {
  if (!client) {
    return {
      owner_name: '',
      facility_name: '',
      client_name: '',
      activity_type: '',
      activity_label: '',
      city: '',
      region: '',
      district: '',
      street: '',
      plot_number: '',
      national_address: '',
      land_area: '',
      building_area: '',
      floors_count: '',
      phone: '',
      location_summary: '',
    };
  }

  const activity = ACTIVITY_RULES[client.activity_type || ''];
  const owner_name = String(client.owner_name || client.name || '').trim();
  const facility_name = String(client.business_name || client.name || '').trim();
  const city = String(client.city || '').trim();
  const district = String(client.district || '').trim();
  const street = String(client.street || '').trim();
  const plot_number = String(client.plot_number || '').trim();

  return {
    owner_name,
    facility_name,
    client_name: String(client.name || owner_name || facility_name).trim(),
    activity_type: String(client.activity_type || '').trim(),
    activity_label: String(activity?.label || client.activity_type || '').trim(),
    city,
    region: String(client.region || '').trim(),
    district,
    street,
    plot_number,
    national_address: String(client.national_address || '').trim(),
    land_area: client.land_area != null ? String(client.land_area) : '',
    building_area: client.building_area != null ? String(client.building_area) : '',
    floors_count: client.floors_count != null ? String(client.floors_count) : '',
    phone: String(client.phone || '').trim(),
    location_summary: [city, district, street, plot_number].filter(Boolean).join(' — '),
  };
}

/** Always prefer live Sales/client identity over stale stage copies. */
export function applyClientIdentityToCompletion(
  client: ClientRecord,
  cert: {
    project_name?: string;
    owner_name?: string;
    facility_name?: string;
    activity_label?: string;
    district?: string;
    street?: string;
    land_area?: string;
    owner_contact?: string;
  }
) {
  const id = getClientIdentitySnapshot(client);
  return {
    ...cert,
    project_name: id.facility_name || cert.project_name || '',
    owner_name: id.owner_name || cert.owner_name || '',
    facility_name: id.facility_name || cert.facility_name || '',
    activity_label: id.activity_label || cert.activity_label || '',
    district: id.district || cert.district || '',
    street: id.street || cert.street || '',
    land_area: id.land_area || cert.land_area || '',
    owner_contact: id.phone || cert.owner_contact || '',
  };
}

export function applyClientIdentityToSupervision(
  client: ClientRecord,
  report: {
    owner_name?: string;
    project_name?: string;
    building_type?: string;
    area_m2?: string;
  }
) {
  const id = getClientIdentitySnapshot(client);
  const projectLabel = [id.facility_name, id.activity_label].filter(Boolean).join(' — ');
  const area = id.building_area || id.land_area || report.area_m2 || '';
  return {
    ...report,
    owner_name: id.owner_name || report.owner_name || '',
    project_name: projectLabel || report.project_name || '',
    building_type: id.activity_label || report.building_type || '',
    area_m2: area,
  };
}
