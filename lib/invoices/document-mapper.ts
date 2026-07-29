import { ACTIVITY_RULES } from '@/lib/constants/clients';
import type { ClientRecord } from '@/lib/types/client';

export function getClientBuildingProfile(client: Partial<ClientRecord>) {
  return {
    clientCode: client.client_code ?? null,
    ownerName: client.owner_name ?? null,
    phone: client.phone ?? null,
    businessName: client.business_name ?? null,
    city: client.city ?? null,
    region: client.region ?? null,
    district: client.district ?? null,
    street: client.street ?? null,
    activityType: client.activity_type ?? null,
    activityTypeLabel:
      ACTIVITY_RULES[client.activity_type || '']?.label || client.activity_type || null,
    landArea: client.land_area ?? null,
    buildingArea: client.building_area ?? null,
    floorsCount: client.floors_count ?? null,
  };
}
