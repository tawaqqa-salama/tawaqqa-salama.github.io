import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  actorCanManageEmployeeProvisioning,
  existingEmployeeConflict,
  normaliseEmployeeProvisionInput,
} from '../supabase/functions/_shared/employee-provisioning-policy';

const validInput = {
  full_name: 'موظف تجريبي',
  email: 'employee@example.com',
  phone: '0500000000',
  username: 'employee_test',
  role_code: 'engineer',
  password: 'safe-password',
  extra_permissions: ['dept.projects'],
  page_modules: ['projects'],
  is_active: true,
};

const activeAdmin = {
  company_id: 'company-a',
  role_code: 'tenant_admin',
  is_active: true,
  deleted_at: null,
};

const edgeSource = readFileSync(
  resolve(__dirname, '../supabase/functions/employee-provision/index.ts'),
  'utf8',
);
const serviceSource = readFileSync(
  resolve(__dirname, '../lib/auth/service.ts'),
  'utf8',
);

describe('employee provisioning — Auth/profile linking and tenant isolation', () => {
  it('NEW AUTH USER + NEW PUBLIC USER: accepts a valid least-privilege employee payload', () => {
    const input = normaliseEmployeeProvisionInput(validInput);
    expect(input).toMatchObject({
      email: 'employee@example.com',
      role_code: 'engineer',
      extra_permissions: ['dept.projects'],
      page_modules: ['projects'],
    });
    expect(actorCanManageEmployeeProvisioning(activeAdmin)).toBe(true);
    expect(existingEmployeeConflict(null, 'company-a')).toBeNull();
  });

  it('EXISTING AUTH USER + NO PUBLIC USER: has no profile conflict and can be linked', () => {
    expect(existingEmployeeConflict(null, 'company-a')).toBeNull();
    expect(edgeSource).toContain('findAuthUserByEmail(admin, input.email)');
    expect(edgeSource).toContain("status: authCreatedByOperation ? 'created_new_auth' : 'linked_existing_auth'");
  });

  it('EXISTING AUTH USER + SAME COMPANY PUBLIC USER: duplicate is blocked', () => {
    expect(existingEmployeeConflict({ company_id: 'company-a' }, 'company-a')).toBe('same_company');
    expect(edgeSource).toContain('EMPLOYEE_EXISTS_SAME_COMPANY');
    expect(edgeSource).toContain('AUTH_PROFILE_EXISTS_SAME_COMPANY');
  });

  it('EXISTING AUTH USER + FOREIGN COMPANY: cross-tenant linking is blocked', () => {
    expect(existingEmployeeConflict({ company_id: 'company-b' }, 'company-a')).toBe('foreign_company');
    expect(edgeSource).toContain('EMPLOYEE_EXISTS_FOREIGN_COMPANY');
    expect(edgeSource).toContain('AUTH_PROFILE_EXISTS_FOREIGN_COMPANY');
  });

  it('AUTH_USER_ID LINK: creates the public profile using the resolved Auth user id', () => {
    expect(edgeSource).toContain('auth_user_id: authUserId');
    expect(edgeSource).toContain('.eq(\'auth_user_id\', authUser.id)');
  });

  it('CURRENT COMPANY RESOLUTION: derives the company from the verified caller JWT', () => {
    expect(edgeSource).toContain('userClient.auth.getUser(token)');
    expect(edgeSource).toContain(".eq('auth_user_id', authData.user.id)");
    expect(edgeSource).toContain('const companyId = actor.company_id!');
  });

  it('COMPANY_ID FROM CLIENT: is ignored and cannot select a foreign tenant', () => {
    const input = normaliseEmployeeProvisionInput({ ...validInput, company_id: 'company-b' });
    expect(input).not.toHaveProperty('company_id');
    expect(edgeSource).not.toContain('raw.company_id');
    expect(edgeSource).not.toContain('input.company_id');
  });

  it('CROSS TENANT USER CREATION: always uses the actor company derived server-side', () => {
    expect(edgeSource).toContain('publicUserPayload(input, companyId, branchId, authUser.id)');
    expect(edgeSource).toContain(".eq('company_id', companyId)");
  });

  it('ROLE, PERMISSIONS, and PAGE MODULES: persist the validated selections without platform privilege', () => {
    const input = normaliseEmployeeProvisionInput({
      ...validInput,
      role_code: 'manager',
      extra_permissions: ['dept.projects', 'dept.not-real'],
      page_modules: ['projects', 'not-real'],
    });
    expect(input?.role_code).toBe('manager');
    expect(input?.extra_permissions).toEqual(['dept.projects']);
    expect(input?.page_modules).toEqual(['projects']);
    expect(normaliseEmployeeProvisionInput({ ...validInput, role_code: 'super_admin' })).toBeNull();
  });

  it('INACTIVE, DELETED, and UNAUTHORIZED ACTOR: are blocked before any Auth admin operation', () => {
    expect(actorCanManageEmployeeProvisioning({ ...activeAdmin, is_active: false })).toBe(false);
    expect(actorCanManageEmployeeProvisioning({ ...activeAdmin, deleted_at: '2026-01-01T00:00:00Z' })).toBe(false);
    expect(actorCanManageEmployeeProvisioning({ ...activeAdmin, role_code: 'engineer' })).toBe(false);
    expect(edgeSource.indexOf('actorCanManageEmployeeProvisioning(actor)')).toBeLessThan(
      edgeSource.indexOf('admin.auth.admin.createUser'),
    );
  });

  it('PARTIAL FAILURE: deletes only an Auth account created by this operation when profile insertion fails', () => {
    expect(edgeSource).toContain('if (authCreatedByOperation)');
    expect(edgeSource).toContain('admin.auth.admin.deleteUser(authUser.id)');
    expect(edgeSource).toContain('cleanup of newly created Auth user also failed');
  });

  it('TENANT NOT FOUND LEGACY PATH: is not reachable for production employee creation', () => {
    const serverProvision = serviceSource.indexOf("return provisionEmployeeServerSide({");
    const legacyTenantLookup = serviceSource.indexOf('const tenant = await resolveTenantIds');
    expect(serverProvision).toBeGreaterThan(-1);
    expect(legacyTenantLookup).toBeGreaterThan(serverProvision);
    expect(serviceSource).toContain("supabase.functions.invoke('employee-provision'");
    expect(serviceSource).not.toContain('/api/employee-provision');
  });

  it('secrets remain server-side only', () => {
    expect(edgeSource).toContain("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')");
    expect(serviceSource).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(serviceSource).not.toContain('service_role');
  });
});
