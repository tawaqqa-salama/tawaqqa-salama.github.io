/**
 * Engineering-topic relevance for Design Intelligence RAG.
 * Search/ranking only — does not invent engineering rules or change compliance.
 */

import { normalizeKnowledgeSearchText } from '@/lib/design-intelligence/embeddings';

export type EngineeringTopic =
  | 'sprinkler'
  | 'pump'
  | 'tank'
  | 'alarm_smoke'
  | 'stairs_exits'
  | 'hazardous_materials'
  | 'general';

/** Search-only term lists (Arabic + English). Display text is never mutated. */
const TOPIC_TERMS: Record<Exclude<EngineeringTopic, 'general'>, string[]> = {
  sprinkler: [
    'رش',
    'الرش',
    'مرش',
    'مرشات',
    'الرشاشات',
    'رشاش',
    'رشاشات',
    'نظام الرش',
    'انظمة الرش',
    'أنظمة الرش',
    'الرش الالي',
    'الرش الآلي',
    'رش الي',
    'رش آلي',
    'sprinkler',
    'sprinklers',
    'automatic sprinkler',
    'automatic sprinklers',
  ],
  pump: ['مضخة', 'مضخات', 'مضخة الحريق', 'fire pump', 'pump', 'pumps'],
  tank: ['خزان', 'خزانات', 'tank', 'tanks', 'water tank'],
  alarm_smoke: ['انذار', 'إنذار', 'دخان', 'alarm', 'smoke', 'detector'],
  stairs_exits: [
    'درج',
    'الدرج',
    'سلالم',
    'السلالم',
    'مخرج',
    'مخارج',
    'مخارج الطوارئ',
    'ابعاد',
    'أبعاد',
    'stair',
    'stairs',
    'exit',
    'exits',
    'egress',
    'means of egress',
  ],
  hazardous_materials: [
    'مواد خطرة',
    'مادة خطرة',
    'خطرة',
    'hazardous',
    'hazmat',
    'hazardous materials',
    'كيميائية',
  ],
};

const ALL_TOPIC_KEYS = Object.keys(TOPIC_TERMS) as Array<Exclude<EngineeringTopic, 'general'>>;

function haystack(text: string): string {
  return normalizeKnowledgeSearchText(text);
}

function termHits(normalizedHay: string, terms: string[]): number {
  let hits = 0;
  for (const term of terms) {
    const n = normalizeKnowledgeSearchText(term);
    if (n.length >= 1 && normalizedHay.includes(n)) hits += 1;
  }
  return hits;
}

/** Detect engineering topics mentioned in question or chunk content. */
export function detectEngineeringTopics(text: string): EngineeringTopic[] {
  const h = haystack(text);
  if (!h) return ['general'];
  const found: EngineeringTopic[] = [];
  for (const topic of ALL_TOPIC_KEYS) {
    if (termHits(h, TOPIC_TERMS[topic]) > 0) found.push(topic);
  }
  return found.length ? found : ['general'];
}

/**
 * Score how well chunk content matches the engineering system asked about.
 * Positive = direct topical evidence; negative = conflicting unrelated systems.
 */
export function engineeringTopicRelevanceScore(question: string, content: string): number {
  const qTopics = detectEngineeringTopics(question).filter((t) => t !== 'general');
  if (!qTopics.length) return 0;

  const cTopics = detectEngineeringTopics(content);
  const cSet = new Set(cTopics);
  let score = 0;

  for (const topic of qTopics) {
    const hits = termHits(haystack(content), TOPIC_TERMS[topic]);
    if (hits > 0) {
      score += Math.min(0.35, 0.18 + hits * 0.04);
    } else {
      // Content discusses other engineering systems but not the asked one → penalize
      const conflicting = [...cSet].filter((t) => t !== 'general' && t !== topic);
      if (conflicting.length) score -= 0.34;
      else score -= 0.08;
    }
  }
  return score;
}

/** True when content shares at least one non-general topic with the question. */
export function contentMatchesEngineeringQuery(question: string, content: string): boolean {
  const qTopics = detectEngineeringTopics(question).filter((t) => t !== 'general');
  if (!qTopics.length) return true;
  const cTopics = new Set(detectEngineeringTopics(content));
  return qTopics.some((t) => cTopics.has(t));
}

export function questionHasSpecificEngineeringTopic(question: string): boolean {
  return detectEngineeringTopics(question).some((t) => t !== 'general');
}

/** Flag that persisted SBC chunks extracted before the join fix may need reingest. */
export const SBC_ARABIC_EXTRACTION_REINGEST_REQUIRED = true as const;

export const ENGINEERING_ABSTAIN_MESSAGE_AR =
  'لا يوجد مرجع مفهرس ذو صلة كافية للإجابة على هذا السؤال.';

export const ENGINEERING_ABSTAIN_MESSAGE_EN =
  'No sufficiently relevant indexed source was found for this question.';
