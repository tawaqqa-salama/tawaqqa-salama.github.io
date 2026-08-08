/**
 * Social Media Hub business logic — CRM via resolveCrmClientFromChannel.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { isMarketingCrmMemoryMode, resolveCrmClientFromChannel } from '@/lib/marketing/crm-identity';
import { marketingMemory } from '@/lib/marketing/store/memory';
import { encryptSocialSecret, decryptSocialSecret } from '@/lib/social/crypto';
import { getSocialProvider } from '@/lib/social/provider';
import type { SocialPlatform } from '@/lib/social/types';
import { isDemoMode, isSupabaseConfigured, supabase } from '@/lib/supabase';

function isMemoryStore() {
  return isMarketingCrmMemoryMode();
}

function publicAccount(row: {
  id: string;
  platform: string;
  account_name: string;
  account_id: string;
  profile_url: string | null;
  avatar_url: string | null;
  status: string;
  connection_status: string;
  token_expiry: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  scopes?: string[];
  metadata?: Record<string, unknown>;
}) {
  return {
    id: row.id,
    platform: row.platform,
    account_name: row.account_name,
    account_id: row.account_id,
    profile_url: row.profile_url,
    avatar_url: row.avatar_url,
    status: row.status,
    connection_status: row.connection_status,
    token_expiry: row.token_expiry,
    last_sync: row.last_sync_at,
    last_error: row.last_error,
    scopes: row.scopes || [],
    has_token: true,
    // never expose tokens
  };
}

export async function listSocialAccounts() {
  if (isMemoryStore()) return marketingMemory.accounts.list().map(publicAccount);
  const { data } = await supabase
    .from('social_accounts')
    .select(
      'id, platform, account_name, account_id, profile_url, avatar_url, status, connection_status, token_expiry, last_sync_at, last_error, scopes, metadata'
    )
    .order('created_at', { ascending: false });
  return (data || []).map((r) =>
    publicAccount({
      ...r,
      profile_url: r.profile_url ?? null,
      avatar_url: r.avatar_url ?? null,
      token_expiry: r.token_expiry ?? null,
      last_sync_at: r.last_sync_at ?? null,
      last_error: r.last_error ?? null,
    })
  );
}

export async function startOAuth(platform: SocialPlatform, origin: string) {
  const provider = getSocialProvider(platform);
  const state = randomBytes(16).toString('hex');
  const redirectUri = `${origin}/api/integrations/social/oauth/${platform}/callback`;
  const result = await provider.connect({ redirectUri, state });
  if (!result.ok) return result;
  // store state briefly in memory
  const g = globalThis as unknown as { __socialOAuthState?: Map<string, string> };
  if (!g.__socialOAuthState) g.__socialOAuthState = new Map();
  g.__socialOAuthState.set(state, platform);
  return { ...result, redirectUri };
}

export async function completeOAuth(
  platform: SocialPlatform,
  code: string,
  origin: string,
  state?: string | null
) {
  if (state) {
    const g = globalThis as unknown as { __socialOAuthState?: Map<string, string> };
    const expected = g.__socialOAuthState?.get(state);
    if (expected && expected !== platform) {
      return { ok: false as const, supported: true as const, error: 'CSRF state mismatch' };
    }
    g.__socialOAuthState?.delete(state);
  }
  const provider = getSocialProvider(platform);
  const redirectUri = `${origin}/api/integrations/social/oauth/${platform}/callback`;
  const result = await provider.handleOAuthCallback({ code, redirectUri });
  if (!result.ok || !result.supported) return result;

  const profile = result.data;
  const encrypted = encryptSocialSecret(profile.accessToken);
  const refreshEnc = profile.refreshToken ? encryptSocialSecret(profile.refreshToken) : null;
  const row = {
    platform,
    account_name: profile.accountName,
    account_id: profile.accountId,
    profile_url: profile.profileUrl ?? null,
    avatar_url: profile.avatarUrl ?? null,
    status: 'active',
    connection_status: 'connected',
    access_token_encrypted: encrypted,
    refresh_token_encrypted: refreshEnc,
    token_expiry: profile.tokenExpiry ?? null,
    scopes: profile.scopes || [],
    last_sync_at: new Date().toISOString(),
    last_error: null,
    metadata: {},
  };

  if (isMemoryStore()) {
    const saved = marketingMemory.accounts.upsert(row);
    marketingMemory.audit('social.account.connect', { platform, account_id: profile.accountId });
    return { ok: true as const, supported: true as const, data: publicAccount(saved) };
  }

  const { data, error } = await supabase
    .from('social_accounts')
    .upsert(
      { ...row, updated_at: new Date().toISOString() },
      { onConflict: 'platform,account_id' }
    )
    .select(
      'id, platform, account_name, account_id, profile_url, avatar_url, status, connection_status, token_expiry, last_sync_at, last_error, scopes'
    )
    .single();
  if (error || !data) {
    return { ok: false as const, supported: true as const, error: error?.message || 'save failed' };
  }
  await supabase.from('marketing_audit_logs').insert({
    action: 'social.account.connect',
    entity_type: 'social_account',
    entity_id: data.id,
    detail: { platform, account_id: profile.accountId },
  });
  return {
    ok: true as const,
    supported: true as const,
    data: publicAccount({
      ...data,
      profile_url: data.profile_url ?? null,
      avatar_url: data.avatar_url ?? null,
      token_expiry: data.token_expiry ?? null,
      last_sync_at: data.last_sync_at ?? null,
      last_error: data.last_error ?? null,
    }),
  };
}

export async function disconnectAccount(id: string) {
  if (isMemoryStore()) {
    const a = marketingMemory.accounts.disconnect(id);
    return { ok: Boolean(a), account: a ? publicAccount(a) : null };
  }
  const { data } = await supabase
    .from('social_accounts')
    .update({
      connection_status: 'disconnected',
      status: 'inactive',
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(
      'id, platform, account_name, account_id, profile_url, avatar_url, status, connection_status, token_expiry, last_sync_at, last_error, scopes'
    )
    .maybeSingle();
  return {
    ok: Boolean(data),
    account: data
      ? publicAccount({
          ...data,
          profile_url: data.profile_url ?? null,
          avatar_url: data.avatar_url ?? null,
          token_expiry: data.token_expiry ?? null,
          last_sync_at: data.last_sync_at ?? null,
          last_error: data.last_error ?? null,
        })
      : null,
  };
}

/** Inbound social message → CRM lead/client (no duplicates). */
export async function ingestInboundSocialMessage(input: {
  platform: SocialPlatform;
  accountId?: string | null;
  platformUserId: string;
  contactName?: string | null;
  contactUsername?: string | null;
  phone?: string | null;
  email?: string | null;
  text: string;
  platformMessageId?: string | null;
  threadId?: string | null;
  threadType?: 'message' | 'comment';
}) {
  const client = await resolveCrmClientFromChannel({
    phone: input.phone,
    email: input.email,
    platform: input.platform,
    platformUserId: input.platformUserId,
    displayName: input.contactName || input.contactUsername,
    messagePreview: input.text,
    touch: {
      source: input.platform,
      medium: 'social',
      channel: 'social_media',
      campaign: null,
    },
  });

  if (isMemoryStore()) {
    let conv = marketingMemory.conversations
      .list()
      .find(
        (c) =>
          c.platform === input.platform &&
          c.contact_platform_user_id === input.platformUserId &&
          c.thread_type === (input.threadType || 'message')
      );
    if (!conv) {
      conv = marketingMemory.conversations.upsert({
        platform: input.platform,
        social_account_id: input.accountId || null,
        customer_id: client.id,
        contact_name: input.contactName || null,
        contact_username: input.contactUsername || null,
        contact_platform_user_id: input.platformUserId,
        platform_thread_id: input.threadId || null,
        thread_type: input.threadType || 'message',
        status: 'open',
        last_message_at: new Date().toISOString(),
        last_message_preview: input.text.slice(0, 160),
        unread_count: 1,
      });
    } else {
      conv = marketingMemory.conversations.upsert({
        ...conv,
        customer_id: client.id,
        last_message_at: new Date().toISOString(),
        last_message_preview: input.text.slice(0, 160),
        unread_count: (conv.unread_count || 0) + 1,
      });
    }
    const msg = marketingMemory.messages.add({
      conversation_id: conv.id,
      platform_message_id: input.platformMessageId || null,
      direction: 'inbound',
      message_type: 'text',
      text: input.text,
      status: 'received',
    });
    return { client, conversation: conv, message: msg };
  }

  // Supabase path
  let convId: string | null = null;
  const { data: existing } = await supabase
    .from('social_conversations')
    .select('id, unread_count')
    .eq('platform', input.platform)
    .eq('contact_platform_user_id', input.platformUserId)
    .eq('thread_type', input.threadType || 'message')
    .limit(1);
  if (existing?.[0]) {
    convId = existing[0].id;
    await supabase
      .from('social_conversations')
      .update({
        customer_id: client.id,
        last_message_at: new Date().toISOString(),
        last_message_preview: input.text.slice(0, 160),
        unread_count: (existing[0].unread_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', convId);
  } else {
    const { data: created } = await supabase
      .from('social_conversations')
      .insert({
        platform: input.platform,
        social_account_id: input.accountId || null,
        customer_id: client.id,
        contact_name: input.contactName || null,
        contact_username: input.contactUsername || null,
        contact_platform_user_id: input.platformUserId,
        platform_thread_id: input.threadId || null,
        thread_type: input.threadType || 'message',
        status: 'open',
        last_message_at: new Date().toISOString(),
        last_message_preview: input.text.slice(0, 160),
        unread_count: 1,
      })
      .select('id')
      .single();
    convId = created?.id || null;
  }

  if (convId) {
    await supabase.from('social_messages').upsert(
      {
        conversation_id: convId,
        platform_message_id: input.platformMessageId || null,
        direction: 'inbound',
        message_type: 'text',
        text: input.text,
        status: 'received',
      },
      { onConflict: 'conversation_id,platform_message_id' }
    );
  }

  return { client, conversationId: convId };
}

export async function listInbox() {
  if (isMemoryStore()) {
    const clients = marketingMemory.listClients();
    return marketingMemory.conversations.list().map((c) => {
      const client = clients.find((x) => x.id === c.customer_id);
      return {
        ...c,
        customer: client
          ? {
              id: client.id,
              name: client.business_name || client.name,
              lead_source: client.lead_source,
              pipeline_stage: client.pipeline_stage,
              lead_status: client.lead_status,
            }
          : null,
      };
    });
  }
  const { data } = await supabase
    .from('social_conversations')
    .select(
      '*, clients:customer_id(id, name, business_name, lead_source, pipeline_stage, lead_status, owner_name)'
    )
    .order('last_message_at', { ascending: false })
    .limit(200);
  return (data || []).map((c) => {
    const cl = (c as { clients?: Record<string, unknown> | null }).clients;
    return {
      ...c,
      customer: cl
        ? {
            id: cl.id,
            name: cl.business_name || cl.name || cl.owner_name,
            lead_source: cl.lead_source,
            pipeline_stage: cl.pipeline_stage,
            lead_status: cl.lead_status,
          }
        : null,
    };
  });
}

export async function getConversationDetail(id: string) {
  if (isMemoryStore()) {
    const conv = marketingMemory.conversations.get(id);
    if (!conv) return null;
    return { conversation: conv, messages: marketingMemory.messages.list(id) };
  }
  const { data: conversation } = await supabase
    .from('social_conversations')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!conversation) return null;
  const { data: messages } = await supabase
    .from('social_messages')
    .select('*')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true });
  return { conversation, messages: messages || [] };
}

export async function createOrUpdatePost(input: {
  id?: string;
  title?: string | null;
  content: string;
  media?: unknown[];
  platforms: string[];
  publish_at?: string | null;
  status?: string;
  marketing_campaign_id?: string | null;
  ai_suggested?: boolean;
}) {
  const status = input.status || (input.publish_at ? 'scheduled' : 'draft');
  if (isMemoryStore()) {
    const existing = input.id ? marketingMemory.posts.get(input.id) : null;
    const post = {
      id: input.id || randomUUID(),
      title: input.title ?? null,
      content: input.content,
      media: input.media || [],
      platforms: input.platforms,
      publish_at: input.publish_at ?? null,
      status,
      marketing_campaign_id: input.marketing_campaign_id ?? null,
      ai_suggested: Boolean(input.ai_suggested),
      created_at: existing?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      targets: (input.platforms || []).map((p) => ({
        id: randomUUID(),
        platform: p,
        status: status === 'draft' ? 'draft' : 'scheduled',
        platform_post_id: null,
        error_message: null,
        unsupported_reason: null,
      })),
    };
    return marketingMemory.posts.save(post);
  }

  const payload = {
    title: input.title ?? null,
    content: input.content,
    media: input.media || [],
    platforms: input.platforms,
    publish_at: input.publish_at ?? null,
    status,
    marketing_campaign_id: input.marketing_campaign_id ?? null,
    ai_suggested: Boolean(input.ai_suggested),
    updated_at: new Date().toISOString(),
  };
  let postId = input.id;
  if (postId) {
    await supabase.from('social_posts').update(payload).eq('id', postId);
  } else {
    const { data } = await supabase.from('social_posts').insert(payload).select('id').single();
    postId = data?.id;
  }
  if (postId) {
    await supabase.from('social_post_targets').delete().eq('post_id', postId);
    await supabase.from('social_post_targets').insert(
      input.platforms.map((p) => ({
        post_id: postId,
        platform: p,
        status: status === 'draft' ? 'draft' : 'scheduled',
      }))
    );
    const { data } = await supabase
      .from('social_posts')
      .select('*, social_post_targets(*)')
      .eq('id', postId)
      .single();
    return data;
  }
  return null;
}

export async function listPosts() {
  if (isMemoryStore()) return marketingMemory.posts.list();
  const { data } = await supabase
    .from('social_posts')
    .select('*, social_post_targets(*)')
    .order('publish_at', { ascending: true, nullsFirst: false });
  return data || [];
}

export async function duplicatePost(id: string) {
  const posts = await listPosts();
  const src = (posts as Array<Record<string, unknown>>).find((p) => p.id === id);
  if (!src) return null;
  return createOrUpdatePost({
    title: `${src.title || 'منشور'} (نسخة)`,
    content: String(src.content || ''),
    media: (src.media as unknown[]) || [],
    platforms: (src.platforms as string[]) || [],
    publish_at: null,
    status: 'draft',
    marketing_campaign_id: (src.marketing_campaign_id as string) || null,
  });
}

export async function deletePost(id: string) {
  if (isMemoryStore()) {
    marketingMemory.posts.remove(id);
    return { ok: true };
  }
  await supabase.from('social_posts').delete().eq('id', id);
  return { ok: true };
}

export async function publishPostNow(id: string) {
  const posts = await listPosts();
  const post = (posts as Array<Record<string, unknown>>).find((p) => p.id === id);
  if (!post) return { ok: false, error: 'المنشور غير موجود' };

  const platforms = (post.platforms as string[]) || [];
  const results: Array<Record<string, unknown>> = [];

  if (isMemoryStore()) {
    const mem = marketingMemory.posts.get(id)!;
    mem.status = 'publishing';
    for (const t of mem.targets) {
      const provider = getSocialProvider(t.platform as SocialPlatform);
      const pub = await provider.publishPost('demo', { content: mem.content });
      if (!pub.ok && !pub.supported) {
        t.status = 'unsupported';
        t.unsupported_reason = pub.reason;
      } else if (!pub.ok) {
        t.status = 'failed';
        t.error_message = pub.error;
      } else {
        t.status = 'published';
        t.platform_post_id = pub.data.platformPostId;
      }
      results.push({ ...t });
    }
    mem.status = mem.targets.every((t) => t.status === 'published' || t.status === 'unsupported')
      ? mem.targets.some((t) => t.status === 'published')
        ? 'published'
        : 'failed'
      : mem.targets.some((t) => t.status === 'failed')
        ? 'failed'
        : 'published';
    mem.updated_at = new Date().toISOString();
    marketingMemory.posts.save(mem);
    marketingMemory.audit('social.post.publish', { id, results });
    return { ok: true, post: mem, results };
  }

  await supabase.from('social_posts').update({ status: 'publishing' }).eq('id', id);
  const { data: accounts } = await supabase
    .from('social_accounts')
    .select('*')
    .eq('connection_status', 'connected');

  for (const platform of platforms) {
    const account = (accounts || []).find((a) => a.platform === platform);
    const provider = getSocialProvider(platform as SocialPlatform);
    if (!account?.access_token_encrypted) {
      await supabase
        .from('social_post_targets')
        .update({
          status: 'failed',
          error_message: 'لا يوجد حساب متصل لهذه المنصة',
          updated_at: new Date().toISOString(),
        })
        .eq('post_id', id)
        .eq('platform', platform);
      results.push({ platform, status: 'failed', error: 'no account' });
      continue;
    }
    const token = decryptSocialSecret(account.access_token_encrypted);
    if (!token) {
      results.push({ platform, status: 'failed', error: 'token decrypt failed' });
      continue;
    }
    const pub = await provider.publishPost(token, {
      content: String(post.content || ''),
      mediaUrls: Array.isArray(post.media)
        ? (post.media as Array<{ url?: string }>).map((m) => m.url || '').filter(Boolean)
        : [],
    });
    if (!pub.ok && !pub.supported) {
      await supabase
        .from('social_post_targets')
        .update({
          status: 'unsupported',
          unsupported_reason: pub.reason,
          updated_at: new Date().toISOString(),
        })
        .eq('post_id', id)
        .eq('platform', platform);
      results.push({ platform, status: 'unsupported', reason: pub.reason });
    } else if (!pub.ok) {
      await supabase
        .from('social_post_targets')
        .update({
          status: 'failed',
          error_message: pub.error,
          updated_at: new Date().toISOString(),
        })
        .eq('post_id', id)
        .eq('platform', platform);
      results.push({ platform, status: 'failed', error: pub.error });
    } else {
      await supabase
        .from('social_post_targets')
        .update({
          status: 'published',
          platform_post_id: pub.data.platformPostId,
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('post_id', id)
        .eq('platform', platform);
      results.push({ platform, status: 'published', platformPostId: pub.data.platformPostId });
    }
  }

  const anyPublished = results.some((r) => r.status === 'published');
  const anyFailed = results.some((r) => r.status === 'failed');
  await supabase
    .from('social_posts')
    .update({
      status: anyPublished ? 'published' : anyFailed ? 'failed' : 'failed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  return { ok: anyPublished, results };
}

export async function getDashboardStats(range: string) {
  const days =
    range === 'today' ? 1 : range === '7d' ? 7 : range === '90d' ? 90 : range === 'custom' ? 30 : 30;
  const since = Date.now() - days * 86400000;

  if (isMemoryStore() || !isSupabaseConfigured || isDemoMode) {
    const clients = marketingMemory.listClients().filter((c) => new Date(c.created_at).getTime() >= since);
    const accounts = marketingMemory.accounts.list();
    const posts = marketingMemory.posts.list();
    const convos = marketingMemory.conversations.list();
    const bySource: Record<string, number> = {};
    for (const c of marketingMemory.listClients()) {
      const s = c.lead_source || c.last_touch_source || 'Other';
      bySource[s] = (bySource[s] || 0) + 1;
    }
    const opportunities = clients.filter((c) => c.pipeline_stage === 'sales').length;
    const quotes = clients.filter((c) => c.quotation_number).length;
    const won = clients.filter(
      (c) => c.pipeline_stage === 'projects' || c.pipeline_stage === 'completed' || c.pipeline_stage === 'finance'
    ).length;
    const messages = convos.reduce((n, c) => n + (c.unread_count || 0), 0) + convos.length;
    return {
      range,
      totals: {
        followers: accounts.length * 1200,
        followers_growth: accounts.length * 20,
        posts: posts.length,
        views: posts.length * 500,
        reach: posts.length * 300,
        engagement: posts.length * 40,
        comments: convos.filter((c) => c.thread_type === 'comment').length,
        messages,
        leads: clients.length,
        conversion_rate: clients.length ? Number(((won / clients.length) * 100).toFixed(1)) : 0,
      },
      by_platform: accounts.map((a) => ({
        platform: a.platform,
        connection_status: a.connection_status,
        followers: 1200,
        leads: clients.filter((c) => (c.lead_source || '').toLowerCase() === a.platform).length,
      })),
      funnel: {
        leads: clients.length,
        opportunities,
        quotes,
        won,
        revenue: won * 0,
      },
      leads_by_source: bySource,
      provider_mode: process.env.SOCIAL_PROVIDER_MODE || (isDemoMode ? 'demo' : 'live'),
    };
  }

  const { data: clients } = await supabase
    .from('clients')
    .select(
      'id, lead_source, source_channel, pipeline_stage, quotation_number, total_amount, created_at, first_touch_source, last_touch_source'
    )
    .gte('created_at', new Date(since).toISOString());
  const list = clients || [];
  const bySource: Record<string, number> = {};
  for (const c of list) {
    const s = c.lead_source || c.last_touch_source || 'Other';
    bySource[s] = (bySource[s] || 0) + 1;
  }
  const { data: accounts } = await supabase.from('social_accounts').select('platform, connection_status');
  const { count: postsCount } = await supabase
    .from('social_posts')
    .select('*', { count: 'exact', head: true });
  const { count: msgCount } = await supabase
    .from('social_messages')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', new Date(since).toISOString());

  const won = list.filter((c) =>
    ['finance', 'projects', 'completed'].includes(c.pipeline_stage || '')
  );
  return {
    range,
    totals: {
      followers: null,
      followers_growth: null,
      posts: postsCount || 0,
      views: null,
      reach: null,
      engagement: null,
      comments: null,
      messages: msgCount || 0,
      leads: list.length,
      conversion_rate: list.length ? Number(((won.length / list.length) * 100).toFixed(1)) : 0,
    },
    by_platform: (accounts || []).map((a) => ({
      platform: a.platform,
      connection_status: a.connection_status,
    })),
    funnel: {
      leads: list.length,
      opportunities: list.filter((c) => c.pipeline_stage === 'sales').length,
      quotes: list.filter((c) => c.quotation_number).length,
      won: won.length,
      revenue: won.reduce((s, c) => s + Number(c.total_amount || 0), 0),
    },
    leads_by_source: bySource,
  };
}

export async function syncAccountAnalytics(accountId: string) {
  if (isMemoryStore()) {
    const acc = marketingMemory.accounts.list().find((a) => a.id === accountId);
    if (!acc) return { ok: false, error: 'not found' };
    const provider = getSocialProvider(acc.platform as SocialPlatform);
    const analytics = await provider.getAnalytics('demo', {
      since: new Date(Date.now() - 30 * 86400000).toISOString(),
      until: new Date().toISOString(),
    });
    acc.last_sync_at = new Date().toISOString();
    return { ok: true, analytics };
  }
  const { data: acc } = await supabase.from('social_accounts').select('*').eq('id', accountId).maybeSingle();
  if (!acc) return { ok: false, error: 'not found' };
  const token = decryptSocialSecret(acc.access_token_encrypted);
  if (!token) return { ok: false, error: 'token unavailable' };
  const provider = getSocialProvider(acc.platform as SocialPlatform);
  const analytics = await provider.getAnalytics(token, {
    since: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    until: new Date().toISOString().slice(0, 10),
  });
  await supabase
    .from('social_accounts')
    .update({ last_sync_at: new Date().toISOString() })
    .eq('id', accountId);
  return { ok: analytics.ok, analytics };
}
