import type { EkbTopic } from '@/lib/compliance/types';

/**
 * كتالوج EKB مدمج — يعمل دون اعتماد على جداول SQL إن لم تُزامَن بعد.
 * يتكامل مع docs/ekb ومع جداول ekb_* عند توفرها.
 */
export const EKB_TOPICS: EkbTopic[] = [
  {
    id: 'ekb-sprinklers',
    title: 'أنظمة المرشات التلقائية',
    standard: 'BOTH',
    summary: 'اشتراطات تركيب المرشات حسب تصنيف الإشغال والمساحة في SBC 801 وNFPA 13.',
    tags: ['sprinkler', 'SBC-801', 'NFPA-13'],
  },
  {
    id: 'ekb-alarm',
    title: 'أنظمة الإنذار والكشف',
    standard: 'BOTH',
    summary: 'عتبات الإنذار الصوتي والكشف حسب عدد الشاغلين ونوع الإشغال (SBC 801 / NFPA 72).',
    tags: ['alarm', 'detection', 'NFPA-72'],
  },
  {
    id: 'ekb-egress',
    title: 'مسافات السفر ومخارج الطوارئ',
    standard: 'BOTH',
    summary: 'حدود مسافة السفر إلى المخرج ومتطلبات المخارج وفق SBC وNFPA 101.',
    tags: ['egress', 'NFPA-101', 'SBC-201'],
  },
  {
    id: 'ekb-occupancy',
    title: 'تصنيف الإشغال ومستوى الخطر',
    standard: 'SBC',
    summary: 'ربط أنشطة المنصة بمجموعات الإشغال SBC 801 ومستويات الخطر.',
    tags: ['occupancy', 'SBC-801', 'risk'],
  },
  {
    id: 'ekb-hazmat',
    title: 'المواد الخطرة والتخزين',
    standard: 'BOTH',
    summary: 'سيناريوهات المخاطر ومواد التخزين عالية الخطورة (EKB Risks).',
    tags: ['hazmat', 'storage', 'high-hazard'],
  },
];

export function findEkbTopicsByTags(tags: string[]): EkbTopic[] {
  const lower = tags.map((t) => t.toLowerCase());
  return EKB_TOPICS.filter((topic) =>
    topic.tags.some((tag) => lower.some((q) => tag.toLowerCase().includes(q) || q.includes(tag.toLowerCase())))
  );
}

export function getEkbTopic(id: string): EkbTopic | undefined {
  return EKB_TOPICS.find((topic) => topic.id === id);
}
