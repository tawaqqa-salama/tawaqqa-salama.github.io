-- ترقيم المستندات التسلسلي الاحترافي (PREFIX-YYYY-NNN)
-- يُستدعى من التطبيق عبر: supabase.rpc('next_document_number', { p_doc_kind: 'quotation' })

CREATE TABLE IF NOT EXISTS public.document_sequences (
  company_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  doc_kind text NOT NULL,
  year_key integer NOT NULL DEFAULT 0,
  last_value integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, doc_kind, year_key),
  CONSTRAINT document_sequences_kind_check CHECK (
    doc_kind = ANY (ARRAY[
      'quotation'::text,
      'contract'::text,
      'invoice'::text,
      'outgoing'::text,
      'return'::text,
      'journal'::text,
      'receipt'::text,
      'payment'::text,
      'certificate'::text,
      'client'::text,
      'lead'::text
    ])
  ),
  CONSTRAINT document_sequences_last_value_check CHECK (last_value >= 0)
);

CREATE INDEX IF NOT EXISTS idx_document_sequences_kind
  ON public.document_sequences (doc_kind, year_key);

COMMENT ON TABLE public.document_sequences IS
  'عدّادات تسلسل أرقام المستندات حسب الشركة والنوع والسنة';

CREATE OR REPLACE FUNCTION public.format_document_number(
  p_doc_kind text,
  p_sequence integer,
  p_year integer
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_prefix text;
  v_pad integer;
  v_yearly boolean;
  v_padded text;
BEGIN
  CASE p_doc_kind
    WHEN 'quotation' THEN v_prefix := 'Q'; v_pad := 3; v_yearly := true;
    WHEN 'contract' THEN v_prefix := 'CT'; v_pad := 3; v_yearly := true;
    WHEN 'invoice' THEN v_prefix := 'INV'; v_pad := 3; v_yearly := true;
    WHEN 'outgoing' THEN v_prefix := 'OUT'; v_pad := 4; v_yearly := true;
    WHEN 'return' THEN v_prefix := 'RET'; v_pad := 3; v_yearly := true;
    WHEN 'journal' THEN v_prefix := 'JE'; v_pad := 4; v_yearly := true;
    WHEN 'receipt' THEN v_prefix := 'RV'; v_pad := 4; v_yearly := true;
    WHEN 'payment' THEN v_prefix := 'PV'; v_pad := 4; v_yearly := true;
    WHEN 'certificate' THEN v_prefix := 'CERT'; v_pad := 3; v_yearly := true;
    WHEN 'client' THEN v_prefix := 'C'; v_pad := 4; v_yearly := false;
    WHEN 'lead' THEN v_prefix := 'LD'; v_pad := 3; v_yearly := true;
    ELSE
      RAISE EXCEPTION 'نوع مستند غير معروف: %', p_doc_kind;
  END CASE;

  v_padded := lpad(p_sequence::text, v_pad, '0');

  IF v_yearly THEN
    RETURN v_prefix || '-' || p_year::text || '-' || v_padded;
  END IF;

  RETURN v_prefix || '-' || v_padded;
END;
$$;

CREATE OR REPLACE FUNCTION public.next_document_number(
  p_doc_kind text,
  p_company_id uuid DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_year integer;
  v_year_key integer;
  v_yearly boolean;
  v_next integer;
BEGIN
  IF p_doc_kind IS NULL OR btrim(p_doc_kind) = '' THEN
    RAISE EXCEPTION 'p_doc_kind مطلوب';
  END IF;

  v_company := COALESCE(p_company_id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_year := EXTRACT(YEAR FROM timezone('Asia/Riyadh', now()))::integer;

  v_yearly := p_doc_kind <> 'client';
  v_year_key := CASE WHEN v_yearly THEN v_year ELSE 0 END;

  INSERT INTO public.document_sequences (company_id, doc_kind, year_key, last_value)
  VALUES (v_company, p_doc_kind, v_year_key, 0)
  ON CONFLICT (company_id, doc_kind, year_key) DO NOTHING;

  UPDATE public.document_sequences
  SET
    last_value = last_value + 1,
    updated_at = now()
  WHERE company_id = v_company
    AND doc_kind = p_doc_kind
    AND year_key = v_year_key
  RETURNING last_value INTO v_next;

  IF v_next IS NULL THEN
    RAISE EXCEPTION 'تعذر إصدار رقم تسلسلي للنوع %', p_doc_kind;
  END IF;

  RETURN public.format_document_number(p_doc_kind, v_next, v_year);
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_document_number(text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.format_document_number(text, integer, integer) TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.document_sequences TO anon, authenticated, service_role;

-- تهيئة أولية من البيانات الحالية (آمنة للتكرار)
DO $$
DECLARE
  y integer := EXTRACT(YEAR FROM timezone('Asia/Riyadh', now()))::integer;
  max_q integer;
  max_ct integer;
  max_inv integer;
  max_ret integer;
  max_c integer;
BEGIN
  SELECT COALESCE(MAX((regexp_match(quotation_number, '^Q-' || y::text || '-(\d+)$'))[1]::int), 0)
  INTO max_q FROM public.clients WHERE quotation_number ~ ('^Q-' || y::text || '-\d+$');

  SELECT GREATEST(
    max_q,
    COALESCE((
      SELECT MAX((regexp_match(doc_number, '^Q-' || y::text || '-(\d+)$'))[1]::int)
      FROM public.sales_documents
      WHERE doc_type = 'quotation' AND doc_number ~ ('^Q-' || y::text || '-\d+$')
    ), 0)
  ) INTO max_q;

  INSERT INTO public.document_sequences (company_id, doc_kind, year_key, last_value)
  VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 'quotation', y, max_q)
  ON CONFLICT (company_id, doc_kind, year_key)
  DO UPDATE SET last_value = GREATEST(public.document_sequences.last_value, EXCLUDED.last_value);

  SELECT COALESCE(MAX((regexp_match(contract_number, '^CT-' || y::text || '-(\d+)$'))[1]::int), 0)
  INTO max_ct FROM public.sales_contracts WHERE contract_number ~ ('^CT-' || y::text || '-\d+$');

  INSERT INTO public.document_sequences (company_id, doc_kind, year_key, last_value)
  VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 'contract', y, max_ct)
  ON CONFLICT (company_id, doc_kind, year_key)
  DO UPDATE SET last_value = GREATEST(public.document_sequences.last_value, EXCLUDED.last_value);

  SELECT COALESCE(MAX((regexp_match(doc_number, '^INV-' || y::text || '-(\d+)$'))[1]::int), 0)
  INTO max_inv FROM public.sales_documents
  WHERE doc_type = 'invoice' AND doc_number ~ ('^INV-' || y::text || '-\d+$');

  INSERT INTO public.document_sequences (company_id, doc_kind, year_key, last_value)
  VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 'invoice', y, max_inv)
  ON CONFLICT (company_id, doc_kind, year_key)
  DO UPDATE SET last_value = GREATEST(public.document_sequences.last_value, EXCLUDED.last_value);

  SELECT COALESCE(MAX((regexp_match(return_number, '^RET-' || y::text || '-(\d+)$'))[1]::int), 0)
  INTO max_ret FROM public.sales_returns WHERE return_number ~ ('^RET-' || y::text || '-\d+$');

  INSERT INTO public.document_sequences (company_id, doc_kind, year_key, last_value)
  VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 'return', y, max_ret)
  ON CONFLICT (company_id, doc_kind, year_key)
  DO UPDATE SET last_value = GREATEST(public.document_sequences.last_value, EXCLUDED.last_value);

  SELECT COALESCE(MAX((regexp_match(client_code, '^C-(\d+)$'))[1]::int), 0)
  INTO max_c FROM public.clients WHERE client_code ~ '^C-\d+$';

  INSERT INTO public.document_sequences (company_id, doc_kind, year_key, last_value)
  VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 'client', 0, max_c)
  ON CONFLICT (company_id, doc_kind, year_key)
  DO UPDATE SET last_value = GREATEST(public.document_sequences.last_value, EXCLUDED.last_value);
END $$;
