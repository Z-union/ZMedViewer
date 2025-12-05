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

type ZeroOne = 0 | 1;

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

  hernia_detected?: boolean | null;
  hernia_volume_mm3?: number | string | null;
  hernia_max_protrusion_mm?: number | string | null;

  spondy_detected?: boolean | null;
  spondy_displacement_mm?: number | string | null;
  spondy_displacement_percentage?: number | string | null;
  spondy_grade?: number | string | null;
}

interface BackendPipelineResult {
  results?: string;
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
  Pfirrmann: number | string | null;
  Modic: 0 | 1 | 2 | 3 | null;
  bulging: ZeroOne | null;
  narrowing: ZeroOne | null;
  herniation: ZeroOne | null;
  spondylolisthesis: ZeroOne | null;
}

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

interface ProcessingInfo {
  taskId: string;
  progress?: BackendProcessingStatus | null;
}

// Глобальный реестр текущих задач обработки по studyId
const processingRegistry: Record<string, ProcessingInfo> = {};
const PROCESSING_STORAGE_KEY = 'mrProcessingTasks';

// Кэш предпросмотра по studyId (в памяти)
const previewCache: Record<
  string,
  {
    rows: Row[];
    processedAt: string | null;
    reportAvailable: boolean;
    reportPath: string | null;
  }
> = {};

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

  const mapPipelineToRows = (pipeline?: BackendPipelineResult): Row[] => {
    if (!pipeline) return [];

    if (pipeline.disk_results) {
      const asZO = (v: number | null | undefined): ZeroOne | null =>
        v === 0 ? 0 : v === 1 ? 1 : null;

      return Object.entries(pipeline.disk_results).map(([diskKey, disk]) => {
        const predictions = disk.predictions || {};

        const level_name =
          (disk.level_name && String(disk.level_name)) || toHumanDiskLabel(diskKey, diskMap);

        const pfRaw = predictions.Pfirrmann_grade;
        let Pfirrmann: number | string | null = pfRaw ?? null;
        if (Pfirrmann !== null && Pfirrmann !== undefined) {
          const n = Number(Pfirrmann);
          if (!Number.isNaN(n)) Pfirrmann = n === 0 ? 1 : n;
        } else {
          Pfirrmann = null;
        }

        const nModic =
          predictions.Modic !== undefined && predictions.Modic !== null
            ? Number(predictions.Modic)
            : NaN;
        const Modic: 0 | 1 | 2 | 3 | null =
          Number.isNaN(nModic) || nModic < 0 || nModic > 3 ? null : (nModic as 0 | 1 | 2 | 3);

        return {
          level_name,
          Pfirrmann,
          Modic,
          bulging: asZO(predictions.Disc_bulging),
          narrowing: asZO(predictions.Disc_narrowing),
          herniation: asZO(predictions.Disc_herniation),
          spondylolisthesis: asZO(predictions.Spondylolisthesis),
        };
      });
    }

    // Фоллбек на старый формат через results (строка JSON-массива)
    if (pipeline.results) {
      try {
        const arr = JSON.parse(pipeline.results) as BackendDiskItem[];
        return arr.map((item): Row => {
          const level_name =
            (item.level_name && String(item.level_name)) ||
            toHumanDiskLabel(
              typeof item.disk_label === 'number' || typeof item.disk_label === 'string'
                ? item.disk_label
                : null,
              diskMap
            );

          const pfRaw = flattenFirst<number | string>(item['Pfirrmann'], null);
          let Pfirrmann: number | string | null = pfRaw;
          if (pfRaw !== null) {
            const n = Number(pfRaw);
            if (!Number.isNaN(n)) Pfirrmann = n === 0 ? 1 : n;
          }

          const modicRaw = flattenFirst<number>(item.Modic ?? null, null);
          const nModic = modicRaw != null ? Number(modicRaw) : NaN;
          const Modic: 0 | 1 | 2 | 3 | null =
            Number.isNaN(nModic) || nModic < 0 || nModic > 3 ? null : (nModic as 0 | 1 | 2 | 3);

          const bulging = flattenFirst<number>(item['Disc bulging'], null);
          const narrowing = flattenFirst<number>(item['Disc narrowing'], null);
          const herniation = flattenFirst<number>(item['Disc herniation'], null);
          const spondy = flattenFirst<number>(item['Spondylolisthesis'], null);

          const asZO = (v: number | null): ZeroOne | null =>
            v === 0 ? 0 : v === 1 ? 1 : null;

          return {
            level_name,
            Pfirrmann,
            Modic,
            bulging: asZO(typeof bulging === 'number' ? bulging : null),
            narrowing: asZO(typeof narrowing === 'number' ? narrowing : null),
            herniation: asZO(typeof herniation === 'number' ? herniation : null),
            spondylolisthesis: asZO(typeof spondy === 'number' ? spondy : null),
          };
        });
      } catch {
        return [];
      }
    }

    return [];
  };

  // Унифицированный опрос /processing-status/{taskId}
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
          // Завершили обработку
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
              // на всякий случай даём скачать по taskId
              setReportAvailable(true);
              setReportPath(`/report/${taskId}`);
            }
          } catch {
            // если статус не удалось получить – хотя бы включаем скачивание по taskId
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
        // игнорируем, попробуем ещё раз
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

    // Поднимаем активные задачи из sessionStorage (после обновления страницы)
    hydrateProcessingRegistryFromStorage();

    const existing = processingRegistry[studyId];

    // Если для этого исследования уже идёт обработка — сразу восстанавливаем лоадер и опрос
    if (existing?.taskId) {
      setProcessingId(existing.taskId);
      setUi('polling');
      if (existing.progress) {
        setProgress(existing.progress);
      } else {
        // дефолтный текст, пока не прилетит первый статус
        setProgress({
          step_label: t('Processing in progress'),
        });
      }
      startPolling(existing.taskId);

      return () => {
        clearPollTimer();
      };
    }

    // Пытаемся взять предпросмотр из кэша (без дополнительного ожидания)
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

        // Если бэк по /status уже отдаёт прогресс незавершённой задачи — показываем лоадер и продолжаем опрос
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

    // сразу показываем человекопонятный статус через i18n
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

  const handleDownload = async (): Promise<void> => {
    const pid = processingId;
    const path = reportPath?.startsWith('/report/')
      ? reportPath
      : pid
      ? `/report/${pid}`
      : null;

    if (!path) return;

    setUi('loading');
    setErr('');

    const controller = new AbortController();

    try {
      const resp = await axios.get(`${BASE.replace(/\/$/, '')}${path}`, {
        responseType: 'blob',
        headers: {
          accept: 'application/json',
        },
        signal: controller.signal,
      });

      let filename = String(processingId || 'report');

      const disp = (resp.headers as Record<string, string | undefined>)[
        'content-disposition'
      ];
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

  const Chip = ({ label, value }: { label: string; value: ZeroOne | number | string | null }) => {
    const on = value === 1 || value === t('1');
    const off = value === 0 || value === t('0');

    const base =
      'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1';

    const cls = on
      ? `${base} bg-emerald-500/10 text-emerald-300 ring-emerald-400/30`
      : off
      ? `${base} bg-primary-main text-primary-light ring-white/5`
      : `${base} bg-yellow-500/10 text-yellow-200 ring-yellow-400/30`;

    const dotCls =
      'mr-1 block h-1.5 w-1.5 rounded-full ' +
      (on ? 'bg-emerald-400' : off ? 'bg-white/40' : 'bg-yellow-300');

    return (
      <span className={cls} title={`${label}: ${String(value ?? '-')}`}>
        <span className={dotCls} />
        {label}: {String(value ?? '-')}
      </span>
    );
  };

  const Card = ({ row }: { row: Row }) => (
    <li className="rounded-lg border border-white/10 bg-white/[0.07] p-3 hover:bg-white/[0.05] transition-colors">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-white">
          {t('Disk')}: {row.level_name}
        </div>

        <div className="flex items-center gap-2">
          <Badge>
            {t('Pfirrmann grade')} {row.Pfirrmann ?? '-'}
          </Badge>
          <Badge>
            {t('Modic')} {row.Modic ?? '-'}
          </Badge>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <Chip
          label={t('Disc herniation')}
          value={row.herniation == 1 ? t('1') : t('0')}
        />
        <Chip
          label={t('Disc bulging')}
          value={row.bulging == 1 ? t('1') : t('0')}
        />
        <Chip
          label={t('Disc narrowing')}
          value={row.narrowing == 1 ? t('1') : t('0')}
        />
        <Chip
          label={t('Spondylolisthesis')}
          value={row.spondylolisthesis == 1 ? t('1') : t('0')}
        />
      </div>
    </li>
  );

const renderProgressStatus = () => {
  const hasSteps =
    typeof progress?.current_step === 'number' &&
    typeof progress?.total_steps === 'number' &&
    (progress.total_steps ?? 0) > 0;

  const label =
    progress?.step_label ||
    (hasSteps ? '' : t('Processing in progress'));

  if (!hasSteps && !label) return null;

  return (
    <div className="mt-1 w-full px-1">
      {label && (
        <div className="text-lg leading-snug text-white break-words text-center">
          {label}
        </div>
      )}
    </div>
  );
};

const hasSteps =
  typeof progress?.current_step === 'number' &&
  typeof progress?.total_steps === 'number' &&
  (progress.total_steps ?? 0) > 0;

const totalVisible =
  typeof progress?.total_steps === 'number'
    ? progress.total_steps - 1
    : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col px-3 pt-3 pb-1 text-white">
      <div className="mb-3 rounded-lg border border-primary-light/30 bg-black/40 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-black/30">
        <div className="sticky top-0 z-10 -mx-3 -mt-3 px-3 pt-3 pb-2 bg-black/60 backdrop-blur supports-[backdrop-filter]:bg-black/30">
          <div className="flex flex-col gap-2">
            <Button
              startIcon={
                <Icon
                  className="!h-[12px] !w-[12px] text-black"
                  name="sparkles"
                />
              }
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
              onClick={handleDownload}
            >
              {t('Download report')}
            </Button>
          </div>

          <div className="sm:justify-self-end text-sm text-primary-light mt-2">
            {t('Last processed')}: <span className="text-white">{lastProcessed}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <div
          ref={previewRef}
          className="relative h-full border border-primary-light/30 rounded p-3 overflow-y-auto overflow-x-hidden custom-scroll flex flex-col gap-3"
        >
          <div className="text-lg text-primary-light">{t('Preview results')}</div>

          {isBusy && (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-stretch gap-3 w-full">
                {hasSteps && totalVisible !== undefined && (
                  <div className="text-lg font-mono text-primary-light text-center">
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
