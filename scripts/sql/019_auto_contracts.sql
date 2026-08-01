-- أتمتة العقود + حقول لقطة العقد من عرض السعر / معلومات الشركة
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS commercial_register text;

ALTER TABLE public.sales_contracts
  ADD COLUMN IF NOT EXISTS auto_generated boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS amount_words text,
  ADD COLUMN IF NOT EXISTS duration_days integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS duration_text text,
  ADD COLUMN IF NOT EXISTS preamble text,
  ADD COLUMN IF NOT EXISTS party1_name text,
  ADD COLUMN IF NOT EXISTS party1_cr text,
  ADD COLUMN IF NOT EXISTS party1_tax text,
  ADD COLUMN IF NOT EXISTS party1_phone text,
  ADD COLUMN IF NOT EXISTS party1_address text,
  ADD COLUMN IF NOT EXISTS party1_license text,
  ADD COLUMN IF NOT EXISTS party2_name text,
  ADD COLUMN IF NOT EXISTS party2_cr text,
  ADD COLUMN IF NOT EXISTS party2_address text,
  ADD COLUMN IF NOT EXISTS party2_phone text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_account text,
  ADD COLUMN IF NOT EXISTS iban text,
  ADD COLUMN IF NOT EXISTS payment_first text,
  ADD COLUMN IF NOT EXISTS payment_second text,
  ADD COLUMN IF NOT EXISTS payment_final text,
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS sales_payment_type text,
  ADD COLUMN IF NOT EXISTS quotation_services jsonb DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_contracts_client_quotation
  ON public.sales_contracts (client_id, quotation_number)
  WHERE quotation_number IS NOT NULL AND deleted_at IS NULL;

-- دالة مساعدة لإنشاء عقد تلقائي من بيانات العميل + الشركة
CREATE OR REPLACE FUNCTION public.auto_generate_contract_from_quotation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_exists boolean;
  v_contract_number text;
  v_company public.companies%ROWTYPE;
  v_scope text;
  v_amount numeric;
  v_vat numeric;
  v_total numeric;
BEGIN
  IF NEW.quotation_number IS NULL OR COALESCE(NEW.quotation_amount, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  IF NOT (
    NEW.quotation_status IN ('معتمد', 'بانتظار السداد')
    OR NEW.financial_status IN ('تم السداد', 'معتمد مالياً')
  ) THEN
    RETURN NEW;
  END IF;

  -- يعمل فقط عند الانتقال إلى حالة الاعتماد/السداد
  IF TG_OP = 'UPDATE' AND NOT (
    (NEW.quotation_status IS DISTINCT FROM OLD.quotation_status AND NEW.quotation_status IN ('معتمد', 'بانتظار السداد'))
    OR (NEW.financial_status IS DISTINCT FROM OLD.financial_status AND NEW.financial_status IN ('تم السداد', 'معتمد مالياً'))
  ) THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.sales_contracts sc
    WHERE sc.client_id::text = NEW.id::text
      AND sc.quotation_number = NEW.quotation_number
      AND sc.deleted_at IS NULL
  ) INTO v_exists;

  IF v_exists THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_company FROM public.companies WHERE code = 'TWAQQA' LIMIT 1;

  BEGIN
    v_contract_number := public.next_document_number('contract');
  EXCEPTION WHEN OTHERS THEN
    v_contract_number := 'CT-' || to_char(now(), 'YYYY') || '-' || lpad((floor(random()*900)+100)::text, 3, '0');
  END;

  v_amount := COALESCE(NEW.quotation_amount, 0);
  v_vat := COALESCE(NEW.vat_amount, round(v_amount * 0.15, 2));
  v_total := COALESCE(NEW.total_amount, v_amount + v_vat);

  v_scope := COALESCE(
    (
      SELECT string_agg((ord)::text || '. ' || elem::text, E'\n' ORDER BY ord)
      FROM jsonb_array_elements_text(COALESCE(NEW.quotation_services, '[]'::jsonb)) WITH ORDINALITY AS t(elem, ord)
    ),
    'خدمات استشارية وتراخيص سلامة'
  );

  INSERT INTO public.sales_contracts (
    client_id, contract_number, quotation_number, contract_date,
    service_scope, terms, amount, vat_amount, total_amount, status,
    auto_generated, party2_name, party2_cr, party2_address, party2_phone,
    party1_name, party1_cr, party1_tax, party1_phone, party1_address, party1_license,
    bank_name, bank_account, iban,
    payment_first, payment_second, payment_final, payment_terms,
    sales_payment_type, quotation_services
  ) VALUES (
    NEW.id, v_contract_number, NEW.quotation_number, CURRENT_DATE,
    v_scope,
    'عقد مُنشأ تلقائياً من اعتماد/سداد عرض السعر — راجع قالب الطباعة للشروط العامة المعتمدة.',
    v_amount, v_vat, v_total, 'معتمد',
    true,
    COALESCE(NEW.business_name, NEW.name),
    NEW.commercial_register,
    NULLIF(concat_ws(' — ', NEW.street, NEW.district, NEW.city, NEW.region, NEW.national_address), ''),
    NEW.phone,
    COALESCE(v_company.legal_name, v_company.name),
    v_company.commercial_register,
    v_company.tax_number,
    v_company.phone,
    NULLIF(concat_ws(' — ', v_company.address, v_company.city), ''),
    NULL,
    v_company.bank_name,
    v_company.bank_account,
    v_company.iban,
    v_company.payment_first,
    v_company.payment_second,
    v_company.payment_final,
    v_company.payment_terms,
    COALESCE(NEW.sales_payment_type, 'نقدي'),
    COALESCE(NEW.quotation_services, '[]'::jsonb)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_auto_contract ON public.clients;
CREATE TRIGGER trg_clients_auto_contract
AFTER UPDATE OF quotation_status, financial_status ON public.clients
FOR EACH ROW
EXECUTE PROCEDURE public.auto_generate_contract_from_quotation();
