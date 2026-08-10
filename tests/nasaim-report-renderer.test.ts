import { describe, expect, it } from 'vitest';
import { generateEngineeringStudy } from '@/lib/projects/engineering-report-engine';
import {
  buildNasaimReportHtml,
  documentToFlowBlocks,
  placeSectionImages,
  sanitizeCaption,
} from '@/lib/projects/engineering-report-engine/renderer';
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

describe('Nasaim flow document renderer', () => {
  it('sanitizes technical file-name captions', () => {
    expect(sanitizeCaption('IMG_6436.jpeg', 'شكل بديل')).toBe('شكل بديل');
    expect(sanitizeCaption('غرفة المضخات', 'fallback')).toBe('غرفة المضخات');
  });

  it('orders section images by image_order', () => {
    const section = {
      id: 'fire_pump_analysis' as const,
      number: 14,
      title_ar: 'تحليل مضخات الحريق',
      title_en: 'Fire Pump',
      paragraphs: [],
      images: [
        {
          src: 'data:image/jpeg;base64,b',
          caption_ar: 'IMG_2.jpeg',
          caption_en: 'IMG_2.jpeg',
          image_order: 2,
        },
        {
          src: 'data:image/jpeg;base64,a',
          caption_ar: 'غرفة المضخات',
          caption_en: 'Pump room',
          image_order: 1,
        },
      ],
    };
    const placed = placeSectionImages(section);
    expect(placed[0].caption_ar).toBe('غرفة المضخات');
    expect(placed[1].caption_ar).toMatch(/صورة رقم \(2\)/);
    expect(placed[0].image_order).toBe(1);
  });

  it('builds a continuous flow study (no section cards / no image gallery header)', () => {
    const facade = 'data:image/jpeg;base64,/9j/facade';
    const earth = 'data:image/jpeg;base64,/9j/earth';
    const pump = 'data:image/jpeg;base64,/9j/pump';
    const panel = 'data:image/jpeg;base64,/9j/panel';

    const report = {
      ...EMPTY_TECHNICAL_REPORT,
      outgoing_number: 'TR-2026-0099',
      report_date: '2026-08-10',
      location_description: 'جدة — الشاطئ',
      gps_lat: '21.5',
      gps_lng: '39.1',
      facade_photo: { id: 'f1', caption: 'IMG_1000.jpeg', dataUrl: facade },
      earth_photo: { id: 'e1', caption: 'موقع عام', dataUrl: earth },
      overview_text: 'اختبار دراسة هندسية بأسلوب نسائم المتصل.',
      firefighting_items: [
        {
          id: 'ff_pumps',
          enabled: true,
          notes: 'مضخة رئيسية وفق الحساب',
          selectedOptions: [],
          photos: [
            { id: 'p1', caption: 'غرفة المضخات', dataUrl: pump },
            { id: 'p2', caption: 'IMG_6448.jpeg', dataUrl: panel },
          ],
        },
      ],
      alarm_items: [
        {
          id: 'al_panel',
          enabled: true,
          notes: 'لوحة إنذار',
          selectedOptions: [],
          photos: [{ id: 'a1', caption: 'لوحة التحكم', dataUrl: panel }],
        },
      ],
    };

    const doc = generateEngineeringStudy({ client, report, locale: 'ar' });
    expect(doc.owner_name).toBe('مالك الاختبار');

    const { blocks, chapters } = documentToFlowBlocks(doc);
    expect(chapters.length).toBeGreaterThan(5);
    expect(blocks.some((b) => b.kind === 'chapter')).toBe(true);
    expect(blocks.some((b) => b.kind === 'figure')).toBe(true);
    // Figures appear after chapter/paragraph context — not as a trailing gallery-only dump without captions
    const fig = blocks.find((b) => b.kind === 'figure');
    expect(fig && fig.kind === 'figure' && fig.caption.startsWith('شكل (')).toBe(true);

    const html = buildNasaimReportHtml({ document: doc, company });
    expect(html).toContain('class="doc"');
    expect(html).toContain('المحتويات');
    expect(html).toContain('cover-box');
    expect(html).toContain(facade);
    expect(html).toContain(earth);
    expect(html).toContain(pump);
    expect(html).not.toContain('IMG_1000.jpeg');
    expect(html).not.toContain('IMG_6448.jpeg');
    expect(html).not.toContain('الصور والوثائق المرفقة للقسم');
    expect(html).not.toContain('gallery-title');
    expect(html).not.toContain('sheet-section');
    expect(html).not.toContain('/projects/file/?id=');
    // Flow headings, not card badges
    expect(html).toContain('class="ch"');
    expect(html).toContain('شكل (');
    // Only cover + TOC use forced page wrappers; study body is continuous .doc
    expect((html.match(/class="page /g) || []).length).toBe(2);
  });
});
