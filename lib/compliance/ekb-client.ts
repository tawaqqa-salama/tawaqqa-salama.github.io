import { EKB_TOPICS, getEkbTopic } from '@/lib/compliance/ekb-catalog';
import type { EkbTopic } from '@/lib/compliance/types';
import { isDemoMode, supabase } from '@/lib/supabase';

/**
 * يجلب مواضيع EKB من قاعدة البيانات إن وُجدت، وإلا من الكتالوج المدمج.
 */
export async function loadEkbTopics(): Promise<EkbTopic[]> {
  if (isDemoMode) return EKB_TOPICS;

  try {
    const { data, error } = await supabase
      .from('ekb_scenarios')
      .select('id, title, summary, tags, standard')
      .limit(50);

    if (error || !data?.length) {
      // محاولة بديلة من knowledge_articles
      const articles = await supabase
        .from('knowledge_articles')
        .select('id, title, summary, tags')
        .limit(50);
      if (articles.data?.length) {
        return articles.data.map((row) => ({
          id: String(row.id),
          title: String(row.title || 'موضوع'),
          standard: 'BOTH' as const,
          summary: String(row.summary || ''),
          tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
        }));
      }
      return EKB_TOPICS;
    }

    return data.map((row) => ({
      id: String(row.id),
      title: String(row.title || 'سيناريو'),
      standard: (row.standard as EkbTopic['standard']) || 'BOTH',
      summary: String(row.summary || ''),
      tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    }));
  } catch {
    return EKB_TOPICS;
  }
}

export async function resolveEkbHints(ids: string[]): Promise<EkbTopic[]> {
  const remote = await loadEkbTopics();
  const map = new Map(remote.map((t) => [t.id, t]));
  return ids
    .map((id) => map.get(id) || getEkbTopic(id))
    .filter((t): t is EkbTopic => Boolean(t));
}
