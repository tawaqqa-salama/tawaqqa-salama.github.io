# Localization (ar / en / id)

## Locales

| Code | Language | Direction |
|------|----------|-----------|
| `ar` | Arabic | RTL |
| `en` | English | LTR |
| `id` | Bahasa Indonesia | LTR |

Direction is derived from the active locale (`localeDir` in `lib/i18n/types.ts`) — not hardcoded globally as RTL.

## Implementation

- Dictionary: `lib/i18n/dictionary.ts`  
- Provider: `lib/i18n/LanguageProvider.tsx`  
- Switcher: `components/layout/LanguageSwitcher.tsx` (Ar / En / Id)  

Tenant defaults:

- TWAQQA: `ar` (+ `en` secondary)  
- Indonesian pilot / onboarding defaults: `en` (+ `id` secondary)  

## Coverage status

**Fully keyed (shell + SaaS):** navigation chrome, platform admin, onboarding, language switcher, shared shell strings.

**Still partially hardcoded Arabic:** many domain modules (sales forms, project reports, finance modals, etc.). Architecture supports full translation; progressive key migration continues. English/Indonesian UI is usable for platform/tenant admin flows; domain screens may still show Arabic labels until migrated.

## Guidelines for new UI

1. Add keys to `ar`, `en`, and `id` dictionaries together.  
2. Use `t('key')` — do not hardcode Arabic in components.  
3. Format money with `formatCurrency(amount, { currency: tenant.default_currency })`.  
4. Format dates with `formatDate(value, locale)`.  
