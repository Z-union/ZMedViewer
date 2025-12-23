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
  state?: MgTaskState; // <-- важно: храним ready/pending
  ready_at?: number;
};

type PredictAsyncResponse = {
  download_filename: string;
  report_path: string;
};

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

// ----- persistence (LOCALSTORAGE) -----
const STORAGE_KEY = 'mgToolsTasks_v2'; // новый ключ
const LEGACY_SESSION_KEY = 'mgProcessingTasks'; // старый sessionStorage ключ (если был)

const mgRegistry: Record<string, MgTask> = {};

function safeParseJSON<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function hydrateRegistry(): void {
  if (typeof window === 'undefined') return;

  // 1) Основной источник: localStorage
  const fromLocal = safeParseJSON<Record<string, MgTask>>(window.localStorage.getItem(STORAGE_KEY));
  if (fromLocal) {
    Object.entries(fromLocal).forEach(([sid, task]) => {
      if (task?.download_filename && task?.report_path) {
        mgRegistry[sid] = {
          ...task,
          state: task.state ?? 'pending',
        };
      }
    });
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
        };
      }
    });
    persistRegistry();
    window.sessionStorage.removeItem(LEGACY_SESSION_KEY);
  }
}

function persistRegistry(): void {
  if (typeof window === 'undefined') return;

  try {
    const plain: Record<string, MgTask> = {};
    Object.entries(mgRegistry).forEach(([sid, task]) => {
      if (task?.download_filename && task?.report_path) {
        plain[sid] = {
          download_filename: task.download_filename,
          report_path: task.report_path,
          created_at: task.created_at,
          state: task.state ?? 'pending',
          ready_at: task.ready_at,
        };
      }
    });

    if (Object.keys(plain).length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plain));
    }
  } catch {
    // ignore
  }
}

function buildGetFileUrl(base: string, task: MgTask): string {
  const b = base.replace(/\/$/, '');
  const params = new URLSearchParams();
  params.set('download_filename', task.download_filename);
  params.set('report_path', task.report_path);
  return `${b}/get_file?${params.toString()}`;
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
  const headUnsupportedRef = useRef<boolean>(false);
  const cachedBlobRef = useRef<Blob | null>(null);

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

  // 3) React to studyId changes
  useEffect(() => {
    setErr('');
    cachedBlobRef.current = null;
    clearPoll();

    if (!studyId) {
      setUi('idle');
      setReportReady(false);
      setTask(null);
      return;
    }

    const existing = mgRegistry[studyId];
    if (existing?.download_filename && existing?.report_path) {
      setTask(existing);

      // ФИЧА: если ранее уже определили готовность — сразу активируем Download (без повторного анализа)
      if (existing.state === 'ready') {
        setReportReady(true);
        setUi('done');

        // можно тихо перепроверять в фоне, но пользователь просил без повторного анализа — не мешаем
        return;
      }

      setReportReady(false);
      setUi('polling');
      pollUntilReady(studyId, existing);
      return;
    }

    setUi('idle');
    setReportReady(false);
    setTask(null);

    return () => {
      clearPoll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId]);

  const statusText = useMemo(() => {
    if (ui === 'polling') return t('Processing in progress') || 'Processing in progress...';
    if (reportReady) return t('Report is ready') || 'Report is ready';
    if (ui === 'idle') return t('Preparing for analysis') || 'Preparing for analysis...';
    if (ui === 'error') return t('Error') || 'Error';
    return '';
  }, [ui, reportReady, t]);

  const markReady = (sid: string) => {
    const cur = mgRegistry[sid];
    if (!cur) return;
    mgRegistry[sid] = { ...cur, state: 'ready', ready_at: Date.now() };
    persistRegistry();
  };

  const markPending = (sid: string) => {
    const cur = mgRegistry[sid];
    if (!cur) return;
    mgRegistry[sid] = { ...cur, state: 'pending' };
    persistRegistry();
  };

  const pollUntilReady = (sid: string, currentTask: MgTask) => {
    clearPoll();
    cachedBlobRef.current = null;

    let attempt = 0;

    const tick = async () => {
      attempt += 1;
      const delay = attempt <= 30 ? 2000 : 5000;

      try {
        const url = buildGetFileUrl(BASE, currentTask);

        // Prefer HEAD (cheap)
        if (!headUnsupportedRef.current) {
          const headResp = await axios.request({
            method: 'HEAD',
            url,
            validateStatus: s => s === 200 || s === 404 || s === 405,
          });

          if (headResp.status === 200) {
            if (!mountedRef.current) return;
            markReady(sid); // <-- записываем ready в localStorage
            setReportReady(true);
            setUi('done');
            return;
          }

          if (headResp.status === 405) {
            headUnsupportedRef.current = true;
          }
          // 404 => not ready yet
        }

        // Fallback: GET (if HEAD unsupported)
        if (headUnsupportedRef.current) {
          const getResp = await axios.get(url, {
            responseType: 'blob',
            validateStatus: s => s === 200 || s === 404,
          });

          if (getResp.status === 200) {
            cachedBlobRef.current = getResp.data as Blob;
            if (!mountedRef.current) return;
            markReady(sid); // <-- записываем ready в localStorage
            setReportReady(true);
            setUi('done');
            return;
          }
        }
      } catch {
        // transient network errors -> keep polling
      }

      pollTimerRef.current = window.setTimeout(tick, delay);
    };

    pollTimerRef.current = window.setTimeout(tick, 1000);
  };

  const handleAnalyze = async () => {
    if (!studyId) return;

    // Если уже есть задача: если ready — просто активируем download; если pending — продолжаем polling
    const existing = mgRegistry[studyId];
    if (existing?.download_filename && existing?.report_path) {
      setTask(existing);

      if (existing.state === 'ready') {
        setReportReady(true);
        setUi('done');
        return;
      }

      setUi('polling');
      setReportReady(false);
      pollUntilReady(studyId, existing);
      return;
    }

    setUi('loading');
    setErr('');
    setReportReady(false);
    cachedBlobRef.current = null;

    const controller = new AbortController();

    try {
      const url = `${BASE.replace(/\/$/, '')}/predict_async`;

      const resp = await axios.post<PredictAsyncResponse>(
        url,
        { study_instance_uid: studyId },
        { headers: { 'Content-Type': 'application/json' }, signal: controller.signal }
      );

      const nextTask: MgTask = {
        download_filename: resp.data.download_filename,
        report_path: resp.data.report_path,
        created_at: Date.now(),
        state: 'pending',
      };

      mgRegistry[studyId] = nextTask;
      persistRegistry();

      setTask(nextTask);
      setUi('polling');
      pollUntilReady(studyId, nextTask);
    } catch (e: any) {
      const msg = String(e?.message || 'Request failed');
      setErr(msg);
      setUi('error');
      showNotif('Processing error', msg);

      delete mgRegistry[studyId];
      persistRegistry();
    }
  };

  const handleDownload = async () => {
    if (!studyId || !task) return;

    setUi('loading');
    setErr('');

    const controller = new AbortController();

    try {
      let blob: Blob | null = cachedBlobRef.current;

      const filenameFallback = task.download_filename || `mammography_report_${studyId}.docx`;
      let filename = filenameFallback;

      if (!blob) {
        const url = buildGetFileUrl(BASE, task);

        const resp = await axios.get(url, {
          responseType: 'blob',
          signal: controller.signal,
          validateStatus: s => s === 200 || s === 404,
        });

        // Даже если было ready в localStorage, файл могли почистить на бэке.
        // В таком случае не принуждаем к повторному анализу: просто возвращаемся в polling.
        if (resp.status === 404) {
          markPending(studyId);
          setUi('polling');
          setReportReady(false);
          pollUntilReady(studyId, task);
          return;
        }

        blob = resp.data as Blob;
        filename = parseFilenameFromHeaders(resp.headers, filenameFallback);
      }

      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);

      // после успешной загрузки очищаем
      delete mgRegistry[studyId];
      persistRegistry();

      setTask(null);
      setReportReady(false);
      setUi('done');

      forceUpdateSeriesData({ extensionManager, StudyInstanceUID: studyId });
    } catch (e: any) {
      const msg = String(e?.message || 'Download failed');
      setErr(msg);
      setUi('error');
      showNotif('Download error', msg);
    }
  };

  const isBusy = ui === 'loading' || ui === 'polling';
  const canAnalyze = !!studyId && !!BASE;
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
              disabled={!canAnalyze || isBusy}
              onClick={handleAnalyze}
            >
              {isBusy ? <Spinner /> : <span>{t('Analyze') || 'Analyze'}</span>}
            </Button>

            <Button
              size="initial"
              className="px-2 py-2 text-base"
              variant="outlined"
              disabled={!canDownload}
              onClick={handleDownload}
            >
              {t('Download report') || 'Download report'}
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
