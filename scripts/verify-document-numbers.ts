import { createDemoSupabaseClient } from '../lib/demo/memory-client';
import {
  formatDocumentNumber,
  parseDocumentSequence,
} from '../lib/business/document-numbers';

async function main() {
  console.log('format quotation', formatDocumentNumber('quotation', 23, 2026));
  console.log('format outgoing', formatDocumentNumber('outgoing', 1, 2026));
  console.log('format client', formatDocumentNumber('client', 1006));
  console.log('parse', parseDocumentSequence('Q-2026-022', 'quotation'));

  const sb = createDemoSupabaseClient();
  const kinds = [
    'quotation',
    'contract',
    'invoice',
    'outgoing',
    'certificate',
    'client',
    'lead',
    'journal',
    'receipt',
    'payment',
    'return',
  ] as const;

  for (const kind of kinds) {
    const result = await sb.rpc('next_document_number', { p_doc_kind: kind });
    if (result.error) throw new Error(`${kind}: ${result.error.message}`);
    console.log(`${kind} -> ${result.data}`);
  }

  const second = await sb.rpc('next_document_number', { p_doc_kind: 'quotation' });
  console.log(`quotation#2 -> ${second.data}`);
  if (second.data !== 'Q-2026-024') {
    throw new Error(`Expected Q-2026-024 after seed max 22 + first next, got ${second.data}`);
  }
  console.log('OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
