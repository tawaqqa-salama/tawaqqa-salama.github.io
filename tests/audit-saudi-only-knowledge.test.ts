import { describe, expect, it } from 'vitest';
import { classifyKnowledgeDocument } from '../scripts/audit-saudi-only-knowledge';

describe('classifyKnowledgeDocument (Saudi-only audit)', () => {
  it('KEEPS Saudi Fire Code even when code metadata is mislabeled NFPA-13', () => {
    const result = classifyKnowledgeDocument({
      title: 'الكود السعودي للحماية من الحريق',
      filename: 'saudi-fire-code.pdf',
      storage_path:
        '3580b47a-a57b-4b3c-8f0d-db72870c8a85/code-knowledge/NFPA-13/2025/abc/saudi-fire-code.pdf',
      code: 'NFPA-13',
      edition: '2025',
      applicable_codes: ['SBC 801', 'NFPA 13'],
      content_sample: 'متطلبات الدرج والمخارج وفق الكود السعودي',
    });
    expect(result.classification).toBe('SAUDI');
    expect(result.recommended_action).toBe('KEEP');
    expect(result.mislabeled).toBe(true);
  });

  it('DELETES genuine NFPA-13 documents', () => {
    const result = classifyKnowledgeDocument({
      title: 'NFPA 13-2025',
      filename: 'NFPA-13-2025.pdf',
      storage_path:
        '3580b47a-a57b-4b3c-8f0d-db72870c8a85/code-knowledge/NFPA-13/2025/deb74a38/NFPA-13-2025.pdf',
      code: 'NFPA-13',
      edition: '2025',
      content_sample: 'NFPA 13 Standard for the Installation of Sprinkler Systems',
    });
    expect(result.classification).toBe('NON_SAUDI');
    expect(result.recommended_action).toBe('DELETE');
  });

  it('marks code-only signals as AMBIGUOUS (do not trust code alone)', () => {
    const result = classifyKnowledgeDocument({
      title: 'uploaded-scan-003',
      filename: 'scan-003.pdf',
      storage_path: 'company/uploads/scan-003.pdf',
      code: 'NFPA-13',
      edition: '2025',
      content_sample: 'page image with little extractable text',
    });
    expect(result.classification).toBe('AMBIGUOUS');
    expect(result.recommended_action).toBe('MANUAL_REVIEW');
  });

  it('DELETES other international references', () => {
    const result = classifyKnowledgeDocument({
      title: 'International Building Code 2021',
      filename: 'IBC-2021.pdf',
      storage_path: 'company/code-knowledge/IBC/2021/x/IBC-2021.pdf',
      code: 'IBC',
      edition: '2021',
    });
    expect(result.classification).toBe('NON_SAUDI');
    expect(result.recommended_action).toBe('DELETE');
  });
});
