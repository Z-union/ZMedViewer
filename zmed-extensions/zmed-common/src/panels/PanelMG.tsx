// PanelMG.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Button, Icon } from '@ohif/ui';
import { useTranslation } from 'react-i18next';
import { useAppConfig } from '@state';
import { forceUpdateSeriesData } from './utils';

type UIState = 'idle' | 'loading' | 'polling' | 'done' | 'error';

type MgTaskState = 'pending' | 'ready';

type MgTask = {
  download_filename: string;
  report_path: string;
  created_at?: number;
  state?: MgTaskState; // ready/pending
  ready_at?: number;
  // report_path, который /status возвращал до запуска новой обработки
  baseline_report_path?: string | null;
  // новый путь, который вернул /predict_async
  expected_report_path?: string | null;
};

type PredictAsyncResponse = {
  download_filename: string;
  report_path: string;
};

type StatusResponse = {
  report_path: string | null;
  step: string;
};

type ReportFormat = 'docx' | 'html';

type PanelMGProps = {
  servicesManager: { services: any };
  extensionManager: any;
};

function Spinner() {
  return <div className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />;
}

// Надёжное извлечение UID (MG-first)
function getStudyUID(DisplaySetService: any): string | null {
  try {
    const sets = DisplaySetService?.getActiveDisplaySets?.() || [];
    const mg = sets.find((ds: any) => String(ds?.Modality || ds?.modality).toUpperCase() === 'MG');

    return (
      mg?.StudyInstanceUID ??
      DisplaySetService?.activeDisplaySets?.[0]?.StudyInstanceUID ??
      sets?.[0]?.StudyInstanceUID ??
      null
    );
  } catch {
    return null;
  }
}

// persistence (LOCALSTORAGE)
const STORAGE_KEY = 'mgToolsTasks_v2';
const LEGACY_SESSION_KEY = 'mgProcessingTasks';

// ТАЙМАУТ ОЖИДАНИЯ ГОТОВНОСТИ ТАСКИ
const TASK_TIMEOUT_MS = 600_000;
const STATUS_POLL_INTERVAL_MS = 5_000;

const mgRegistry: Record<string, MgTask> = {};

function safeParseJSON<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function persistRegistry(): void {
  if (typeof window === 'undefined') return;

  try {
    const pendingTasks: Record<string, MgTask> = {};

    Object.entries(mgRegistry).forEach(([sid, task]) => {
      // localStorage нужен только для незавершённой обработки.
      if (
        task?.state === 'pending' &&
        task.download_filename &&
        task.report_path
      ) {
        pendingTasks[sid] = task;
      }
    });

    if (Object.keys(pendingTasks).length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pendingTasks));
  } catch {
    // Потеря persistence не должна ломать саму панель.
  }
}

function hydrateRegistry(): void {
  if (typeof window === 'undefined') return;

  // 1) Основной источник: localStorage
  const fromLocal = safeParseJSON<Record<string, MgTask>>(window.localStorage.getItem(STORAGE_KEY));
  if (fromLocal) {
    let changed = false;

    Object.entries(fromLocal).forEach(([sid, task]) => {
      if (!task?.download_filename || !task?.report_path) {
        changed = true;
        return;
      }

      // Старые ready-записи больше не восстанавливаем: актуальный путь
      // всегда загружается с бэкенда через /status.
      if (task.state === 'ready') {
        changed = true;
        return;
      }

      const createdAt = task.created_at ?? 0;

      if (createdAt && Date.now() - createdAt > TASK_TIMEOUT_MS) {
        changed = true;
        return;
      }

      mgRegistry[sid] = {
        ...task,
        created_at: createdAt || Date.now(),
        state: 'pending',
        expected_report_path: task.expected_report_path ?? task.report_path,
        baseline_report_path: task.baseline_report_path ?? null,
      };
    });

    // если что-то выкинули как протухшее — перезапишем localStorage
    if (changed) persistRegistry();

    return;
  }

  // 2) Миграция: если раньше было в sessionStorage — перенесём в localStorage
  const fromSessionLegacy = safeParseJSON<Record<string, MgTask>>(
    window.sessionStorage.getItem(LEGACY_SESSION_KEY)
  );
  if (fromSessionLegacy) {
    Object.entries(fromSessionLegacy).forEach(([sid, task]) => {
      if (task?.download_filename && task?.report_path) {
        mgRegistry[sid] = {
          download_filename: task.download_filename,
          report_path: task.report_path,
          created_at: task.created_at ?? Date.now(),
          state: 'pending',
          baseline_report_path: null,
          expected_report_path: task.report_path,
        };
      }
    });
    persistRegistry();
    window.sessionStorage.removeItem(LEGACY_SESSION_KEY);
  }
}

function buildGetFileUrl(base: string, task: MgTask): string {
  const b = base.replace(/\/$/, '');
  const params = new URLSearchParams();
  params.set('download_filename', task.download_filename);
  params.set('report_path', task.report_path);
  return `${b}/get_file?${params.toString()}`;
}

function replaceFileExtension(value: string, extension: ReportFormat): string {
  return /\.[^./\\]+$/.test(value)
    ? value.replace(/\.[^./\\]+$/, `.${extension}`)
    : `${value}.${extension}`;
}

function buildTaskFromStatus(studyId: string, reportPath: string, existing?: MgTask): MgTask {
  return {
    download_filename:
      existing?.download_filename || `mammography_report_${studyId}.docx`,
    report_path: replaceFileExtension(reportPath, 'docx'),
    created_at: existing?.created_at ?? Date.now(),
    state: 'ready',
    ready_at: Date.now(),
    baseline_report_path: null,
    expected_report_path: null,
  };
}

function isPendingTaskReady(task: MgTask, statusReportPath: string | null): boolean {
  if (!statusReportPath) return false;

  // Основной сценарий: /predict_async сразу сообщил точный будущий путь.
  if (task.expected_report_path) {
    return statusReportPath === task.expected_report_path;
  }

  // Fallback для старых записей localStorage без expected_report_path.
  return statusReportPath !== (task.baseline_report_path ?? null);
}

function buildTaskForFormat(task: MgTask, format: ReportFormat): MgTask {
  return {
    ...task,
    download_filename: replaceFileExtension(task.download_filename, format),
    report_path: replaceFileExtension(task.report_path, format),
  };
}

function parseFilenameFromHeaders(headers: any, fallback: string): string {
  const disp = headers?.['content-disposition'];
  if (!disp) return fallback;
  const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i.exec(disp);
  if (m?.[1]) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }
  return fallback;
}

export default function PanelMG({ servicesManager, extensionManager }: PanelMGProps) {
  const [appConfig] = useAppConfig();
  const { t } = useTranslation('SidePanel');
  const { uiNotificationService, DisplaySetService } = servicesManager.services;

  const BASE: string = String(appConfig?.zmedtools?.mgURL ?? '');

  // фикс бага первого открытия: DisplaySetService может отдать пусто на первом рендере
  const [studyId, setStudyId] = useState<string | null>(null);

  const [ui, setUi] = useState<UIState>('idle');
  const [err, setErr] = useState<string>('');
  const [task, setTask] = useState<MgTask | null>(null);
  const [reportReady, setReportReady] = useState<boolean>(false);

  const mountedRef = useRef(true);
  const pollTimerRef = useRef<number | null>(null);

  const clearPoll = () => {
    if (pollTimerRef.current != null) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const showNotif = (titleKey: string, message: string) => {
    uiNotificationService?.show({
      title: t(titleKey) || titleKey,
      message,
      type: 'error',
    });
  };

  // 1) Hydrate registry once
  useEffect(() => {
    hydrateRegistry();
  }, []);

  // 2) Keep studyId updated
  useEffect(() => {
    mountedRef.current = true;

    const tick = () => {
      const uid = getStudyUID(DisplaySetService);
      setStudyId(prev => (uid && uid !== prev ? uid : prev));
    };

    tick();
    const interval = window.setInterval(tick, 750);

    return () => {
      mountedRef.current = false;
      window.clearInterval(interval);
    };
  }, [DisplaySetService]);

  // 3) При открытии исследования проверяем статус на бэкенде.
  // report_path из /status — единственный источник готовности отчёта.
  useEffect(() => {
    let cancelled = false;

    setErr('');
    clearPoll();

    if (!studyId || !BASE) {
      setUi('idle');
      setReportReady(false);
      setTask(null);
      return;
    }

    const loadStatus = async () => {
      setUi('loading');
      setReportReady(false);

      const existing = mgRegistry[studyId];

      try {
        const url = `${BASE.replace(/\/$/, '')}/status/${encodeURIComponent(studyId)}`;
        const resp = await axios.get<StatusResponse>(url, {
          validateStatus: status => [200, 400, 404, 500].includes(status),
        });

        if (cancelled || !mountedRef.current) return;

        const statusReportPath =
          resp.status === 200 ? resp.data?.report_path ?? null : null;

        // Pending из localStorage имеет приоритет над старым report_path из /status.
        // Лоадер снимаем только когда статус переключился на новый ожидаемый путь.
        if (existing?.state === 'pending') {
          setTask(existing);
          setReportReady(false);

          if (isPendingTaskReady(existing, statusReportPath)) {
            const readyTask = buildTaskFromStatus(
              studyId,
              statusReportPath as string,
              existing
            );

            delete mgRegistry[studyId];
            persistRegistry();

            setTask(readyTask);
            setReportReady(true);
            setUi('done');
            return;
          }

          setUi('polling');
          pollUntilReady(studyId, existing);
          return;
        }

        // Активной фронтовой задачи нет: сохраняем последний готовый путь из /status.
        if (statusReportPath) {
          const readyTask = buildTaskFromStatus(studyId, statusReportPath, existing);

          // Готовый путь держим только в React state. При следующем открытии
          // исследования он снова будет получен через /status.
          delete mgRegistry[studyId];
          persistRegistry();

          setTask(readyTask);
          setReportReady(true);
          setUi('done');
          return;
        }

        // Готового отчёта нет: доступен только запуск анализа.
        delete mgRegistry[studyId];
        persistRegistry();

        setTask(null);
        setReportReady(false);
        setUi('idle');
      } catch {
        if (cancelled || !mountedRef.current) return;

        // При временной ошибке сети не теряем pending-задачу из localStorage.
        if (existing?.state === 'pending') {
          setTask(existing);
          setReportReady(false);
          setUi('polling');
          pollUntilReady(studyId, existing);
          return;
        }

        // Если активной задачи нет, не блокируем новый анализ.
        setTask(null);
        setReportReady(false);
        setUi('idle');
      }
    };

    void loadStatus();

    return () => {
      cancelled = true;
      clearPoll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId, BASE]);

  const statusText = useMemo(() => {
    if (ui === 'polling') return t('Processing in progress') || 'Processing in progress...';
    if (ui === 'loading') return t('Checking status') || 'Checking status...';
    if (reportReady) return t('Report is ready') || 'Report is ready';
    if (ui === 'idle') return t('Preparing for analysis') || 'Preparing for analysis...';
    if (ui === 'error') return t('Error') || 'Error';
    return '';
  }, [ui, reportReady, t]);

  const pollUntilReady = (sid: string, currentTask: MgTask) => {
    clearPoll();

    const tick = async () => {
      const createdAt = currentTask.created_at ?? mgRegistry[sid]?.created_at ?? 0;
      if (createdAt && Date.now() - createdAt > TASK_TIMEOUT_MS) {
        clearPoll();

        delete mgRegistry[sid];
        persistRegistry();

        if (!mountedRef.current) return;

        setTask(null);
        setReportReady(false);
        setErr(`Таймаут (${TASK_TIMEOUT_MS} мс)`);
        setUi('error');
        showNotif('Processing error', `Таймаут (${Math.round(TASK_TIMEOUT_MS / 1000)} с)`);
        return;
      }

      try {
        const url = `${BASE.replace(/\/$/, '')}/status/${encodeURIComponent(sid)}`;
        const resp = await axios.get<StatusResponse>(url, {
          validateStatus: status => [200, 400, 404, 500].includes(status),
        });

        const statusReportPath =
          resp.status === 200 ? resp.data?.report_path ?? null : null;

        if (isPendingTaskReady(currentTask, statusReportPath)) {
          const readyTask = buildTaskFromStatus(
            sid,
            statusReportPath as string,
            currentTask
          );

          // Новая обработка завершена — pending-запись больше не нужна.
          delete mgRegistry[sid];
          persistRegistry();

          if (!mountedRef.current) return;

          setTask(readyTask);
          setReportReady(true);
          setUi('done');
          return;
        }

        if (resp.status === 400) {
          clearPoll();

          delete mgRegistry[sid];
          persistRegistry();

          if (!mountedRef.current) return;

          setTask(null);
          setReportReady(false);
          setErr('Ошибка обработки исследования');
          setUi('error');
          showNotif('Processing error', 'Ошибка обработки исследования');
          return;
        }
      } catch {
        // Временная сетевая ошибка: продолжаем polling до общего таймаута.
      }

      pollTimerRef.current = window.setTimeout(tick, STATUS_POLL_INTERVAL_MS);
    };

    pollTimerRef.current = window.setTimeout(tick, STATUS_POLL_INTERVAL_MS);
  };

  const handleAnalyze = async () => {
    if (!studyId) return;

    const existing = mgRegistry[studyId];
    const previousReadyTask = reportReady ? task : null;

    // Уже запущенную обработку повторно не создаём — продолжаем polling.
    // Готовый отчёт не блокирует повторный запуск анализа.
    if (
      existing?.download_filename &&
      existing?.report_path &&
      existing.state !== 'ready'
    ) {
      setTask(existing);
      setUi('polling');
      setReportReady(false);
      pollUntilReady(studyId, existing);
      return;
    }

    setUi('loading');
    setErr('');
    setReportReady(false);

    const controller = new AbortController();

    try {
      const url = `${BASE.replace(/\/$/, '')}/predict_async`;

      const resp = await axios.post<PredictAsyncResponse>(
        url,
        { study_instance_uid: studyId },
        { headers: { 'Content-Type': 'application/json' }, signal: controller.signal }
      );

      const baselineReportPath = previousReadyTask?.report_path ?? null;

      const nextTask: MgTask = {
        download_filename: resp.data.download_filename,
        report_path: resp.data.report_path,
        created_at: Date.now(), // база для таймаута в localStorage
        state: 'pending',
        baseline_report_path: baselineReportPath,
        expected_report_path: resp.data.report_path,
      };

      mgRegistry[studyId] = nextTask;
      persistRegistry();

        setTask(nextTask);
      setUi('polling');
      pollUntilReady(studyId, nextTask);
    } catch (e: any) {
      const msg = String(e?.message || 'Request failed');
      setErr(msg);
      showNotif('Processing error', msg);

      // Если повторный анализ не стартовал, сохраняем доступ к старому готовому отчёту.
      if (previousReadyTask) {
        setTask(previousReadyTask);
        setReportReady(true);
        setUi('done');
        return;
      }

      setUi('error');
      delete mgRegistry[studyId];
      persistRegistry();
    }
  };

  const handleDownload = async (format: ReportFormat) => {
    if (!studyId || !task || !reportReady) return;

    setUi('loading');
    setErr('');

    const controller = new AbortController();

    try {
      // Актуальный report_path уже хранится в React state:
      // - загружается через /status при открытии исследования;
      // - обновляется polling после завершения нового анализа.
      const formatTask = buildTaskForFormat(task, format);
      const url = buildGetFileUrl(BASE, formatTask);

      const resp = await axios.get(url, {
        responseType: 'blob',
        signal: controller.signal,
        validateStatus: status => status === 200 || status === 404,
      });

      if (resp.status === 404) {
        const message =
          format === 'html' ? 'HTML-отчёт не найден' : 'DOCX-отчёт не найден';

        setErr(message);
        setUi('error');
        showNotif('Download error', message);
        return;
      }

      const blob = resp.data as Blob;
      const filename = parseFilenameFromHeaders(
        resp.headers,
        formatTask.download_filename
      );

      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);

      // task/reportReady не сбрасываем — обе кнопки остаются активными.
      setUi('done');

      if (format === 'docx') {
        forceUpdateSeriesData({ extensionManager, StudyInstanceUID: studyId });
      }
    } catch (e: any) {
      const msg = String(e?.message || 'Download failed');
      setErr(msg);
      setUi('error');
      showNotif('Download error', msg);
    }
  };

  const isBusy = ui === 'loading' || ui === 'polling';
  const canAnalyze = !!studyId && !!BASE && !isBusy;
  const canDownload = !!task && reportReady && !isBusy;

  return (
    <div className="flex h-full min-h-0 flex-col px-3 pt-3 pb-1 text-white">
      <div className="mb-3 rounded-lg border border-primary-light/30 bg-black/40 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-black/30">
        <div className="sticky top-0 z-10 -mx-3 -mt-3 px-3 pt-3 pb-2 bg-black/60 backdrop-blur supports-[backdrop-filter]:bg-black/30">
          <div className="flex flex-col gap-2">
            <Button
              startIcon={!isBusy ? <Icon className="!h-[12px] !w-[12px] text-black" name="sparkles" /> : undefined}
              size="initial"
              className="px-2 py-2 text-base !bg-orange-600 hover:!bg-orange-500"
              color="primaryActive"
              variant="outlined"
              disabled={!canAnalyze}
              onClick={handleAnalyze}
            >
              {isBusy && !reportReady ? <Spinner /> : <span>{t('Analyze') || 'Analyze'}</span>}
            </Button>

            <Button
              size="initial"
              className="px-2 py-2 text-base"
              variant="outlined"
              disabled={!canDownload}
              onClick={() => handleDownload('docx')}
            >
              {t('Download DOCX') || 'Download DOCX'}
            </Button>

            <Button
              size="initial"
              className="px-2 py-2 text-base"
              variant="outlined"
              disabled={!canDownload}
              onClick={() => handleDownload('html')}
            >
              {t('Download HTML') || 'Download HTML'}
            </Button>
          </div>

          <div className="sm:justify-self-end text-sm text-primary-light mt-2">
            {(t('Task status') || 'Status')}: <span className="text-white">{statusText || '—'}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <div className="relative h-full border border-primary-light/30 rounded p-3 overflow-y-auto overflow-x-hidden custom-scroll flex flex-col gap-3">
          <div className="text-lg text-primary-light">{t('Mammography') || 'Mammography'}</div>

          {ui === 'polling' && (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-stretch gap-3 w-full">
                <div className="flex justify-center">
                  <div className="loading">
                    <div className="infinite-loading-bar bg-primary-light" />
                  </div>
                </div>
                <div className="text-lg leading-snug text-white break-words text-center">
                  {t('Processing in progress') || 'Processing in progress...'}
                </div>
              </div>
            </div>
          )}

          {ui === 'error' && <div className="text-xs text-red-400">{err || (t('Error') || 'Error')}</div>}

          {ui !== 'polling' && ui !== 'error' && (
            <div className="text-base text-primary-light">
              {reportReady
                ? t('Report is ready. Click download.') || 'Report is ready. Click download.'
                : t('Report will be available after analysis') || 'Report will be available after analysis'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
