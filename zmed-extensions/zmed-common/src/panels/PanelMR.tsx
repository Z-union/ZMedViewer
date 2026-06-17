// PanelMR.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Button, Icon } from '@ohif/ui';
import { useTranslation } from 'react-i18next';
import './PanelMR.css';
import { useAppConfig } from '@state';
import { forceUpdateSeriesData } from './utils';

const MR = ['MR'] as const;

type UIState = 'idle' | 'loading' | 'polling' | 'done' | 'unsupported' | 'error';
type ReportFormat = 'docx' | 'html';

type I18nValueKey =
  | 'Yes'
  | 'No'
  | 'No data'
  | 'No changes'
  | 'Contour change'
  | 'Modic I'
  | 'Modic II'
  | 'Modic I/II'
  | 'Pfirrmann I–II'
  | 'Pfirrmann III'
  | 'Pfirrmann IV'
  | 'Pfirrmann V'
  | 'Diffuse bulging'
  | 'Protrusion'
  | 'Extrusion'
  | 'Central'
  | 'Subarticular'
  | 'Foraminal'
  | 'High'
  | 'Medium'
  | 'Low';

interface DisplaySet {
  Modality?: string;
  StudyInstanceUID?: string;
}

interface DisplaySetServiceLike {
  getActiveDisplaySets?: () => DisplaySet[];
  activeDisplaySets?: DisplaySet[];
}

interface Services {
  DisplaySetService?: DisplaySetServiceLike;
}

interface ServicesManager {
  services: Services;
}

interface PanelMRProps {
  servicesManager: ServicesManager;
  extensionManager: unknown;
}

interface BackendDiskItem {
  disk_label?: number | string | null;
  level_name?: string | null;

  Modic?: number | number[] | null;
  ['UP endplate']?: number[][] | null;
  ['LOW endplate']?: number[][] | null;
  Spondylolisthesis?: number[][] | null;
  ['Disc herniation']?: number[][] | null;
  ['Disc narrowing']?: number[][] | null;
  ['Disc bulging']?: number[][] | null;
  ['Pfirrmann']?: Array<number | string> | null;
}

interface NewBackendDiscResult {
  pfirrmann?: number | null;
  narrowing?: number | null;
  bulge_type?: number | null;
  bulge_location?: number | null;
  canal_stenosis?: number | null;
  migration?: number | null;
  resorption?: number | null;
  spondylolisthesis?: number | null;
}

interface NewBackendVertebraResult {
  upper_modic?: number | null;
  lower_modic?: number | null;
  upper_contour?: number | null;
  lower_contour?: number | null;
}

interface NewBackendResultsPayload {
  discs?: Record<string, NewBackendDiscResult>;
  vertebrae?: Record<string, NewBackendVertebraResult>;
  bulge_seg_available?: boolean;
}

interface BackendPipelineResult {
  results?: string;
  result_json?: string;
  disk_results?: {
    [diskKey: string]: {
      predictions?: {
        Modic?: number | null;
        Pfirrmann_grade?: number | null;
        Disc_herniation?: number | null;
        Disc_bulging?: number | null;
        Disc_narrowing?: number | null;
        Spondylolisthesis?: number | null;
        UP_endplate?: number | null;
        LOW_endplate?: number | null;
      };
      level_name?: string | null;
    };
  };
}

interface BackendStatusResponse {
  status?: string;
  study_id?: string;
  processing_id?: string | null;
  report_available?: boolean;
  report_download_url?: string | null;
  processed_at?: string | null;
  detail?: string;
  current_step?: number;
  step_label?: string;
  total_steps?: number;
  pipeline_result?: BackendPipelineResult;
}

interface BackendProcessingStatus {
  current_step?: number;
  step_label?: string;
  total_steps?: number;
}

interface Row {
  level_name: string;
  Pfirrmann: I18nValueKey | null;
  Modic: I18nValueKey | null;
  contour: I18nValueKey | null;

  narrowing: I18nValueKey | null;
  bulgeType: I18nValueKey | null;
  bulgeLocation: I18nValueKey | null;
  canalStenosis: I18nValueKey | null;
  migration: I18nValueKey | null;
  resorption: I18nValueKey | null;
  spondylolisthesis: I18nValueKey | null;
}

interface ProcessingInfo {
  taskId: string;
  progress?: BackendProcessingStatus | null;
}

const PFIRRMANN_MAP: Record<number, I18nValueKey> = {
  0: 'Pfirrmann I–II',
  1: 'Pfirrmann III',
  2: 'Pfirrmann IV',
  3: 'Pfirrmann V',
};

const BULGE_TYPE_MAP: Record<number, I18nValueKey> = {
  0: 'No',
  1: 'Diffuse bulging',
  2: 'Protrusion',
  3: 'Extrusion',
};

const BULGE_LOC_MAP: Record<number, I18nValueKey> = {
  0: 'No',
  1: 'Central',
  2: 'Subarticular',
  3: 'Foraminal',
};

const MODIC_MAP: Record<number, I18nValueKey> = {
  0: 'No',
  1: 'Modic I',
  2: 'Modic II',
};

const MODIC_MAP_BINARY: Record<number, I18nValueKey> = {
  0: 'No',
  1: 'Modic I/II',
};

const CONTOUR_MAP: Record<number, I18nValueKey> = {
  0: 'No changes',
  1: 'Contour change',
};

const RESORPTION_MAP: Record<number, I18nValueKey> = {
  [-1]: 'No data',
  0: 'High',
  1: 'Medium',
  2: 'Low',
};

const YES_NO: Record<number, I18nValueKey> = {
  0: 'No',
  1: 'Yes',
};

const POSITIVE_KEYS = new Set<I18nValueKey>([
  'Yes',
  'Modic I',
  'Modic II',
  'Modic I/II',
  'Pfirrmann III',
  'Pfirrmann IV',
  'Pfirrmann V',
  'Diffuse bulging',
  'Protrusion',
  'Extrusion',
  'Central',
  'Subarticular',
  'Foraminal',
  'Contour change',
]);

const NEGATIVE_KEYS = new Set<I18nValueKey>(['No', 'No changes', 'Pfirrmann I–II']);

const processingRegistry: Record<string, ProcessingInfo> = {};
const PROCESSING_STORAGE_KEY = 'mrProcessingTasks';

const REPORT_FORMAT_CONFIG: Record<ReportFormat, { accept: string; extension: string }> = {
  docx: {
    accept: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extension: 'docx',
  },
  html: {
    accept: 'text/html',
    extension: 'html',
  },
};

const previewCache: Record<
  string,
  {
    rows: Row[];
    processedAt: string | null;
    reportAvailable: boolean;
    reportPath: string | null;
  }
> = {};

function flattenFirst<T>(v: unknown, def: T | null = null): T | null {
  if (Array.isArray(v)) {
    const a = (v as unknown[])[0] as unknown;
    if (Array.isArray(a)) return ((((a as unknown[])[0]) ?? def) as T) ?? def;
    return ((a ?? def) as T) ?? def;
  }
  return ((v ?? def) as T) ?? def;
}

function formatRuDate(value?: string | number | Date | null): string {
  if (!value) return '—';
  try {
    if (typeof value === 'string' && /^\d{8}$/.test(value)) {
      const y = value.slice(0, 4);
      const m = value.slice(4, 6);
      const d = value.slice(6, 8);
      return `${d}.${m}.${y}`;
    }

    const dt = new Date(value);
    if (Number.isNaN(+dt)) return '—';
    return dt.toLocaleDateString('ru-RU');
  } catch {
    return '—';
  }
}

function toHumanDiskLabel(raw: number | string | null, map?: Record<string, string>): string {
  if (raw == null) return '-';
  const key = String(raw);
  if (map && map[key]) return map[key];
  return `#${key}`;
}

function hydrateProcessingRegistryFromStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.sessionStorage.getItem(PROCESSING_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, ProcessingInfo>;
    Object.entries(parsed).forEach(([sid, info]) => {
      if (info && typeof info.taskId === 'string') {
        processingRegistry[sid] = {
          taskId: info.taskId,
          progress: info.progress ?? null,
        };
      }
    });
  } catch {
    // ignore
  }
}

function persistProcessingRegistryToStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const plain: Record<string, ProcessingInfo> = {};
    Object.entries(processingRegistry).forEach(([sid, value]) => {
      if (value?.taskId) {
        plain[sid] = {
          taskId: value.taskId,
          progress: value.progress ?? null,
        };
      }
    });

    if (Object.keys(plain).length === 0) {
      window.sessionStorage.removeItem(PROCESSING_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(PROCESSING_STORAGE_KEY, JSON.stringify(plain));
    }
  } catch {
    // ignore
  }
}

export default function PanelMR({ servicesManager, extensionManager }: PanelMRProps) {
  const [appConfig] = useAppConfig();

  const BASE: string = String(appConfig.zmedtools.mrURL ?? '');
  const PERSONAL: string = String(appConfig.zmedtools.personalURL ?? '');

  const diskMap: Record<string, string> | undefined = appConfig?.zmedtools?.diskLabelMap as
    | Record<string, string>
    | undefined;

  const { t } = useTranslation('SidePanel');
  const { DisplaySetService } = servicesManager.services;

  const displaySet = useMemo<DisplaySet | undefined>(() => {
    const sets = DisplaySetService?.getActiveDisplaySets?.() || [];
    return sets.find(ds => ds && ds.Modality && MR.includes(ds.Modality));
  }, [DisplaySetService]);

  const studyId: string | null =
    DisplaySetService?.activeDisplaySets?.[0]?.StudyInstanceUID ??
    displaySet?.StudyInstanceUID ??
    null;

  if (!studyId) {
    return <div className="px-3 py-4 text-primary-light">{t('MR study not selected')}</div>;
  }

  return (
    <PanelMRInner
      key={studyId}
      studyId={studyId}
      t={t}
      BASE={BASE}
      PERSONAL={PERSONAL}
      diskMap={diskMap}
      extensionManager={extensionManager}
    />
  );
}

function PanelMRInner({
  studyId,
  t,
  BASE,
  PERSONAL,
  diskMap,
  extensionManager,
}: {
  studyId: string;
  t: (k: string) => string;
  BASE: string;
  PERSONAL: string;
  diskMap?: Record<string, string>;
  extensionManager: unknown;
}) {
  const [ui, setUi] = useState<UIState>('idle');
  const [err, setErr] = useState<string>('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processedAt, setProcessedAt] = useState<string | null>(null);
  const [reportAvailable, setReportAvailable] = useState<boolean>(false);
  const [reportPath, setReportPath] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [progress, setProgress] = useState<BackendProcessingStatus | null>(null);

  const previewRef = useRef<HTMLDivElement | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  const clearPollTimer = (): void => {
    if (pollTimerRef.current != null) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const parseJsonString = <T,>(value?: string | null): T | null => {
    if (!value || typeof value !== 'string') return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  };

  const mapByDict = (
    value: unknown,
    dict: Record<number, I18nValueKey>,
    fallback: I18nValueKey | null = null
  ): I18nValueKey | null => {
    if (value === null || value === undefined) return fallback;
    const n = Number(value);
    if (Number.isNaN(n)) return fallback;
    return dict[n] ?? fallback;
  };

  const mapYesNo = (value: unknown): I18nValueKey | null => mapByDict(value, YES_NO, null);

  const normalizePfirrmannLabel = (value: unknown): I18nValueKey | null => {
    if (value === null || value === undefined) return null;
    const n = Number(value);
    if (Number.isNaN(n)) return null;
    return PFIRRMANN_MAP[n] ?? null;
  };

  const getDiscOrderWeight = (level: string): number => {
    const order = ['Th12L1', 'L1L2', 'L2L3', 'L3L4', 'L4L5', 'L5S1'];
    const idx = order.indexOf(level);
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
  };

  const getDiscVertebraNames = (
    levelName: string
  ): { upperName: string | null; lowerName: string | null } => {
    const match = /^([A-Za-z0-9]+)(L\d|S\d)$/.exec(levelName);
    if (!match) {
      return { upperName: null, lowerName: null };
    }

    return {
      upperName: match[1] || null,
      lowerName: match[2] || null,
    };
  };

  const getMaxMappedLabelForDisc = (
    levelName: string,
    vertebrae: Record<string, NewBackendVertebraResult> | undefined,
    extractor: (v: NewBackendVertebraResult | undefined, side: 'upper' | 'lower') => number | null | undefined,
    dict: Record<number, I18nValueKey>,
    fallbackDict?: Record<number, I18nValueKey>
  ): I18nValueKey | null => {
    if (!vertebrae) return null;

    const { upperName, lowerName } = getDiscVertebraNames(levelName);
    if (!upperName || !lowerName) return null;

    const upper = vertebrae[upperName];
    const lower = vertebrae[lowerName];

    const raw = [extractor(upper, 'lower'), extractor(lower, 'upper')]
      .map(v => (v == null ? NaN : Number(v)))
      .filter(v => !Number.isNaN(v));

    if (raw.length === 0) return null;

    const maxValue = Math.max(...raw);

    if (Object.prototype.hasOwnProperty.call(dict, maxValue)) {
      return dict[maxValue];
    }

    if (fallbackDict && Object.prototype.hasOwnProperty.call(fallbackDict, maxValue)) {
      return fallbackDict[maxValue];
    }

    return null;
  };

  const getModicLabelForDisc = (
    levelName: string,
    vertebrae?: Record<string, NewBackendVertebraResult>
  ): I18nValueKey | null => {
    return getMaxMappedLabelForDisc(
      levelName,
      vertebrae,
      (v, side) => (side === 'upper' ? v?.upper_modic : v?.lower_modic),
      MODIC_MAP,
      MODIC_MAP_BINARY
    );
  };

  const getContourLabelForDisc = (
    levelName: string,
    vertebrae?: Record<string, NewBackendVertebraResult>
  ): I18nValueKey | null => {
    return getMaxMappedLabelForDisc(
      levelName,
      vertebrae,
      (v, side) => (side === 'upper' ? v?.upper_contour : v?.lower_contour),
      CONTOUR_MAP
    );
  };

  const mapNewResultsToRows = (payload: NewBackendResultsPayload): Row[] => {
    const discs = payload.discs || {};
    const vertebrae = payload.vertebrae || {};

    return Object.entries(discs)
      .sort(([a], [b]) => getDiscOrderWeight(a) - getDiscOrderWeight(b))
      .map(([level_name, disc]): Row => ({
        level_name,
        Pfirrmann: normalizePfirrmannLabel(disc.pfirrmann),
        Modic: getModicLabelForDisc(level_name, vertebrae),
        contour: getContourLabelForDisc(level_name, vertebrae),

        narrowing: mapYesNo(disc.narrowing),
        bulgeType: mapByDict(disc.bulge_type, BULGE_TYPE_MAP, null),
        bulgeLocation: mapByDict(disc.bulge_location, BULGE_LOC_MAP, null),
        canalStenosis: mapYesNo(disc.canal_stenosis),
        migration: mapYesNo(disc.migration),
        resorption: mapByDict(
          disc.resorption === null || disc.resorption === undefined ? -1 : disc.resorption,
          RESORPTION_MAP,
          null
        ),
        spondylolisthesis: mapYesNo(disc.spondylolisthesis),
      }));
  };

  const mapPipelineToRows = (pipeline?: BackendPipelineResult): Row[] => {
    if (!pipeline) return [];

    const newFormat =
      parseJsonString<NewBackendResultsPayload>(pipeline.results) ??
      parseJsonString<NewBackendResultsPayload>(pipeline.result_json);

    if (newFormat?.discs) {
      return mapNewResultsToRows(newFormat);
    }

    if (pipeline.disk_results && Object.keys(pipeline.disk_results).length > 0) {
      return Object.entries(pipeline.disk_results).map(([diskKey, disk]) => {
        const predictions = disk.predictions || {};

        const level_name =
          (disk.level_name && String(disk.level_name)) || toHumanDiskLabel(diskKey, diskMap);

        const modicValue =
          predictions.Modic !== undefined && predictions.Modic !== null
            ? Number(predictions.Modic)
            : NaN;

        const contourValue =
          predictions.UP_endplate !== undefined && predictions.UP_endplate !== null
            ? Number(predictions.UP_endplate)
            : predictions.LOW_endplate !== undefined && predictions.LOW_endplate !== null
              ? Number(predictions.LOW_endplate)
              : NaN;

        return {
          level_name,
          Pfirrmann: normalizePfirrmannLabel(predictions.Pfirrmann_grade),
          Modic:
            Number.isNaN(modicValue) || modicValue < 0
              ? null
              : MODIC_MAP[modicValue] ?? MODIC_MAP_BINARY[modicValue] ?? null,
          contour:
            Number.isNaN(contourValue) || contourValue < 0
              ? null
              : CONTOUR_MAP[contourValue] ?? null,

          narrowing: mapYesNo(predictions.Disc_narrowing),
          bulgeType:
            predictions.Disc_herniation === 1
              ? 'Yes'
              : predictions.Disc_bulging === 1
                ? 'Yes'
                : predictions.Disc_herniation === 0 && predictions.Disc_bulging === 0
                  ? 'No'
                  : null,
          bulgeLocation: null,
          canalStenosis: null,
          migration: null,
          resorption: null,
          spondylolisthesis: mapYesNo(predictions.Spondylolisthesis),
        };
      });
    }

    if (pipeline.results) {
      try {
        const parsed = JSON.parse(pipeline.results) as unknown;

        if (Array.isArray(parsed)) {
          return (parsed as BackendDiskItem[]).map((item): Row => {
            const level_name =
              (item.level_name && String(item.level_name)) ||
              toHumanDiskLabel(
                typeof item.disk_label === 'number' || typeof item.disk_label === 'string'
                  ? item.disk_label
                  : null,
                diskMap
              );

            const pfRaw = flattenFirst<number | string>(item['Pfirrmann'], null);

            const modicRaw = flattenFirst<number>(item.Modic ?? null, null);
            const nModic = modicRaw != null ? Number(modicRaw) : NaN;

            const upContour = flattenFirst<number>(item['UP endplate'], null);
            const lowContour = flattenFirst<number>(item['LOW endplate'], null);
            const contourRaw = [upContour, lowContour]
              .map(v => (v == null ? NaN : Number(v)))
              .filter(v => !Number.isNaN(v));
            const maxContour = contourRaw.length ? Math.max(...contourRaw) : NaN;

            const bulging = flattenFirst<number>(item['Disc bulging'], null);
            const narrowing = flattenFirst<number>(item['Disc narrowing'], null);
            const herniation = flattenFirst<number>(item['Disc herniation'], null);
            const spondy = flattenFirst<number>(item['Spondylolisthesis'], null);

            return {
              level_name,
              Pfirrmann: normalizePfirrmannLabel(pfRaw),
              Modic:
                Number.isNaN(nModic) || nModic < 0
                  ? null
                  : MODIC_MAP[nModic] ?? MODIC_MAP_BINARY[nModic] ?? null,
              contour:
                Number.isNaN(maxContour) || maxContour < 0 ? null : CONTOUR_MAP[maxContour] ?? null,

              narrowing: mapYesNo(narrowing),
              bulgeType:
                herniation === 1 ? 'Yes' : bulging === 1 ? 'Yes' : herniation === 0 && bulging === 0 ? 'No' : null,
              bulgeLocation: null,
              canalStenosis: null,
              migration: null,
              resorption: null,
              spondylolisthesis: mapYesNo(spondy),
            };
          });
        }
      } catch {
        return [];
      }
    }

    return [];
  };

  function startPolling(taskId: string): void {
    const delay = 1000;

    const checkStatus = async () => {
      try {
        const resp = await axios.get<BackendProcessingStatus>(
          `${BASE.replace(/\/$/, '')}/processing-status/${encodeURIComponent(taskId)}`,
          {
            headers: {
              accept: 'application/json',
            },
          }
        );

        const { current_step, step_label, total_steps } = resp.data || {};
        const newProgress: BackendProcessingStatus = {
          current_step,
          step_label,
          total_steps,
        };

        setProgress(prev => ({
          ...prev,
          ...newProgress,
        }));

        if (processingRegistry[studyId]) {
          processingRegistry[studyId] = {
            taskId,
            progress: {
              ...(processingRegistry[studyId].progress || {}),
              ...newProgress,
            },
          };
          persistProcessingRegistryToStorage();
        }

        if (
          typeof current_step === 'number' &&
          typeof total_steps === 'number' &&
          total_steps > 0 &&
          current_step >= total_steps
        ) {
          clearPollTimer();
          setUi('loading');

          try {
            const statusResp = await axios.get<BackendStatusResponse>(
              `${BASE}status/${encodeURIComponent(studyId)}`,
              {
                headers: {
                  accept: 'application/json',
                },
                validateStatus: s => (s >= 200 && s < 300) || s === 404,
              }
            );

            if (statusResp.status !== 404) {
              const data = statusResp.data;

              setProcessingId(data.processing_id ?? taskId);

              const processedAtValue = data.processed_at ?? null;
              setProcessedAt(processedAtValue);

              const reportAvailableValue = Boolean(data.report_available);
              setReportAvailable(reportAvailableValue);

              const reportPathValue = data.report_download_url ?? `/report/${taskId}`;
              setReportPath(reportPathValue);

              const nextRows = mapPipelineToRows(data.pipeline_result);
              setRows(nextRows);

              previewCache[studyId] = {
                rows: nextRows,
                processedAt: processedAtValue,
                reportAvailable: reportAvailableValue,
                reportPath: reportPathValue,
              };
            } else {
              setReportAvailable(true);
              setReportPath(`/report/${taskId}`);
            }
          } catch {
            setReportAvailable(true);
            setReportPath(`/report/${taskId}`);
          }

          delete processingRegistry[studyId];
          persistProcessingRegistryToStorage();

          setUi('done');
          setProgress(null);

          forceUpdateSeriesData({
            extensionManager,
            StudyInstanceUID: studyId,
          });

          return;
        }
      } catch {
        // ignore
      }

      pollTimerRef.current = window.setTimeout(checkStatus, delay);
    };

    pollTimerRef.current = window.setTimeout(checkStatus, delay);
  }

  useEffect(() => {
    clearPollTimer();

    setErr('');
    setProcessingId(null);
    setProcessedAt(null);
    setReportAvailable(false);
    setReportPath(null);
    setRows([]);
    setProgress(null);

    hydrateProcessingRegistryFromStorage();

    const existing = processingRegistry[studyId];

    if (existing?.taskId) {
      setProcessingId(existing.taskId);
      setUi('polling');

      if (existing.progress) {
        setProgress(existing.progress);
      } else {
        setProgress({
          step_label: t('Processing in progress'),
        });
      }

      startPolling(existing.taskId);

      return () => {
        clearPollTimer();
      };
    }

    const cached = previewCache[studyId];
    if (cached) {
      setRows(cached.rows);
      setProcessedAt(cached.processedAt);
      setReportAvailable(cached.reportAvailable);
      setReportPath(cached.reportPath);
      setUi('done');
    }

    const controller = new AbortController();

    if (!cached) {
      setUi('loading');
    }

    (async () => {
      try {
        const resp = await axios.get<BackendStatusResponse>(
          `${BASE}status/${encodeURIComponent(studyId)}`,
          {
            headers: {
              accept: 'application/json',
            },
            signal: controller.signal,
            validateStatus: s => (s >= 200 && s < 300) || s === 404,
          }
        );

        if (resp.status === 404) {
          setRows([]);
          delete previewCache[studyId];
          setUi('idle');
          return;
        }

        const data = resp.data;

        setProcessingId(data.processing_id ?? null);

        const processedAtValue = data.processed_at ?? null;
        setProcessedAt(processedAtValue);

        const reportAvailableValue = Boolean(data.report_available);
        setReportAvailable(reportAvailableValue);

        const reportPathValue = data.report_download_url ?? null;
        setReportPath(reportPathValue);

        if (
          typeof data.current_step === 'number' &&
          typeof data.total_steps === 'number' &&
          data.total_steps > 0 &&
          data.current_step < data.total_steps &&
          data.processing_id
        ) {
          const initialProgress: BackendProcessingStatus = {
            current_step: data.current_step,
            step_label: data.step_label,
            total_steps: data.total_steps,
          };

          setProgress(initialProgress);

          processingRegistry[studyId] = {
            taskId: data.processing_id,
            progress: initialProgress,
          };
          persistProcessingRegistryToStorage();

          setUi('polling');
          startPolling(data.processing_id);
          return;
        }

        const nextRows = mapPipelineToRows(data.pipeline_result);
        setRows(nextRows);

        previewCache[studyId] = {
          rows: nextRows,
          processedAt: processedAtValue,
          reportAvailable: reportAvailableValue,
          reportPath: reportPathValue,
        };

        setUi('done');
      } catch {
        setUi(prev => (prev === 'done' ? 'done' : 'idle'));
      }
    })();

    return () => {
      controller.abort();
      clearPollTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId]);

  const handleProcess = async (): Promise<void> => {
    setUi('loading');
    setErr('');
    clearPollTimer();

    const initialProgress: BackendProcessingStatus = {
      step_label: t('Preparing for analysis'),
    };
    setProgress(initialProgress);

    const controller = new AbortController();

    try {
      const payload = {
        dcm_study_uid: studyId,
      };

      const { data } = await axios.post<string>(
        `${PERSONAL.replace(/\/$/, '')}/api/tasks/post_mri/`,
        payload,
        {
          headers: {
            accept: 'application/json',
          },
          signal: controller.signal,
        }
      );

      const taskId = String(data).trim();

      setProcessingId(taskId);
      setReportAvailable(false);
      setReportPath(null);

      processingRegistry[studyId] = {
        taskId,
        progress: initialProgress,
      };
      persistProcessingRegistryToStorage();

      setUi('polling');
      startPolling(taskId);
    } catch {
      setErr(t('Processing error'));
      setUi('error');
      setProgress(null);
    }
  };

  const getReportUrl = (format: ReportFormat, includeFormat = true): string | null => {
    const pid = processingId;
    const source = reportPath?.trim() || (pid ? `/report/${pid}` : null);

    if (!source) return null;

    const normalizedPath = source.startsWith('/') || /^https?:\/\//i.test(source)
      ? source
      : `/${source}`;
    const pathWithoutFormat = normalizedPath.replace(/\.(docx|html)(?=([?#]|$))/i, '');
    const path = includeFormat
      ? pathWithoutFormat.replace(/([?#].*)?$/, `.${format}$1`)
      : pathWithoutFormat;

    if (/^https?:\/\//i.test(path)) {
      return path;
    }

    return `${BASE.replace(/\/$/, '')}${path}`;
  };

  const handleDownload = async (format: ReportFormat): Promise<void> => {
    const requestUrl = getReportUrl(format);

    if (!requestUrl) return;

    setUi('loading');
    setErr('');

    const controller = new AbortController();
    const config = REPORT_FORMAT_CONFIG[format];

    try {
      let resp: { data: Blob; headers: Record<string, string | undefined> } | null = null;

      try {
        resp = await axios.get(requestUrl, {
          responseType: 'blob',
          headers: {
            accept: config.accept,
          },
          signal: controller.signal,
        });
      } catch (error) {
        const fallbackUrl = format === 'docx' ? getReportUrl(format, false) : null;

        if (!fallbackUrl || fallbackUrl === requestUrl) {
          throw error;
        }

        resp = await axios.get(fallbackUrl, {
          responseType: 'blob',
          headers: {
            accept: config.accept,
          },
          signal: controller.signal,
        });
      }

      if (!resp) {
        throw new Error('Download error');
      }

      let filename = `${String(processingId || 'report')}.${config.extension}`;

      const disp = resp.headers['content-disposition'];
      if (disp) {
        const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i.exec(disp);
        if (m && m[1]) filename = decodeURIComponent(m[1]);
      }

      const url = window.URL.createObjectURL(resp.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setUi('done');
    } catch {
      setErr(t('Download error'));
      setUi('error');
    }
  };

  const lastProcessed = formatRuDate(processedAt);
  const isBusy = ui === 'loading' || ui === 'polling';

  const Badge = ({ children }: { children: React.ReactNode }) => (
    <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs text-white">{children}</span>
  );

  const Chip = ({ label, value }: { label: string; value: I18nValueKey | string | number | null }) => {
    const valueKey = typeof value === 'string' ? value : value == null ? null : String(value);
    const translated = valueKey == null ? '-' : t(valueKey);

    const isPositive = valueKey != null && POSITIVE_KEYS.has(valueKey as I18nValueKey);
    const isNegative = valueKey != null && NEGATIVE_KEYS.has(valueKey as I18nValueKey);

    const base =
      'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1';

    const cls = isPositive
      ? `${base} bg-emerald-500/10 text-emerald-300 ring-emerald-400/30`
      : isNegative
        ? `${base} bg-primary-main text-primary-light ring-white/5`
        : `${base} bg-yellow-500/10 text-yellow-200 ring-yellow-400/30`;

    const dotCls =
      'mr-1 block h-1.5 w-1.5 rounded-full ' +
      (isPositive ? 'bg-emerald-400' : isNegative ? 'bg-white/40' : 'bg-yellow-300');

    return (
      <span className={cls} title={`${label}: ${translated}`}>
        <span className={dotCls} />
        {label}: {translated}
      </span>
    );
  };

  const Card = ({ row }: { row: Row }) => (
    <li className="rounded-lg border border-white/10 bg-white/[0.07] p-3 transition-colors hover:bg-white/[0.05]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-white">
          {t('Disk')}: {row.level_name}
        </div>

        <div className="flex items-center gap-2">
          <Badge>
            {t('Pfirrmann grade')} {row.Pfirrmann ? t(row.Pfirrmann) : '-'}
          </Badge>
          <Badge>
            {t('Modic')} {row.Modic ? t(row.Modic) : '-'}
          </Badge>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <Chip label={t('Disc narrowing')} value={row.narrowing} />
        <Chip label={t('Bulge type')} value={row.bulgeType} />
        <Chip label={t('Bulge location')} value={row.bulgeLocation} />
        <Chip label={t('Canal stenosis')} value={row.canalStenosis} />
        <Chip label={t('Migration')} value={row.migration} />
        <Chip label={t('Resorption')} value={row.resorption} />
        <Chip label={t('Spondylolisthesis')} value={row.spondylolisthesis} />
        <Chip label={t('Contour')} value={row.contour} />
      </div>
    </li>
  );

  const renderProgressStatus = () => {
    const hasSteps =
      typeof progress?.current_step === 'number' &&
      typeof progress?.total_steps === 'number' &&
      (progress.total_steps ?? 0) > 0;

    const label = t(progress?.step_label) || (hasSteps ? '' : t('Processing in progress'));

    if (!hasSteps && !label) return null;

    return (
      <div className="mt-1 w-full px-1">
        {label && (
          <div className="break-words text-center text-lg leading-snug text-white">{label}</div>
        )}
      </div>
    );
  };

  const hasSteps =
    typeof progress?.current_step === 'number' &&
    typeof progress?.total_steps === 'number' &&
    (progress.total_steps ?? 0) > 0;

  const totalVisible =
    typeof progress?.total_steps === 'number' ? progress.total_steps : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col px-3 pb-1 pt-3 text-white">
      <div className="mb-3 rounded-lg border border-primary-light/30 bg-black/40 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-black/30">
        <div className="sticky top-0 z-10 -mx-3 -mt-3 bg-black/60 px-3 pb-2 pt-3 backdrop-blur supports-[backdrop-filter]:bg-black/30">
          <div className="flex flex-col gap-2">
            <Button
              startIcon={<Icon className="!h-[12px] !w-[12px] text-black" name="sparkles" />}
              size="initial"
              className="px-2 py-2 text-base !bg-orange-600 hover:!bg-orange-500"
              color="primaryActive"
              variant="outlined"
              disabled={isBusy}
              onClick={handleProcess}
            >
              {t('Analyze')}
            </Button>

            <Button
              size="initial"
              className="px-2 py-2 text-base"
              variant="outlined"
              disabled={!reportAvailable || isBusy}
              onClick={() => handleDownload('docx')}
            >
              {t('Download DOCX')}
            </Button>

            <Button
              size="initial"
              className="px-2 py-2 text-base"
              variant="outlined"
              disabled={!reportAvailable || isBusy}
              onClick={() => handleDownload('html')}
            >
              {t('Download HTML')}
            </Button>
          </div>

          <div className="mt-2 text-sm text-primary-light sm:justify-self-end">
            {t('Last processed')}: <span className="text-white">{lastProcessed}</span>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <div
          ref={previewRef}
          className="custom-scroll relative flex h-full flex-col gap-3 overflow-y-auto overflow-x-hidden rounded border border-primary-light/30 p-3"
        >
          <div className="text-lg text-primary-light">{t('Preview results')}</div>

          {isBusy && (
            <div className="flex flex-1 items-center justify-center">
              <div className="flex w-full flex-col items-stretch gap-3">
                {hasSteps && totalVisible !== undefined && (
                  <div className="text-center font-mono text-lg text-primary-light">
                    {progress?.current_step} / {totalVisible}
                  </div>
                )}

                <div className="flex justify-center">
                  <div className="loading">
                    <div className="infinite-loading-bar bg-primary-light" />
                  </div>
                </div>

                {renderProgressStatus()}
              </div>
            </div>
          )}

          {!isBusy && ui === 'error' && (
            <div className="text-xs text-red-400">{err || t('Error')}</div>
          )}

          {!isBusy && rows.length === 0 && ui !== 'error' && (
            <div className="text-base text-primary-light">
              {t('Data preview will be available after re-analysis')}
            </div>
          )}

          {!isBusy && rows.length > 0 && (
            <ul className="flex flex-col gap-3">
              {rows.map((r, i) => (
                <Card key={`${r.level_name}-${i}`} row={r} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
