import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertInsertPolicyUsesHelper,
  assertNoUsersSelectInUpdatePolicy,
  canInsertUserRow,
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
  roleCode: 'admin',
  isPlatformAdmin: false,
};

const tenantAdminActor: ActorAuthz = {
  userId: 'usr-tadmin',
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

describe('044 — block tenant → platform privilege escalation', () => {
  it('044 SQL uses SECURITY DEFINER helpers and locked search_path', () => {
    const sql = readFileSync(
      resolve(__dirname, '../scripts/sql/044_block_tenant_platform_privilege_escalation.sql'),
      'utf8'
    );
    expect(sql).toContain('app_can_insert_user_row');
    expect(sql).toContain('app_can_update_user_row');
    expect(sql).toContain('app_is_platform_privilege_role');
    expect(sql).toContain('SET search_path = pg_catalog, public');
    assertNoUsersSelectInUpdatePolicy(sql);
    assertInsertPolicyUsesHelper(sql);
  });

  it('1) tenant_admin cannot promote employee to super_admin', () => {
    const before = staffRow({ id: 'usr-peer' });
    const after = staffRow({ id: 'usr-peer', role_code: 'super_admin' });
    expect(canUpdateUserRow(tenantAdminActor, before, after)).toBe(false);
  });

  it('2) tenant_admin cannot set is_platform_admin=true', () => {
    const before = staffRow({ id: 'usr-peer' });
    const after = staffRow({ id: 'usr-peer', is_platform_admin: true });
    expect(canUpdateUserRow(tenantAdminActor, before, after)).toBe(false);
  });

  it('3) admin cannot promote to super_admin or set platform flag', () => {
    const before = staffRow({ id: 'usr-peer' });
    expect(
      canUpdateUserRow(adminActor, before, staffRow({ id: 'usr-peer', role_code: 'super_admin' }))
    ).toBe(false);
    expect(
      canUpdateUserRow(adminActor, before, staffRow({ id: 'usr-peer', is_platform_admin: true }))
    ).toBe(false);
  });

  it('4) tenant_admin cannot create super_admin', () => {
    expect(
      canInsertUserRow(tenantAdminActor, {
        company_id: 'co-a',
        role_code: 'super_admin',
        is_platform_admin: false,
      })
    ).toBe(false);
  });

  it('5) tenant_admin cannot create is_platform_admin=true', () => {
    expect(
      canInsertUserRow(tenantAdminActor, {
        company_id: 'co-a',
        role_code: 'staff',
        is_platform_admin: true,
      })
    ).toBe(false);
  });

  it('6) platform_admin can create super_admin', () => {
    expect(
      canInsertUserRow(platformActor, {
        company_id: 'co-a',
        role_code: 'super_admin',
        is_platform_admin: false,
      })
    ).toBe(true);
  });

  it('7) platform_admin can set is_platform_admin=true', () => {
    expect(
      canInsertUserRow(platformActor, {
        company_id: 'co-b',
        role_code: 'staff',
        is_platform_admin: true,
      })
    ).toBe(true);
    const before = staffRow({ id: 'usr-x', company_id: 'co-b' });
    const after = staffRow({ id: 'usr-x', company_id: 'co-b', is_platform_admin: true });
    expect(canUpdateUserRow(platformActor, before, after)).toBe(true);
  });

  it('8) staff cannot change their role', () => {
    expect(
      canUpdateUserRow(staffActor, staffRow(), staffRow({ role_code: 'admin' }))
    ).toBe(false);
  });

  it('9) staff cannot change company_id', () => {
    expect(
      canUpdateUserRow(staffActor, staffRow(), staffRow({ company_id: 'co-b' }))
    ).toBe(false);
  });

  it('10) Company A cannot modify or create user in Company B', () => {
    const before = staffRow({ id: 'usr-b', company_id: 'co-b' });
    const after = staffRow({ id: 'usr-b', company_id: 'co-b', full_name: 'Hacked' });
    expect(canUpdateUserRow(tenantAdminActor, before, after)).toBe(false);
    expect(canUpdateUserRow(adminActor, before, after)).toBe(false);
    expect(
      canInsertUserRow(tenantAdminActor, {
        company_id: 'co-b',
        role_code: 'staff',
        is_platform_admin: false,
      })
    ).toBe(false);
  });

  it('11) no RLS recursion in update/insert policies (042–044)', () => {
    for (const file of [
      '042_role_level_rls.sql',
      '043_fix_users_update_rls_recursion.sql',
      '044_block_tenant_platform_privilege_escalation.sql',
    ]) {
      const sql = readFileSync(resolve(__dirname, `../scripts/sql/${file}`), 'utf8');
      assertNoUsersSelectInUpdatePolicy(sql);
    }
    const sql044 = readFileSync(
      resolve(__dirname, '../scripts/sql/044_block_tenant_platform_privilege_escalation.sql'),
      'utf8'
    );
    assertInsertPolicyUsesHelper(sql044);
  });

  it('12) tenant_admin can still manage normal in-company users (no platform flags)', () => {
    const before = staffRow({ id: 'usr-peer' });
    const after = staffRow({ id: 'usr-peer', role_code: 'engineer', full_name: 'Peer Eng' });
    expect(canUpdateUserRow(tenantAdminActor, before, after)).toBe(true);
    expect(
      canInsertUserRow(tenantAdminActor, {
        company_id: 'co-a',
        role_code: 'sales',
        is_platform_admin: false,
      })
    ).toBe(true);
  });

  it('tenant_admin cannot edit an existing platform-privileged user', () => {
    const before = staffRow({
      id: 'usr-plat',
      role_code: 'super_admin',
      is_platform_admin: true,
    });
    const after = staffRow({
      id: 'usr-plat',
      role_code: 'staff',
      is_platform_admin: false,
      full_name: 'Demoted',
    });
    expect(canUpdateUserRow(tenantAdminActor, before, after)).toBe(false);
  });

  it('staff can update allowed personal fields only', () => {
    expect(
      canUpdateUserRow(
        staffActor,
        staffRow(),
        staffRow({ full_name: 'اسم جديد', phone: '0599999999' })
      )
    ).toBe(true);
  });
});
