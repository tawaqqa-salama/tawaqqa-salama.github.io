import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertNoUsersSelectInUpdatePolicy,
  canUpdateUserRow,
  type ActorAuthz,
  type UserAuthzRow,
} from '@/lib/auth/users-update-authz';

const staffActor: ActorAuthz = {
  userId: 'usr-staff',
  companyId: 'co-a',
  roleCode: 'staff',
  isPlatformAdmin: false,
};

const adminActor: ActorAuthz = {
  userId: 'usr-admin',
  companyId: 'co-a',
  roleCode: 'tenant_admin',
  isPlatformAdmin: false,
};

const platformActor: ActorAuthz = {
  userId: 'usr-platform',
  companyId: 'co-a',
  roleCode: 'super_admin',
  isPlatformAdmin: true,
};

const staffRow = (overrides: Partial<UserAuthzRow> = {}): UserAuthzRow => ({
  id: 'usr-staff',
  company_id: 'co-a',
  role_code: 'staff',
  is_platform_admin: false,
  full_name: 'Staff User',
  phone: '0500000001',
  ...overrides,
});

describe('users UPDATE authz — no RLS recursion + privilege locks', () => {
  it('042/043 policies never SELECT FROM public.users inside users_update_admin', () => {
    const sql042 = readFileSync(
      resolve(__dirname, '../scripts/sql/042_role_level_rls.sql'),
      'utf8'
    );
    const sql043 = readFileSync(
      resolve(__dirname, '../scripts/sql/043_fix_users_update_rls_recursion.sql'),
      'utf8'
    );
    assertNoUsersSelectInUpdatePolicy(sql042);
    assertNoUsersSelectInUpdatePolicy(sql043);
    expect(sql042).toContain('SECURITY DEFINER');
    expect(sql042).toContain('app_users_self_update_ok');
    expect(sql043).toContain('app_can_update_user_row');
  });

  it('staff cannot escalate role_code to admin', () => {
    const before = staffRow();
    const after = staffRow({ role_code: 'admin' });
    expect(canUpdateUserRow(staffActor, before, after)).toBe(false);
  });

  it('staff cannot change company_id', () => {
    const before = staffRow();
    const after = staffRow({ company_id: 'co-b' });
    expect(canUpdateUserRow(staffActor, before, after)).toBe(false);
  });

  it('staff cannot set is_platform_admin', () => {
    const before = staffRow();
    const after = staffRow({ is_platform_admin: true });
    expect(canUpdateUserRow(staffActor, before, after)).toBe(false);
  });

  it('staff can update allowed personal fields', () => {
    const before = staffRow();
    const after = staffRow({
      full_name: 'اسم جديد',
      phone: '0599999999',
      page_title: 'صفحتي',
      page_bio: 'نبذة',
    });
    expect(canUpdateUserRow(staffActor, before, after)).toBe(true);
  });

  it('tenant_admin can manage users in their company', () => {
    const before = staffRow({ id: 'usr-peer' });
    const after = staffRow({ id: 'usr-peer', role_code: 'engineer', full_name: 'Peer' });
    expect(canUpdateUserRow(adminActor, before, after)).toBe(true);
  });

  it('tenant_admin cannot move a user to another company', () => {
    const before = staffRow({ id: 'usr-peer' });
    const after = staffRow({ id: 'usr-peer', company_id: 'co-b' });
    expect(canUpdateUserRow(adminActor, before, after)).toBe(false);
  });

  it('Company A cannot modify User from Company B', () => {
    const before = staffRow({ id: 'usr-b', company_id: 'co-b', role_code: 'staff' });
    const after = staffRow({
      id: 'usr-b',
      company_id: 'co-b',
      full_name: 'Hacked',
    });
    expect(canUpdateUserRow(adminActor, before, after)).toBe(false);
    expect(canUpdateUserRow(staffActor, before, after)).toBe(false);
  });

  it('platform admin retains full update rights', () => {
    const before = staffRow({ id: 'usr-b', company_id: 'co-b' });
    const after = staffRow({
      id: 'usr-b',
      company_id: 'co-a',
      role_code: 'admin',
      is_platform_admin: true,
    });
    expect(canUpdateUserRow(platformActor, before, after)).toBe(true);
  });
});
