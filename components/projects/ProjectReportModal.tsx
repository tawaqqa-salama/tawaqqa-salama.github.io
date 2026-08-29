'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { seedBuildingPlanFromClient } from '@/lib/projects/building-plan';
import { resolveStage4ProjectClassification } from '@/lib/projects/project-classification-resolution';
import { seedSpaceSafetyFromClient } from '@/lib/projects/design-center/space-safety';
import {
  parseProjectEngineeringData,
  syncProjectVisitsFromQuotation,
  getProjectReportProgress,
  seedProjectEngineeringFromClient,
} from '@/lib/business/project-reports';
import EngineeringDeliverySection from '@/components/projects/EngineeringDeliverySection';
import CdCoverLetterSection from '@/components/projects/CdCoverLetterSection';
import ReadOnlyCorrespondenceWorkspace from '@/components/projects/ReadOnlyCorrespondenceWorkspace';
import FinalInspectionSection from '@/components/projects/FinalInspectionSection';
import CompletionCertificateSection from '@/components/projects/CompletionCertificateSection';
import FieldVisitObservationsSection from '@/components/projects/FieldVisitObservationsSection';
import FieldVisitEvidenceSection from '@/components/projects/FieldVisitEvidenceSection';
import RemediationFollowUpPanel from '@/components/projects/RemediationFollowUpPanel';
import Stage5TraceabilityPanel from '@/components/projects/Stage5TraceabilityPanel';
import SupervisionReportSection from '@/components/projects/SupervisionReportSection';
import DesignCenterSection from '@/components/projects/DesignCenterSection';
import ExistingProjectAssessmentSection from '@/components/projects/ExistingProjectAssessmentSection';
import ExistingTechnicalReportPreview from '@/components/projects/ExistingTechnicalReportPreview';
import ExistingTechnicalReportInputsSection from '@/components/projects/ExistingTechnicalReportInputsSection';
import UnderConstructionTechnicalReportPreview from '@/components/projects/UnderConstructionTechnicalReportPreview';
import {
  downloadTechnicalReportPdf,
  previewTechnicalReport,
  printTechnicalReport,
} from '@/components/projects/TechnicalReportPrint';
import UnderConstructionStudySection from '@/components/projects/UnderConstructionStudySection';
import BuildingPlanReportSection from '@/components/projects/BuildingPlanReportSection';
import WorkflowStageRail from '@/components/projects/WorkflowStageRail';
import { useProjectStagesDrawer } from '@/components/layout/ProjectStagesDrawerContext';
import InvoicePromptModal from '@/components/invoices/InvoicePromptModal';
import {
  downloadTaxInvoice,
  printTaxInvoice,
  shareTaxInvoiceWhatsApp,
} from '@/components/invoices/TaxInvoiceTemplate';
import {
  generateInvoiceForEngineeringEvent,
  generateTaxInvoiceFromMilestone,
} from '@/lib/invoices/tax-invoice-service';
import { loadCompanyProfile, loadLocalCompanyProfile, type CompanyProfile } from '@/lib/company-profile';
import { seedSupervisionReport, trimSupervisionTextFields } from '@/lib/projects/supervision-report';
import { ensureCertificateNumber, ensureOutgoingNumber } from '@/lib/business/document-numbers';
import { backupEngineeringDataLocally } from '@/lib/supabase/safe-client-write';
import { humanizeFetchError } from '@/lib/api/safe-json';
import {
  WORKFLOW_STAGES,
  approveWorkflowStage,
  canUnlockStage,
  resolveActiveStage,
  stageApprovalBlockers,
  type WorkflowStageId,
} from '@/lib/projects/gated-pipeline';
import { sanitizeEngineeringDataForPersist } from '@/lib/projects/sanitize-engineering-files';
import { saveReportData } from '@/lib/projects/save-supervision-report';
import {
  openReportPdfSnapshot,
  saveFieldVisitAsPdfAttachment,
  saveSupervisionAsPdfAttachment,
} from '@/lib/projects/save-report-pdf';
import {
  transitionProjectEngineeringStage,
  workflowBlockerMessage,
} from '@/lib/projects/engineering-workflow-transition';
import {
  hydrateEngineeringWithStage5,
  loadStage5LiveBundle,
} from '@/lib/projects/stage5-live-store';
import { normalizeFieldVisitEvidenceForVisit } from '@/lib/projects/field-visit-evidence';
import { persistFieldVisitEvidenceMetadata } from '@/lib/projects/field-visit-evidence-persistence';
import {
  hydrateEngineeringWithLive,
  loadEngineeringLive,
} from '@/lib/projects/engineering-live-store';
import {
  saveStage6SingletonDocument,
  stage6BridgeErrorMessage,
  type Stage6SingletonDocumentType,
} from '@/lib/projects/stage6-singleton-document-bridge';
import {
  approveStage6DocumentsAndTransition,
  stage6ApprovalErrorMessage,
  type Stage6ApprovalErrorCode,
} from '@/lib/projects/stage6-approval-orchestration';
import {
  hydrateEngineeringWithStage4,
  loadStage4LiveBundle,
} from '@/lib/projects/stage4-live-store';
import {
  isLastTechReportChapter,
  isTechReportChapterId,
  nextTechReportChapter,
  techReportChapterTitle,
} from '@/lib/projects/technical-report-chapters';
import type { TechReportChapterId } from '@/lib/constants/technical-report';
import type { ClientRecord } from '@/lib/types/client';
import type { ProjectEngineeringData } from '@/lib/types/project-reports';
import type { TaxInvoice } from '@/lib/types/tax-invoice';

interface ProjectReportModalProps {
  client: ClientRecord | null;
  onClose: () => void;
  onUpdated: () => void;
  /** Prefer opening this stage when unlocked (e.g. designs / Design Center) */
  preferredStage?: WorkflowStageId | null;
  /** صفحة كاملة داخل التطبيق بدل نافذة منبثقة */
  variant?: 'modal' | 'page';
}

const REPORT_STATUSES = ['مسودة', 'قيد الإعداد', 'مكتمل', 'معتمد'] as const;

export default function ProjectReportModal({
  client,
  onClose,
  onUpdated,
  preferredStage = null,
  variant = 'modal',
}: ProjectReportModalProps) {
  const isPage = variant === 'page';
  const [activeStage, setActiveStage] = useState<WorkflowStageId>('designs');
  const [techReportChapter, setTechReportChapter] = useState<TechReportChapterId>('facility');
  const [data, setData] = useState<ProjectEngineeringData | null>(null);
  const [saving, setSaving] = useState(false);
  const [stage6WorkspaceRevision, setStage6WorkspaceRevision] = useState(0);
  const [stage6ApprovalReloadRequired, setStage6ApprovalReloadRequired] = useState(false);
  const stage6ApprovalInFlightRef = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [invoicePromptOpen, setInvoicePromptOpen] = useState(false);
  const [promptInvoice, setPromptInvoice] = useState<TaxInvoice | null>(null);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [pendingInvoiceEvent, setPendingInvoiceEvent] = useState<
    'engineering_delivery' | 'final_inspection' | 'completion' | 'manual' | null
  >(null);
  const [boqItem, setBoqItem] = useState('');
  const [evidenceTargetObservationId, setEvidenceTargetObservationId] = useState<string | null>(null);
  const [supervisionLinkTarget, setSupervisionLinkTarget] = useState<{ visitNumber: number; observationId: string } | null>(null);
  const {
    open: stagesOpen,
    register: registerStagesDrawer,
    unregister: unregisterStagesDrawer,
  } = useProjectStagesDrawer();

  useEffect(() => {
    void loadCompanyProfile().then(setCompany);
  }, []);

  useEffect(() => {
    if (!client) {
      unregisterStagesDrawer();
      return;
    }
    registerStagesDrawer();
    return () => unregisterStagesDrawer();
  }, [client, registerStagesDrawer, unregisterStagesDrawer]);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    void (async () => {
      const visitsCount = client.quotation_visits_count || 1;
      const parsed = parseProjectEngineeringData(client.project_engineering_data);
      const withPlan = {
        ...parsed,
        building_plan: seedBuildingPlanFromClient(client, parsed.building_plan),
      };
      const seeded = seedProjectEngineeringFromClient(client, withPlan);
      const companySnapshot = company || loadLocalCompanyProfile();
      const withSupervision = {
        ...seeded,
        supervision_report: seedSupervisionReport(
          client,
          seeded,
          companySnapshot,
          seeded.supervision_report
        ),
      };
      let synced = syncProjectVisitsFromQuotation(withSupervision, visitsCount);
      // Older stage 4/5 tables first; all-stages live store wins last
      const [live, stage4, stage5] = await Promise.all([
        loadEngineeringLive(client.id),
        loadStage4LiveBundle(client.id),
        loadStage5LiveBundle(client.id),
      ]);
      if (cancelled) return;
      synced = hydrateEngineeringWithStage4(synced, stage4);
      synced = hydrateEngineeringWithStage5(synced, stage5);
      synced = hydrateEngineeringWithLive(synced, live);
      const hasPersistedSpaceSafety = Boolean(synced.design_center.space_safety?.floors.length);
      synced = {
        ...synced,
        design_center: {
          ...synced.design_center,
          space_safety: seedSpaceSafetyFromClient(client, synced.design_center.space_safety),
          ui: {
            ...synced.design_center.ui,
            active_tab: hasPersistedSpaceSafety
              ? synced.design_center.ui?.active_tab || 'space_safety'
              : 'space_safety',
          },
        },
      };
      setData(synced);
      const savedChapter = synced.workflow?.tech_report_chapter;
      setTechReportChapter(isTechReportChapterId(savedChapter) ? savedChapter : 'facility');
      const resolved = resolveActiveStage(client, synced, preferredStage);
      setActiveStage(resolved);
      if (
        preferredStage === 'designs' &&
        resolved !== 'designs' &&
        !canUnlockStage('designs', client, synced)
      ) {
        setMessage('مرحلة التصاميم مقفلة — اعتمد العقد أو الحالة المالية من المبيعات أولاً ثم افتح مركز التصاميم.');
      } else {
        setMessage(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, preferredStage]);

  useEffect(() => {
    if (!client || !data || !company) return;
    const current = data.supervision_report;
    if (current?.supervising_office?.trim() && current?.tasks?.length) return;
    const next = seedSupervisionReport(client, data, company, current);
    setData({ ...data, supervision_report: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.legal_name, company?.name, client?.id]);

  const progress = useMemo(
    () => (data && client ? getProjectReportProgress(data, client) : 0),
    [data, client]
  );

  // Project classification is canonical project identity synced from Basic Data.
  const classificationGate = useMemo(
    () => (client ? resolveStage4ProjectClassification(client) : null),
    [client]
  );
  const projectClassification =
    classificationGate?.status === 'RESOLVED' ? classificationGate.classification : null;
  const classificationNeedsDataMessage =
    classificationGate?.status === 'NEEDS_DATA' ? classificationGate.message : null;

  const stageMeta = WORKFLOW_STAGES.find((s) => s.id === activeStage);

  if (!client || !data) return null;

  const save = async (
    nextData: ProjectEngineeringData,
    successText: string,
    options?: {
      issueOutgoing?: boolean;
      issueCertificate?: boolean;
      stayOpen?: boolean;
      /** Batch-upsert supervision items + lean JSONB merge (avoids statement timeout) */
      supervisionFocus?: boolean;
      /** Stage 4 technical report live table (no fat JSONB rewrite) */
      techReportFocus?: boolean;
    }
  ): Promise<boolean> => {
    setSaving(true);
    setMessage(null);
    const outgoingNumber = options?.issueOutgoing
      ? await ensureOutgoingNumber(nextData.technical_report?.outgoing_number)
      : nextData.technical_report?.outgoing_number;
    const certificateNumber = options?.issueCertificate
      ? await ensureCertificateNumber(nextData.completion_certificate?.certificate_number)
      : nextData.completion_certificate?.certificate_number;
    const stampedRaw: ProjectEngineeringData = {
      ...nextData,
      technical_report: {
        ...nextData.technical_report,
        ...(outgoingNumber ? { outgoing_number: outgoingNumber } : {}),
        updated_at: new Date().toISOString(),
      },
      building_plan: {
        ...nextData.building_plan,
        updated_at: new Date().toISOString(),
      },
      completion_certificate: {
        ...nextData.completion_certificate,
        ...(certificateNumber ? { certificate_number: certificateNumber } : {}),
      },
      supervision_report: nextData.supervision_report
        ? trimSupervisionTextFields(nextData.supervision_report)
        : nextData.supervision_report,
    };
    // Drop bulky inline dataUrls when storagePath exists so JSONB stays lean and syncs across devices
    const stamped = sanitizeEngineeringDataForPersist(stampedRaw);
    const pipelineStage = client.pipeline_stage === 'completed' ? 'completed' : 'projects';

    // Optimistic UI: keep user input visible even if the server call times out / retries
    backupEngineeringDataLocally(client.id, stamped);
    setData(stamped);

    // Do NOT treat the whole inspections stage as supervision-only merge —
    // that previously dropped field_visits updates when lean RPC succeeded.
    const supervisionFocus = options?.supervisionFocus === true;
    const techReportFocus =
      options?.techReportFocus === true || activeStage === 'technical_report';

    const result = await saveReportData(client.id, stamped, {
      pipelineStage,
      supervisionFocus,
      techReportFocus: techReportFocus && !supervisionFocus,
    });

    setSaving(false);

    if (result.error) {
      setMessage(
        `تعذّر الحفظ على السيرفر — تم حفظ نسخة محلية: ${humanizeFetchError(result.error)}`
      );
      return false;
    }

    setMessage(successText);

    const deliveryDone = ['مكتمل', 'معتمد'].includes(stamped.engineering_delivery.status || '');
    const finalDone = ['مكتمل', 'معتمد'].includes(stamped.final_inspection.status || '');
    const completionDone = ['مكتمل', 'معتمد'].includes(stamped.completion_certificate.status || '');
    const willInvoice =
      (deliveryDone && successText.includes('تسليم')) ||
      (finalDone && successText.includes('النهائي')) ||
      (completionDone && successText.includes('شهادة'));

    if (willInvoice && !options?.stayOpen) {
      if (deliveryDone && successText.includes('تسليم')) {
        setPendingInvoiceEvent('engineering_delivery');
      } else if (finalDone && successText.includes('النهائي')) {
        setPendingInvoiceEvent('final_inspection');
      } else {
        setPendingInvoiceEvent('completion');
      }
      setPromptInvoice(null);
      setInvoicePromptOpen(true);
    } else if (!isPage && !options?.stayOpen && !successText.includes('اعتماد')) {
      onClose();
    }

    void import('@/lib/activity/logger').then(({ logActivity }) =>
      logActivity({
        actionType: 'UPDATE',
        module: 'projects',
        pageUrl: isPage ? `/projects/file/?id=${client.id}` : '/projects',
        details: `تم تحديث تقرير هندسي للعميل ${client.business_name || client.name} — ${successText}`,
        metadata: { clientId: client.id, stage: activeStage },
      })
    );
    requestAnimationFrame(() => onUpdated());
    return true;
  };

  /**
   * The two approved Stage 6 forms save only through Migration 060. Deliberately
   * do not call save(), saveReportData(), or saveEngineeringLive() here: that
   * would create a browser-side dual write beside the atomic server bridge.
   */
  const saveStage6Document = async (
    type: Stage6SingletonDocumentType,
    document: ProjectEngineeringData['engineering_delivery'] | ProjectEngineeringData['cd_cover_letter'],
    successText: string
  ): Promise<boolean> => {
    setSaving(true);
    setMessage(null);
    try {
      const result =
        type === 'engineering_delivery'
          ? await saveStage6SingletonDocument({
              clientId: client.id,
              identity: client.primary_engineering_project_identity,
              type,
              document: document as ProjectEngineeringData['engineering_delivery'],
            })
          : await saveStage6SingletonDocument({
              clientId: client.id,
              identity: client.primary_engineering_project_identity,
              type,
              document: document as ProjectEngineeringData['cd_cover_letter'],
            });

      if (!result.ok) {
        setMessage(stage6BridgeErrorMessage(result.code));
        return false;
      }

      const canonical = await loadEngineeringLive(client.id);
      if (!canonical) {
        setMessage('تم الحفظ على الخادم، لكن تعذر تحديث البيانات المعروضة. أعد تحميل ملف المشروع قبل متابعة العمل.');
        return false;
      }

      setData(canonical);
      setStage6WorkspaceRevision((revision) => revision + 1);
      setMessage(successText);
      requestAnimationFrame(() => onUpdated());
      return true;
    } catch {
      setMessage('تعذر تحديث حالة النموذج بعد الحفظ. بقيت بيانات النموذج في الشاشة؛ أعد تحميل ملف المشروع قبل متابعة العمل.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const reloadStage6CanonicalState = async (): Promise<ProjectEngineeringData | null> => {
    const canonical = await loadEngineeringLive(client.id);
    if (!canonical) return null;

    setData(canonical);
    setActiveStage(resolveActiveStage(client, canonical, null));
    setStage6WorkspaceRevision((revision) => revision + 1);
    return canonical;
  };

  const patch = (partial: Partial<ProjectEngineeringData>) => setData({ ...data, ...partial });

  const selectStage = (stageId: WorkflowStageId) => {
    if (!canUnlockStage(stageId, client, data)) {
      setMessage('يجب إنهاء واكتمال المرحلة السابقة أولاً');
      return;
    }
    setActiveStage(stageId);
    setMessage(null);
  };

  const handleApproveAndProceed = async () => {
    // Inside technical report: advance chapters first
    // facility → firefighting → ventilation → alarm → exits → recommendations
    // then leave to the unified visits and supervision stage
    if (activeStage === 'technical_report') {
      const nextChapter = nextTechReportChapter(techReportChapter);
      if (nextChapter) {
        const nextData: ProjectEngineeringData = {
          ...data,
          workflow: {
            ...(data.workflow || {}),
            tech_report_chapter: nextChapter,
            active_stage: 'technical_report',
          },
        };
        setTechReportChapter(nextChapter);
        setData(nextData);
        await save(
          nextData,
          `تم اعتماد «${techReportChapterTitle(techReportChapter)}» والانتقال إلى: ${techReportChapterTitle(nextChapter)}`,
          { stayOpen: true }
        );
        requestAnimationFrame(() => {
          document.getElementById('technical-report-chapters')?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
        });
        return;
      }
    }

    const clientBlockers = stageApprovalBlockers(activeStage, client, data);
    if (clientBlockers.length) {
      setMessage(clientBlockers.join(' — '));
      return;
    }

    if (activeStage === 'visits_supervision') {
      setSaving(true);
      try {
        const transition = await transitionProjectEngineeringStage(client.id, 'transmittals');
        if (!transition.ok) {
          setMessage(
            'تعذر اعتماد المرحلة: ' +
              (transition.blockers.map(workflowBlockerMessage).join(' — ') || transition.message)
          );
          return;
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'تعذر اعتماد مرحلة المشروع على الخادم');
        return;
      } finally {
        setSaving(false);
      }
    }

    // Stage 6D2: preserve the existing button and Stage 6A UX blockers, but
    // replace its only browser mutation boundary with Migration 061. 061 calls
    // 055 internally; the browser must never call 055, 057, or a generic save
    // alongside this approval path.
    if (activeStage === 'transmittals') {
      if (stage6ApprovalReloadRequired) {
        setMessage('تعذر تأكيد حالة الخادم السابقة. أعد تحميل ملف المشروع وراجع الحالة الكانونية قبل اعتماد المرحلة.');
        return;
      }
      if (stage6ApprovalInFlightRef.current) return;

      stage6ApprovalInFlightRef.current = true;
      setSaving(true);
      setMessage(null);
      try {
        const approval = await approveStage6DocumentsAndTransition({
          clientId: client.id,
          identity: client.primary_engineering_project_identity,
        });

        if (!approval.ok) {
          const mustReload: Stage6ApprovalErrorCode[] = [
            'CANONICAL_STALE_REVISION',
            'CORRESPONDENCE_STALE_VERSION',
            'CORRESPONDENCE_SINGLETON_CONFLICT',
            'NETWORK_OR_RPC_FAILURE',
          ];
          const baseMessage = stage6ApprovalErrorMessage(approval.code);

          if (mustReload.includes(approval.code)) {
            const canonical = await reloadStage6CanonicalState();
            if (canonical) {
              setStage6ApprovalReloadRequired(false);
              setMessage(`${baseMessage} تم إعادة تحميل الحالة الكانونية الحالية للمراجعة؛ لم يُنفذ أي retry تلقائي.`);
            } else {
              setStage6ApprovalReloadRequired(true);
              setMessage(`${baseMessage} تعذر إعادة تحميل الحالة الكانونية؛ أعد تحميل ملف المشروع قبل محاولة اعتماد جديدة.`);
            }
            return;
          }

          setMessage(baseMessage);
          return;
        }

        const canonical = await reloadStage6CanonicalState();
        if (!canonical) {
          setStage6ApprovalReloadRequired(true);
          setMessage('نجحت معاملة الاعتماد على الخادم، لكن تعذر تحميل الحالة الكانونية. أعد تحميل ملف المشروع قبل متابعة العمل.');
          return;
        }

        setStage6ApprovalReloadRequired(false);
        setMessage('تم اعتماد المرحلة والانتقال إلى: التقرير النهائي');
        requestAnimationFrame(() => onUpdated());
        return;
      } catch {
        const canonical = await reloadStage6CanonicalState();
        if (canonical) {
          setStage6ApprovalReloadRequired(false);
          setMessage('تعذر تأكيد نتيجة الاتصال بخدمة الاعتماد. تم إعادة تحميل الحالة الكانونية للمراجعة؛ لم يتم إجراء retry تلقائي.');
        } else {
          setStage6ApprovalReloadRequired(true);
          setMessage('تعذر تأكيد نتيجة الاتصال بخدمة الاعتماد أو إعادة تحميل الحالة الكانونية. أعد تحميل ملف المشروع قبل محاولة اعتماد جديدة.');
        }
        return;
      } finally {
        stage6ApprovalInFlightRef.current = false;
        setSaving(false);
      }
    }

    const result = approveWorkflowStage({
      stageId: activeStage,
      client,
      data,
      company,
    });
    if (!result.ok) {
      setMessage(result.blockers.join(' — ') || 'تعذّر اعتماد المرحلة');
      return;
    }
    const withChapterReset: ProjectEngineeringData = {
      ...result.data,
      workflow: {
        ...(result.data.workflow || {}),
        tech_report_chapter: 'facility',
      },
    };
    setData(withChapterReset);
    setActiveStage(result.nextStage);
    if (result.nextStage === 'visits_supervision') {
      setTechReportChapter('facility');
    }
    await save(
      withChapterReset,
      `تم اعتماد المرحلة والانتقال إلى: ${
        WORKFLOW_STAGES.find((s) => s.id === result.nextStage)?.label_ar || result.nextStage
      }`,
      {
        stayOpen: true,
        // Unified visits stage persists its legacy visit and observation records together.
        supervisionFocus: false,
        techReportFocus: false,
      }
    );
  };

  const nextTechChapter =
    activeStage === 'technical_report' ? nextTechReportChapter(techReportChapter) : null;
  const advancingTechChapter = activeStage === 'technical_report' && nextTechChapter != null;
  // Chapter hops inside the technical report are not gated by full stage blockers
  const blockers = advancingTechChapter
    ? []
    : stageApprovalBlockers(activeStage, client, data);
  const technicalReportOutputParams = {
    client,
    report: data.technical_report,
    company: company || loadLocalCompanyProfile(),
    engineeringData: data,
  };

  const runTechnicalReportAction = async (action: 'preview' | 'print' | 'download') => {
    setMessage(null);
    try {
      if (action === 'preview') await previewTechnicalReport(technicalReportOutputParams);
      if (action === 'print') await printTechnicalReport(technicalReportOutputParams);
      if (action === 'download') await downloadTechnicalReportPdf(technicalReportOutputParams);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر إخراج التقرير الفني.');
    }
  };

  const approveButtonLabel = advancingTechChapter
    ? `اعتماد والانتقال إلى: ${techReportChapterTitle(nextTechChapter)}`
    : activeStage === 'technical_report' && isLastTechReportChapter(techReportChapter)
      ? 'اعتماد والانتقال إلى الزيارات الميدانية'
      : 'اعتماد وانتقال للمرحلة التالية';

  const panel = (
        <div
          className={
            isPage
              ? 'bg-white rounded-2xl border border-gray-200 shadow-sm w-full min-h-[calc(100vh-7.5rem)] flex flex-col overflow-hidden'
              : 'bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden'
          }
        >
          <div className="p-5 border-b">
            <div className="flex justify-between items-start gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">ملف المشروع الهندسي — مسار المراحل</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {client.business_name || client.name} — {client.client_code}
                </p>
                <p className="text-xs text-sky-700 mt-1 font-semibold">
                  المرحلة الحالية: {stageMeta?.order}. {stageMeta?.label_ar}
                </p>
                {activeStage === 'designs' ? (
                  <p className="text-xs font-bold text-indigo-700 mt-1">
                    Design Center · مركز الذكاء التصميمي
                  </p>
                ) : null}
              </div>
              {isPage ? (
                <Link
                  href="/projects/"
                  onClick={onClose}
                  className="touch-target shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  رجوع للمشاريع
                </Link>
              ) : (
                <button type="button" onClick={onClose} className="text-2xl text-gray-400 leading-none">
                  ×
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-1 min-h-0">
            <div className="flex-1 min-w-0 p-5 overflow-y-auto space-y-4 order-1 rtl:order-2">
              {message ? (
                <div
                  className={`p-3 rounded-xl text-sm ${
                    message.includes('تم') || message.includes('اعتماد')
                      ? 'bg-green-50 text-green-700'
                      : 'bg-amber-50 text-amber-900'
                  }`}
                >
                  {message}
                </div>
              ) : null}

              {activeStage === 'designs' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-950 leading-relaxed">
                    مرحلة التصاميم — Design Center. الرفع يحفظ في السحابة (
                    <code className="font-mono">project-files</code>) ويظهر تحت «إدارة إصدارات
                    المخططات». إن فشل الرفع رغم وجود المجلد: راجع Policies (INSERT لـ anon /
                    authenticated) وأنواع MIME المسموحة، أو نفّذ سكربت{' '}
                    <code className="font-mono">029</code> لفتح كل الأنواع. اسم الملف في خانة
                    الاختيار ≠ حفظ ناجح.
                  </div>
                  {projectClassification === 'EXISTING' ? (
                    <ExistingProjectAssessmentSection
                      data={data}
                      assessment={data.existing_assessment}
                      saving={saving}
                      onChange={(existing_assessment) => patch({ existing_assessment })}
                      onSave={(existing_assessment) =>
                        save(
                          { ...data, existing_assessment },
                          'تم حفظ تقييم الموقع القائم داخل الحمولة الهندسية الكانونية.',
                          { stayOpen: true }
                        )
                      }
                    />
                  ) : projectClassification === 'UNDER_CONSTRUCTION' ? (
                    <UnderConstructionStudySection
                      client={client}
                      data={data}
                      study={data.under_construction_study}
                      saving={saving}
                      onChange={(under_construction_study) => patch({ under_construction_study })}
                      onSave={(under_construction_study) =>
                        save(
                          { ...data, under_construction_study },
                          'تم حفظ دراسة المشروع قيد الإنشاء داخل الحمولة الهندسية الكانونية.',
                          { stayOpen: true }
                        )
                      }
                    />
                  ) : projectClassification === null ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
                      {classificationNeedsDataMessage}
                    </div>
                  ) : null}
                  <DesignCenterSection
                    client={client}
                    data={data}
                    saving={saving}
                    onPatch={patch}
                    onPersistDesignCenter={async (design_center, extra) => {
                      const ok = await save(
                        { ...data, design_center, ...extra },
                        'تم حفظ المخططات في المشروع (سحابة) — تظهر من أي جهاز.',
                        { stayOpen: true }
                      );
                      if (!ok) {
                        throw new Error(
                          'تعذر حفظ المخطط على السيرفر. الملف قد يظهر هنا فقط حتى ينجح الحفظ السحابي.'
                        );
                      }
                    }}
                    onPersistBlueprints={async (safety_blueprints) => {
                      await save(
                        { ...data, safety_blueprints },
                        'تم حفظ مخططات السلامة وتشغيل الفحص الآلي.',
                        { stayOpen: true }
                      );
                    }}
                  />
                </div>
              )}

              {activeStage === 'plan_info' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-950 leading-relaxed">
                    مرحلة معلومات المخطط مستقلة عن التصاميم. الحقول العامة ورخصة البناء تُقرأ من المبيعات للعرض فقط، بينما تحفظ البيانات الفنية داخل ملف المشروع.
                  </div>
                  <BuildingPlanReportSection
                    client={client}
                    report={data.building_plan}
                    spaceSafety={data.design_center.space_safety}
                    saving={saving}
                    onChange={(building_plan) =>
                      patch({
                        building_plan,
                        technical_report: {
                          ...data.technical_report,
                          building_permit_number:
                            building_plan.building_permit_number ||
                            data.technical_report.building_permit_number,
                          building_permit_date:
                            building_plan.building_permit_date ||
                            data.technical_report.building_permit_date,
                        },
                      })
                    }
                    onSave={(building_plan, successText) =>
                      save(
                        {
                          ...data,
                          building_plan,
                          technical_report: {
                            ...data.technical_report,
                            building_permit_number:
                              building_plan.building_permit_number ||
                              data.technical_report.building_permit_number,
                            building_permit_date:
                              building_plan.building_permit_date ||
                              data.technical_report.building_permit_date,
                          },
                        },
                        successText,
                        { stayOpen: true }
                      )
                    }
                  />
                </div>
              )}

              {activeStage === 'boq_schedule' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-950">
                    يرث نطاق الإشغال من مرحلة التصاميم. بنود BOQ تُمرَّر تلقائياً إلى جدول الزيارات والإشراف.
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <StatusSelect
                      value={data.boq.status}
                      onChange={(status) => patch({ boq: { ...data.boq, status } })}
                    />
                    <StatusSelect
                      value={data.timeline.status}
                      onChange={(status) => patch({ timeline: { ...data.timeline, status } })}
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 border rounded-xl px-3 py-2 text-sm"
                      placeholder="بند نظام (إطفاء / إنذار / دخان…)"
                      value={boqItem}
                      onChange={(e) => setBoqItem(e.target.value)}
                    />
                    <button
                      type="button"
                      className="px-3 py-2 rounded-xl bg-slate-800 text-white text-sm"
                      onClick={() => {
                        if (!boqItem.trim()) return;
                        patch({
                          boq: {
                            ...data.boq,
                            items: [
                              ...(data.boq.items || []),
                              {
                                id: `boq-${Date.now()}`,
                                item: boqItem.trim(),
                                unit: 'وحدة',
                                quantity: 1,
                                unit_price: 0,
                              },
                            ],
                          },
                        });
                        setBoqItem('');
                      }}
                    >
                      إضافة
                    </button>
                  </div>
                  <ul className="text-sm space-y-1">
                    {(data.boq.items || []).map((item) => (
                      <li key={item.id} className="border rounded-lg px-3 py-2 bg-slate-50">
                        {item.item}
                      </li>
                    ))}
                  </ul>
                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label="بداية المشروع"
                      type="date"
                      value={data.timeline.project_start || ''}
                      onChange={(v) => patch({ timeline: { ...data.timeline, project_start: v } })}
                    />
                    <Field
                      label="نهاية المشروع"
                      type="date"
                      value={data.timeline.project_end || ''}
                      onChange={(v) => patch({ timeline: { ...data.timeline, project_end: v } })}
                    />
                  </div>
                  <textarea
                    rows={2}
                    placeholder="ملاحظات BOQ / الجدول"
                    value={data.boq.notes || ''}
                    onChange={(e) => patch({ boq: { ...data.boq, notes: e.target.value } })}
                    className="w-full p-2.5 border rounded-xl text-sm"
                  />
                </div>
              )}

              {activeStage === 'technical_report' && (
                <>
                  <div className="flex flex-wrap gap-2 border border-slate-200 bg-slate-50 p-3" aria-label="أفعال إخراج التقرير الفني">
                    <button
                      type="button"
                      disabled={projectClassification === null}
                      onClick={() => void runTechnicalReportAction('preview')}
                      className="px-3 py-2 border border-slate-300 bg-white text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      معاينة التقرير
                    </button>
                    <button
                      type="button"
                      disabled={projectClassification === null}
                      onClick={() => void runTechnicalReportAction('print')}
                      className="px-3 py-2 border border-slate-300 bg-white text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      طباعة A4
                    </button>
                    <button
                      type="button"
                      disabled={projectClassification === null}
                      onClick={() => void runTechnicalReportAction('download')}
                      className="px-3 py-2 border border-slate-300 bg-white text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      تحميل PDF
                    </button>
                  </div>
                  {projectClassification === 'EXISTING' ? (
                    <>
                      <ExistingTechnicalReportInputsSection
                        client={client}
                        data={data}
                        report={data.technical_report}
                        saving={saving}
                        onChange={(technical_report) => patch({ technical_report })}
                      />
                      <ExistingTechnicalReportPreview client={client} data={data} company={company} />
                    </>
                  ) : projectClassification === 'UNDER_CONSTRUCTION' ? (
                    <UnderConstructionTechnicalReportPreview client={client} data={data} company={company} />
                  ) : projectClassification === null ? (
                    <div className="border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-7 text-amber-950">
                      {classificationNeedsDataMessage}
                    </div>
                  ) : null}
                </>
              )}

              {activeStage === 'visits_supervision' && (
                <div className="space-y-6">
                  <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-950 leading-relaxed">
                    كل زيارة تُحفظ كـ <strong>PDF ثابت مستقل</strong> في مرفقات المشروع. عدد
                    الزيارات = عدد تقارير الزيارة. تقرير الإشراف يُصدَّر أيضاً كـ PDF عند الحفظ
                    دون استبدال تقارير الزيارات السابقة.
                  </div>
                  <RemediationFollowUpPanel
                    visits={data.field_visits}
                    supervision={data.supervision_report}
                    technicalNotes={data.technical_notes}
                  />
                  <Stage5TraceabilityPanel
                    data={data}
                    onOpenSnapshot={(snapshot) => {
                      void openReportPdfSnapshot(snapshot).catch((err) =>
                        setMessage(err instanceof Error ? err.message : 'تعذر فتح المرفق')
                      );
                    }}
                  />
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-bold">سجل الزيارات</h3>
                      <button
                        type="button"
                        className="rounded-xl border border-[#635bdb]/30 bg-white px-3 py-2 text-sm font-semibold text-[#635bdb]"
                        onClick={() => {
                          const nextVisitNumber =
                            Math.max(0, ...data.field_visits.map((visit) => visit.visit_number || 0)) + 1;
                          patch({
                            field_visits: [
                              ...data.field_visits,
                              { visit_number: nextVisitNumber, status: 'مسودة', checklist: [] },
                            ],
                          });
                        }}
                      >
                        + إضافة زيارة جديدة
                      </button>
                    </div>
                    {data.field_visits.map((visit) => (
                      <div key={visit.visit_number} className="border rounded-xl p-4 bg-gray-50">
                        <h4 className="font-bold text-sm mb-3">
                          تقرير الزيارة الميدانية #{visit.visit_number}
                        </h4>
                        <StatusSelect
                          value={visit.status}
                          onChange={(status) => {
                            patch({
                              field_visits: data.field_visits.map((v) =>
                                v.visit_number === visit.visit_number ? { ...v, status } : v
                              ),
                            });
                          }}
                        />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                          <Field
                            label="تاريخ الزيارة"
                            type="date"
                            value={visit.visit_date || ''}
                            onChange={(v) => {
                              patch({
                                field_visits: data.field_visits.map((x) =>
                                  x.visit_number === visit.visit_number ? { ...x, visit_date: v } : x
                                ),
                              });
                            }}
                          />
                          <Field
                            label="المهندس"
                            value={visit.engineer_name || ''}
                            onChange={(v) => {
                              patch({
                                field_visits: data.field_visits.map((x) =>
                                  x.visit_number === visit.visit_number
                                    ? { ...x, engineer_name: v }
                                    : x
                                ),
                              });
                            }}
                          />
                        </div>
                        <textarea
                          rows={3}
                          placeholder="النتائج والملاحظات"
                          value={visit.findings || ''}
                          onChange={(e) => {
                            patch({
                              field_visits: data.field_visits.map((x) =>
                                x.visit_number === visit.visit_number
                                  ? { ...x, findings: e.target.value }
                                  : x
                              ),
                            });
                          }}
                          className="w-full p-2.5 border rounded-xl text-sm mt-3"
                        />
                        <textarea
                          rows={2}
                          placeholder="الإجراء المطلوب أو التوصية"
                          value={visit.recommendations || ''}
                          onChange={(e) => {
                            patch({
                              field_visits: data.field_visits.map((x) =>
                                x.visit_number === visit.visit_number
                                  ? { ...x, recommendations: e.target.value }
                                  : x
                              ),
                            });
                          }}
                          className="w-full p-2.5 border rounded-xl text-sm mt-3"
                        />
                        <FieldVisitObservationsSection
                          visitNumber={visit.visit_number}
                          allVisits={data.field_visits}
                          observations={visit.observations || []}
                          disabled={saving}
                          linkedEvidenceCounts={(normalizeFieldVisitEvidenceForVisit(visit).evidence || []).reduce<Record<string, number>>((counts, item) => {
                            if (item.observation_id) counts[item.observation_id] = (counts[item.observation_id] || 0) + 1;
                            return counts;
                          }, {})}
                          linkedSupervisionCounts={(data.supervision_report.tasks || []).reduce<Record<string, number>>((counts, task) => {
                            for (const ref of task.related_observation_refs || []) {
                              if (ref.visit_number === visit.visit_number) counts[ref.observation_id] = (counts[ref.observation_id] || 0) + 1;
                            }
                            return counts;
                          }, {})}
                          linkedTechnicalDeficiencyCounts={(data.technical_notes.deficiencies || []).reduce<Record<string, number>>((counts, deficiency) => {
                            const ref = deficiency.source_visit_ref;
                            if (ref?.visit_number === visit.visit_number) counts[ref.observation_id] = (counts[ref.observation_id] || 0) + 1;
                            return counts;
                          }, {})}
                          onAddEvidenceToObservation={(observationId) => setEvidenceTargetObservationId(observationId)}
                          onLinkSupervisionToObservation={(observationId) => setSupervisionLinkTarget({ visitNumber: visit.visit_number, observationId })}
                          onCreateTechnicalDeficiency={(observationId) => {
                            const source = (visit.observations || []).find((observation) => observation.id === observationId);
                            if (!source) return;
                            const exists = (data.technical_notes.deficiencies || []).some((deficiency) =>
                              deficiency.source_visit_ref?.visit_number === visit.visit_number &&
                              deficiency.source_visit_ref?.observation_id === observationId
                            );
                            if (exists) {
                              setMessage('توجد ملاحظة فنية مرتبطة بهذه الملاحظة الميدانية بالفعل.');
                              return;
                            }
                            patch({
                              technical_notes: {
                                ...data.technical_notes,
                                deficiencies: [
                                  ...(data.technical_notes.deficiencies || []),
                                  {
                                    id: `def-${Date.now()}`,
                                    description: source.description || source.required_action || 'ملاحظة زيارة مرتبطة',
                                    severity: source.severity,
                                    resolved: false,
                                    source_visit_ref: { visit_number: visit.visit_number, observation_id: observationId },
                                  },
                                ],
                              },
                            });
                            setMessage('أُنشئت ملاحظة فنية مرتبطة يدويًا بالملاحظة الميدانية؛ احفظ المرحلة عندما تكون جاهزًا.');
                          }}
                          onChange={(observations) => {
                            patch({
                              field_visits: data.field_visits.map((x) => {
                                if (x.visit_number !== visit.visit_number) return x;
                                return normalizeFieldVisitEvidenceForVisit({ ...x, observations });
                              }),
                            });
                          }}
                        />
                        <FieldVisitEvidenceSection
                          clientId={client.id}
                          visit={visit}
                          disabled={saving}
                          requestedObservationId={visit.observations?.some((observation) => observation.id === evidenceTargetObservationId) ? evidenceTargetObservationId : null}
                          onRequestedObservationHandled={() => setEvidenceTargetObservationId(null)}
                          onChange={(nextVisit) => {
                            patch({
                              field_visits: data.field_visits.map((x) =>
                                x.visit_number === visit.visit_number ? nextVisit : x
                              ),
                            });
                          }}
                          onPersistMetadata={async (nextVisit) => {
                            const pipelineStage = client.pipeline_stage === 'completed' ? 'completed' : 'projects';
                            const result = await persistFieldVisitEvidenceMetadata({
                              clientId: client.id,
                              data,
                              visitNumber: visit.visit_number,
                              nextVisit,
                              pipelineStage,
                            });
                            if (result.error) throw new Error(humanizeFetchError(result.error));
                            setData(result.data);
                          }}
                        />
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => {
                              void (async () => {
                                setSaving(true);
                                setMessage(null);
                                const pipelineStage =
                                  client.pipeline_stage === 'completed' ? 'completed' : 'projects';
                                const result = await saveFieldVisitAsPdfAttachment({
                                  client,
                                  data,
                                  visitNumber: visit.visit_number,
                                  company,
                                  pipelineStage,
                                });
                                setData(result.data);
                                setSaving(false);
                                if (result.error) {
                                  setMessage(
                                    `تعذّر حفظ الزيارة — تم حفظ نسخة محلية: ${humanizeFetchError(result.error)}`
                                  );
                                  return;
                                }
                                const baseMsg = result.snapshot
                                  ? `تم حفظ الزيارة #${visit.visit_number} وإصدار PDF كمرفق ثابت.`
                                  : `تم حفظ الزيارة #${visit.visit_number}.`;
                                setMessage(
                                  result.warning ? `${baseMsg} ${result.warning}` : baseMsg
                                );
                                requestAnimationFrame(() => onUpdated());
                              })();
                            }}
                            className="px-3 py-2 rounded-xl bg-[#635bdb] text-white text-sm font-semibold disabled:opacity-60"
                          >
                            {saving ? 'جاري الحفظ...' : 'حفظ الزيارة كـ PDF مرفق'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void import('@/components/projects/FieldVisitReportPrint').then(
                                ({ printFieldVisitReport }) =>
                                  printFieldVisitReport({
                                    client,
                                    visit,
                                    company,
                                    totalVisits: data.field_visits.length,
                                  })
                              );
                            }}
                            className="px-3 py-2 rounded-xl border border-gray-300 bg-white text-sm font-semibold"
                          >
                            معاينة / طباعة
                          </button>
                        </div>
                        {(visit.pdf_snapshots || []).length > 0 ? (
                          <div className="mt-3 rounded-xl border border-emerald-100 bg-white px-3 py-2">
                            <p className="text-xs font-bold text-emerald-900 mb-1">
                              مرفقات PDF لهذه الزيارة ({visit.pdf_snapshots!.length})
                            </p>
                            <ul className="space-y-1">
                              {[...visit.pdf_snapshots!]
                                .slice()
                                .reverse()
                                .map((snap) => (
                                  <li key={snap.id} className="flex items-center justify-between gap-2 text-xs">
                                    <span className="truncate text-gray-700">
                                      {snap.fileName} · {new Date(snap.created_at).toLocaleString('ar-SA')}
                                    </span>
                                    <button
                                      type="button"
                                      className="shrink-0 text-[#635bdb] font-semibold"
                                      onClick={() => {
                                        void openReportPdfSnapshot(snap).catch((err) =>
                                          setMessage(
                                            err instanceof Error ? err.message : 'تعذر فتح المرفق'
                                          )
                                        );
                                      }}
                                    >
                                      فتح
                                    </button>
                                  </li>
                                ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <SupervisionReportSection
                    client={client}
                    data={data}
                    company={company}
                    saving={saving}
                    pendingObservationRef={supervisionLinkTarget}
                    onPendingObservationHandled={() => setSupervisionLinkTarget(null)}
                    onChange={(supervision_report) => patch({ supervision_report })}
                    onSave={() => {
                      void (async () => {
                        setSaving(true);
                        setMessage(null);
                        const pipelineStage =
                          client.pipeline_stage === 'completed' ? 'completed' : 'projects';
                        const result = await saveSupervisionAsPdfAttachment({
                          client,
                          data,
                          company,
                          pipelineStage,
                        });
                        setData(result.data);
                        setSaving(false);
                        if (result.error) {
                          setMessage(
                            `تعذّر حفظ تقرير الإشراف — تم حفظ نسخة محلية: ${humanizeFetchError(result.error)}`
                          );
                          return;
                        }
                        setMessage(
                          result.snapshot
                            ? 'تم حفظ تقرير الإشراف وإصدار PDF ثابت كمرفق (دون حذف تقارير الزيارات).'
                            : `تم حفظ تقرير الإشراف.${result.warning ? ` ${result.warning}` : ''}`
                        );
                        requestAnimationFrame(() => onUpdated());
                      })();
                    }}
                  />
                  {(data.report_pdf_archive || []).length > 0 ? (
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <h4 className="text-sm font-bold text-gray-900 mb-2">
                        أرشيف تقارير PDF للمشروع ({data.report_pdf_archive!.length})
                      </h4>
                      <ul className="space-y-1.5">
                        {[...data.report_pdf_archive!]
                          .slice()
                          .reverse()
                          .slice(0, 40)
                          .map((snap) => (
                            <li
                              key={snap.id}
                              className="flex items-center justify-between gap-2 text-xs border-b border-gray-50 pb-1"
                            >
                              <span className="truncate">
                                <span className="font-semibold text-emerald-800">{snap.title_ar}</span>
                                {' — '}
                                {snap.fileName}
                              </span>
                              <button
                                type="button"
                                className="shrink-0 text-[#635bdb] font-semibold"
                                onClick={() => {
                                  void openReportPdfSnapshot(snap).catch((err) =>
                                    setMessage(
                                      err instanceof Error ? err.message : 'تعذر فتح المرفق'
                                    )
                                  );
                                }}
                              >
                                فتح PDF
                              </button>
                            </li>
                          ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}

              {activeStage === 'visits_supervision' && (
                <div className="space-y-4 rounded-xl border border-amber-100 bg-amber-50/40 p-4">
                  <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                    ملاحظات الموقع والتوصيات جزء من تقرير الزيارة والإشراف. لا تُفتح خطابات التسليم إلا بعد حل جميع الملاحظات الحرجة.
                  </div>
                  <StatusSelect
                    value={data.technical_notes.status}
                    onChange={(status) =>
                      patch({ technical_notes: { ...data.technical_notes, status } })
                    }
                  />
                  <Field
                    label="حالة المطابقة"
                    value={data.technical_notes.compliance_status || ''}
                    onChange={(v) =>
                      patch({ technical_notes: { ...data.technical_notes, compliance_status: v } })
                    }
                  />
                  <button
                    type="button"
                    className="px-3 py-2 rounded-xl border text-sm"
                    onClick={() => {
                      patch({
                        technical_notes: {
                          ...data.technical_notes,
                          deficiencies: [
                            ...(data.technical_notes.deficiencies || []),
                            {
                              id: `def-${Date.now()}`,
                              description: 'ملاحظة موقع جديدة',
                              severity: 'medium',
                              resolved: false,
                            },
                          ],
                        },
                      });
                    }}
                  >
                    + إضافة ملاحظة
                  </button>
                  <ul className="space-y-2">
                    {(data.technical_notes.deficiencies || []).map((d) => (
                      <li key={d.id} className="border rounded-xl p-3 text-sm space-y-2">
                        <input
                          className="w-full border rounded-lg px-2 py-1.5"
                          value={d.description}
                          onChange={(e) =>
                            patch({
                              technical_notes: {
                                ...data.technical_notes,
                                deficiencies: (data.technical_notes.deficiencies || []).map((x) =>
                                  x.id === d.id ? { ...x, description: e.target.value } : x
                                ),
                              },
                            })
                          }
                        />
                        <div className="flex flex-wrap gap-2 items-center">
                          <select
                            className="border rounded-lg px-2 py-1 text-xs"
                            value={d.severity}
                            onChange={(e) =>
                              patch({
                                technical_notes: {
                                  ...data.technical_notes,
                                  deficiencies: (data.technical_notes.deficiencies || []).map((x) =>
                                    x.id === d.id ? { ...x, severity: e.target.value } : x
                                  ),
                                },
                              })
                            }
                          >
                            <option value="low">منخفض</option>
                            <option value="medium">متوسط</option>
                            <option value="high">عالي</option>
                            <option value="critical">حرج / Critical</option>
                          </select>
                          <label className="text-xs">
                            <span className="mb-1 block text-gray-600">مصدر ملاحظة الزيارة</span>
                            <select
                              className="border rounded-lg px-2 py-1 text-xs"
                              value={d.source_visit_ref ? `${d.source_visit_ref.visit_number}:${d.source_visit_ref.observation_id}` : ''}
                              onChange={(e) => {
                                const [visitNumber, ...observationIdParts] = e.target.value.split(':');
                                const observationId = observationIdParts.join(':');
                                patch({
                                  technical_notes: {
                                    ...data.technical_notes,
                                    deficiencies: (data.technical_notes.deficiencies || []).map((x) =>
                                      x.id === d.id
                                        ? {
                                            ...x,
                                            source_visit_ref: e.target.value
                                              ? { visit_number: Number(visitNumber), observation_id: observationId }
                                              : null,
                                          }
                                        : x
                                    ),
                                  },
                                });
                              }}
                            >
                              <option value="">غير مرتبطة بزيارة</option>
                              {data.field_visits.flatMap((visit) =>
                                (visit.observations || []).map((observation, index) => (
                                  <option key={`${visit.visit_number}:${observation.id}`} value={`${visit.visit_number}:${observation.id}`}>
                                    زيارة #{visit.visit_number} · ملاحظة #{index + 1} — {observation.location || observation.description || 'بدون وصف'}
                                  </option>
                                ))
                              )}
                            </select>
                          </label>
                          <label className="inline-flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={!!d.resolved}
                              onChange={(e) =>
                                patch({
                                  technical_notes: {
                                    ...data.technical_notes,
                                    deficiencies: (data.technical_notes.deficiencies || []).map(
                                      (x) =>
                                        x.id === d.id ? { ...x, resolved: e.target.checked } : x
                                    ),
                                  },
                                })
                              }
                            />
                            تم الحل (Resolved)
                          </label>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <textarea
                    rows={3}
                    placeholder="توصيات"
                    value={data.technical_notes.recommendations || ''}
                    onChange={(e) =>
                      patch({
                        technical_notes: {
                          ...data.technical_notes,
                          recommendations: e.target.value,
                        },
                      })
                    }
                    className="w-full p-2.5 border rounded-xl text-sm"
                  />
                </div>
              )}

              {activeStage === 'transmittals' && (
                <div className="space-y-6">
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
                    يرث رقم الدراسة، المالك، المساحة، تصنيف الإشغال، ومرفقات المخططات/الحسابات من المراحل 1 و2 و4.
                  </div>
                  <ReadOnlyCorrespondenceWorkspace
                    key={`${client.id}-${client.primary_engineering_project_identity?.projectId || 'identity-unavailable'}-${stage6WorkspaceRevision}`}
                    client={client}
                    data={data}
                  />
                  <EngineeringDeliverySection
                    client={client}
                    data={data}
                    company={company}
                    saving={saving}
                    onChange={(engineering_delivery) => patch({ engineering_delivery })}
                    onSave={() =>
                      void saveStage6Document(
                        'engineering_delivery',
                        data.engineering_delivery,
                        'تم حفظ خطاب تسليم الدراسة.'
                      )
                    }
                  />
                  <CdCoverLetterSection
                    client={client}
                    data={data}
                    company={company}
                    saving={saving}
                    onChange={(cd_cover_letter) => patch({ cd_cover_letter })}
                    onSave={async (letter) =>
                      saveStage6Document(
                        'cd_cover_letter',
                        letter || data.cd_cover_letter,
                        'تم حفظ / إصدار خطاب تسليم الدفاع المدني.'
                      )
                    }
                  />
                </div>
              )}

              {activeStage === 'final_report' && (
                <FinalInspectionSection
                  client={client}
                  data={data}
                  company={company}
                  saving={saving}
                  onChange={(final_inspection) => patch({ final_inspection })}
                  onSave={() => save(data, 'تم حفظ التقرير النهائي.', { stayOpen: true })}
                />
              )}

              {activeStage === 'completion' && (
                <CompletionCertificateSection
                  client={client}
                  data={data}
                  company={company}
                  saving={saving}
                  onChange={(completion_certificate) => patch({ completion_certificate })}
                  onSave={(opts) => save(data, 'تم حفظ الشهادة.', { ...opts, stayOpen: true })}
                  onSaveAndPrint={async (cert) => {
                    const nextData = { ...data, completion_certificate: cert };
                    await save(nextData, 'تم إصدار رقم الشهادة تلقائياً.', {
                      issueCertificate: false,
                      stayOpen: true,
                    });
                    const { printCompletionCertificate } = await import(
                      '@/components/projects/CompletionCertificatePrint'
                    );
                    printCompletionCertificate(client, cert, company);
                  }}
                />
              )}

              <div className="sticky bottom-0 bg-white/95 border-t pt-3 mt-6 space-y-2">
                {blockers.length ? (
                  <p className="text-xs text-amber-800">لاعتماد المرحلة: {blockers.join(' · ')}</p>
                ) : advancingTechChapter ? (
                  <p className="text-xs text-emerald-800">
                    الباب الحالي: {techReportChapterTitle(techReportChapter)} — التالي:{' '}
                    {techReportChapterTitle(nextTechChapter)}
                  </p>
                ) : activeStage === 'technical_report' ? (
                  <p className="text-xs text-emerald-800">
                    اكتملت أبواب التقرير الفني — الاعتماد ينقل إلى قسم الزيارات والإشراف.
                  </p>
                ) : (
                  <p className="text-xs text-emerald-800">المرحلة جاهزة للاعتماد والانتقال.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      if (activeStage === 'transmittals') {
                        setMessage('استخدم زر «حفظ بيانات الخطاب» داخل كل نموذج؛ الحفظ في هذه المرحلة يمر عبر العقد الخادمي المخصص فقط.');
                        return;
                      }
                      if (activeStage === 'visits_supervision') {
                        void save(
                          data,
                          'تم حفظ الزيارات والإشراف وملاحظات الموقع. استخدم «حفظ الزيارة كـ PDF» لكل زيارة لإصدار مرفقها.',
                          { stayOpen: true, supervisionFocus: true }
                        );
                        return;
                      }
                      void save(data, 'تم حفظ بيانات المرحلة.', { stayOpen: true });
                    }}
                    className="px-4 py-2.5 rounded-xl border text-sm font-semibold disabled:opacity-50"
                  >
                    {saving ? 'جاري الحفظ...' : 'حفظ المرحلة'}
                  </button>
                  <button
                    type="button"
                    disabled={saving || blockers.length > 0}
                    onClick={() => void handleApproveAndProceed()}
                    className="px-4 py-2.5 rounded-xl bg-[#635bdb] text-white text-sm font-bold disabled:opacity-50"
                  >
                    {saving ? 'جاري الحفظ...' : approveButtonLabel}
                  </button>
                </div>
              </div>
            </div>

            {stagesOpen ? (
              <aside
                id="project-stages-drawer"
                className="w-56 shrink-0 order-2 rtl:order-1 border-s rtl:border-s-0 rtl:border-e border-gray-200 bg-gray-50 overflow-y-auto p-3"
                aria-label="أقسام المشروع"
              >
                <p className="text-sm font-bold text-gray-900 mb-3">أقسام المشروع</p>
                <WorkflowStageRail
                  client={client}
                  data={data}
                  activeStage={activeStage}
                  progressPercent={progress}
                  onSelect={selectStage}
                />
              </aside>
            ) : null}
          </div>
        </div>
  );

  return (
    <>
      {isPage ? (
        panel
      ) : (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          {panel}
        </div>
      )}

      <InvoicePromptModal
        open={invoicePromptOpen}
        message="تم اعتماد المرحلة. هل تريد استعراض وإصدار الفاتورة الضريبية المعتمدة؟"
        invoice={promptInvoice}
        loading={invoiceBusy}
        onClose={() => {
          setInvoicePromptOpen(false);
          setPromptInvoice(null);
          setPendingInvoiceEvent(null);
        }}
        onIssue={() => {
          void (async () => {
            setInvoiceBusy(true);
            const result =
              pendingInvoiceEvent && pendingInvoiceEvent !== 'manual'
                ? await generateInvoiceForEngineeringEvent(client, pendingInvoiceEvent)
                : await generateTaxInvoiceFromMilestone({
                    clientId: client.id,
                    triggerSource: 'manual',
                  });
            setInvoiceBusy(false);
            if (!result.ok || !result.invoice) {
              setMessage(result.error || result.messages.join(' — ') || 'تعذر إصدار الفاتورة');
              return;
            }
            setPromptInvoice(result.invoice);
            setMessage(result.messages.join(' — '));
          })();
        }}
        onPreview={() => {
          if (promptInvoice) void printTaxInvoice(promptInvoice);
        }}
        onDownload={() => {
          if (promptInvoice) void downloadTaxInvoice(promptInvoice);
        }}
        onWhatsApp={() => {
          if (promptInvoice) void shareTaxInvoiceWhatsApp(promptInvoice, client.phone);
        }}
      />
    </>
  );
}

function StatusSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: (typeof REPORT_STATUSES)[number]) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as (typeof REPORT_STATUSES)[number])}
      className="p-2 border rounded-lg text-sm bg-white w-full"
    >
      {REPORT_STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full p-2.5 border rounded-xl text-sm"
      />
    </div>
  );
}
