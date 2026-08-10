import { describe, expect, it } from 'vitest';
import { generateEngineeringStudy } from '@/lib/projects/engineering-report-engine';
import {
  buildNasaimReportHtml,
  documentToFlowBlocks,
  placeSectionImages,
  sanitizeCaption,
} from '@/lib/projects/engineering-report-engine/renderer';
import {
  sanitizeClientFacingText,
  type FlowBlock,
} from '@/lib/projects/engineering-report-engine/renderer/flow-document';
import { formatReportTextHtml } from '@/lib/projects/engineering-report-engine/renderer/html-utils';
import { EMPTY_TECHNICAL_REPORT } from '@/lib/types/project-reports';
import type { ClientRecord } from '@/lib/types/client';
import type { CompanyProfile } from '@/lib/company-profile';

const client = {
  id: 'c-nasaim',
  client_code: 'NSAIM-01',
  name: 'قاعة اختبار',
  business_name: 'قاعة اختبار الشرق',
  owner_name: 'مالك الاختبار',
  city: 'جدة',
  district: 'الشاطئ',
  region: 'مكة',
  activity_type: 'assembly',
} as unknown as ClientRecord;

const company = {
  name: 'توقع سلامة',
  legal_name: 'منصة توقع سلامة للاستشارات الهندسية والسلامة',
  logo_url: '',
  tagline: 'للاستشارات الهندسية والسلامة',
  address: 'جدة',
  city: 'جدة',
  phone: '920000000',
  stamp_text: 'توقع سلامة',
} as CompanyProfile;

const PIXEL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=';

function pixel(n: number) {
  return PIXEL.replace('/9k=', `/9k=${n}`);
}

function flattenBlocks(blocks: FlowBlock[]): FlowBlock[] {
  const out: FlowBlock[] = [];
  for (const b of blocks) {
    out.push(b);
    if (b.kind === 'unit') out.push(...flattenBlocks(b.blocks));
  }
  return out;
}

describe('Nasaim report pipeline rebuild', () => {
  it('sanitizes technical file-name captions', () => {
    expect(sanitizeCaption('IMG_6436.jpeg', 'شكل بديل')).toBe('شكل بديل');
    expect(sanitizeCaption('غرفة المضخات', 'fallback')).toBe('غرفة المضخات');
  });

  it('orders section images by subsection then image_order', () => {
    const section = {
      id: 'fire_alarm_study' as const,
      number: 17,
      title_ar: 'نظام الإنذار',
      title_en: 'Alarm',
      paragraphs: [],
      images: [
        {
          src: 'data:image/jpeg;base64,b',
          caption_ar: 'أجراس',
          caption_en: 'bells',
          item_id: 'al_bells',
          subsection_ar: 'أجراس الإنذار',
          subsection_order: 4,
          image_order: 1,
        },
        {
          src: 'data:image/jpeg;base64,a',
          caption_ar: 'كواشف',
          caption_en: 'detectors',
          item_id: 'al_detectors',
          subsection_ar: 'كواشف الدخان وكواشف الحرارة',
          subsection_order: 2,
          image_order: 1,
        },
      ],
    };
    const placed = placeSectionImages(section);
    expect(placed[0].item_id).toBe('al_detectors');
    expect(placed[1].item_id).toBe('al_bells');
    expect(placed[0].image_order).toBe(1);
    expect(placed[1].image_order).toBe(2);
  });

  it('does not use Unicode isolates that corrupt Arabic PDF text', () => {
    const html = formatReportTextHtml('موقع المبنى وفق NFPA72 وSBC801');
    expect(html).toContain('NFPA 72');
    expect(html).toContain('SBC 801');
    expect(html).toContain('class="ltr"');
    expect(html).not.toContain('\u2066');
    expect(html).not.toContain('\u2069');
    expect(html).toContain('موقع المبنى');
  });

  it('sanitizes system jargon and rejects generic bridge filler', () => {
    const out = sanitizeClientFacingText(
      'مراجعة الامتثال عبر محرك القرار الهندسي: موقوف: 0 مخالفة، و2 حقل إلزامي ناقص. حالة البوابة: مغلقة.',
      'ar'
    );
    expect(out).toMatch(/البيانات المطلوبة|التحقق النهائي/);
    expect(out).not.toMatch(/محرك|البوابة|حقل إلزامي|موقوف/);

    const bridge = sanitizeClientFacingText(
      'فيما يتعلق بـ«كواشف الدخان وكواشف الحرارة»، تُراجع المتطلبات الهندسية ذات الصلة وفق بيانات المشروع والكودات المعتمدة، مع توثيق الحالة القائمة عند توفر الصور المرفقة.',
      'ar'
    );
    expect(bridge).not.toMatch(/تُراجع المتطلبات الهندسية ذات الصلة/);
    expect(bridge).toMatch(/لا تكفي|لا يتم افتراض/);
  });

  it('builds real subsection engineering prose bound to item photos (no generic bridge)', () => {
    const report = {
      ...EMPTY_TECHNICAL_REPORT,
      outgoing_number: 'TR-2026-0100',
      report_date: '2026-08-10',
      location_description: 'جدة — الشاطئ',
      gps_lat: '21.5',
      gps_lng: '39.1',
      facade_photo: { id: 'f1', caption: 'IMG_1000.jpeg', dataUrl: pixel(1) },
      earth_photo: { id: 'e1', caption: 'موقع عام', dataUrl: pixel(2) },
      overview_text: 'اختبار خط أنابيب التقرير الهندسي.',
      firefighting_items: [
        {
          id: 'ff_pumps',
          enabled: true,
          notes: 'غرفة مضخات قائمة',
          selectedOptions: ['مضخة رئيسية: قدرة وضغط وفق الحساب الهيدروليكي'],
          photos: [{ id: 'p1', caption: 'غرفة المضخات', dataUrl: pixel(3) }],
        },
      ],
      alarm_items: [
        {
          id: 'al_panel',
          enabled: true,
          notes: '',
          selectedOptions: ['تركيب لوحة إنذار رئيسية في مكان مأهول (الاستقبال/الحراسة)'],
          photos: [{ id: 'a1', caption: 'لوحة التحكم', dataUrl: pixel(4) }],
        },
        {
          id: 'al_detectors',
          enabled: true,
          notes: '',
          selectedOptions: ['توزيع كواشف الدخان وفق المخططات', 'الالتزام بمسافات التغطية المعتمدة'],
          photos: [{ id: 'a2', caption: 'كواشف', dataUrl: pixel(5) }],
        },
        {
          id: 'al_breakglass',
          enabled: true,
          notes: '',
          selectedOptions: [],
          photos: [{ id: 'a3', caption: 'IMG_999.jpeg', dataUrl: pixel(6) }],
        },
        {
          id: 'al_bells',
          enabled: true,
          notes: '',
          selectedOptions: ['ضمان سماع الإنذار في جميع الفراغات'],
          photos: [{ id: 'a4', caption: 'أجراس', dataUrl: pixel(7) }],
        },
      ],
    };

    const doc = generateEngineeringStudy({ client, report, locale: 'ar' });
    const { blocks, chapters } = documentToFlowBlocks(doc);
    expect(chapters.length).toBeGreaterThan(5);

    const flat = flattenBlocks(blocks);
    const figs = flat.filter((b) => b.kind === 'figure');
    expect(figs.length).toBeGreaterThanOrEqual(5);
    // Global sequential numbering
    expect(figs.every((f, i) => f.kind === 'figure' && f.figureNo === i + 1)).toBe(true);

    const detectorScope = flat.some(
      (b) =>
        b.kind === 'paragraph' &&
        b.text.includes('يتم توزيع كواشف الحريق في الفراغات')
    );
    expect(detectorScope).toBe(true);

    const bridgeGone = flat.every(
      (b) =>
        b.kind !== 'paragraph' ||
        !b.text.includes('تُراجع المتطلبات الهندسية ذات الصلة وفق بيانات المشروع')
    );
    expect(bridgeGone).toBe(true);

    // Subsections present for alarm components
    const subs = flat.filter((b) => b.kind === 'subsection').map((b) => (b.kind === 'subsection' ? b.title : ''));
    expect(subs.some((t) => t.includes('كواشف'))).toBe(true);
    expect(subs.some((t) => t.includes('كواسر'))).toBe(true);
    expect(subs.some((t) => t.includes('أجراس'))).toBe(true);

    const html = buildNasaimReportHtml({ document: doc, company });
    expect(html).toContain('class="doc"');
    expect(html).toContain('المحتويات');
    expect(html).toContain('cover-box');
    expect(html).toContain('Noto Naskh Arabic');
    expect(html).not.toContain('Traditional Arabic');
    expect(html).toContain('font-variant-ligatures: none');
    expect(html).not.toContain('IMG_1000.jpeg');
    expect(html).not.toContain('IMG_999.jpeg');
    expect(html).not.toContain('/projects/file/?id=');
    expect(html).not.toContain('unicode-bidi: plaintext');
    expect(html).not.toContain('unicode-bidi: embed');
    expect(html).not.toContain('\u2066');
    expect(html).not.toContain('محرك القواعد');
    expect(html).not.toContain('محرك القرار');
    expect(html).not.toContain('Decision Engine');
    expect(html).not.toContain('تُراجع المتطلبات الهندسية ذات الصلة');
    expect(html).toContain('يتم توزيع كواشف الحريق');
    expect(html).toContain('شكل (');
    expect(html).toContain('الاعتماد والتوقيعات');
    expect((html.match(/class="page /g) || []).length).toBe(2);
  });
});
