// PanelMR.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Button } from '@ohif/ui';
import { useTranslation } from 'react-i18next';
import './PanelMR.css';

const BASE = 'https://zview.z-union.ru/mrtools/';
const MR = ['MR'];

type UIState = 'idle' | 'loading' | 'polling' | 'done' | 'unsupported' | 'error';

interface ServicesManager { services: any; }
interface PanelMRProps { servicesManager: ServicesManager; }

interface Row {
  disk: string | null;
  pfirrmann: string | number | null;
  bulging: string | number | null;
  narrowing: string | number | null;
  hernia: boolean;
  spondy: boolean;
  hernia_mm: number | null;
}

function flattenFirst<T = any>(v: any, def: T | null = null): T | null {
  if (Array.isArray(v)) {
    const a = v[0];
    if (Array.isArray(a)) return (a[0] ?? def) as T | null;
    return (a ?? def) as T | null;
  }
  return (v ?? def) as T | null;
}
function formatRuDate(value?: string | number | Date | null): string {
  if (!value) return '—';
  try {
    if (typeof value === 'string' && /^\d{8}$/.test(value)) {
      const y = value.slice(0, 4), m = value.slice(4, 6), d = value.slice(6, 8);
      return `${d}.${m}.${y}`;
    }
    const dt = new Date(value);
    if (Number.isNaN(+dt)) return '—';
    return dt.toLocaleDateString('ru-RU');
  } catch { return '—'; }
}

export default function PanelMR({ servicesManager }: PanelMRProps) {
  const { t } = useTranslation('SidePanel');
  const { DisplaySetService } = servicesManager.services;

  const displaySet = useMemo(() => {
    const sets = DisplaySetService?.getActiveDisplaySets?.() || [];
    return sets.find((ds: any) => ds && MR.includes(ds.Modality));
  }, [DisplaySetService]);

  const studyId: string | null =
    DisplaySetService?.activeDisplaySets?.[0]?.StudyInstanceUID ??
    displaySet?.StudyInstanceUID ?? null;

  if (!studyId) {
    return <div className="px-3 py-4 text-primary-light">{t('MR study not selected')}</div>;
  }

  return <PanelMRInner key={studyId} servicesManager={servicesManager} studyId={studyId} t={t} />;
}

function PanelMRInner({
  servicesManager, studyId, t
}: { servicesManager: ServicesManager; studyId: string, t: (k: string) => string }) {
  const storageKey = `MRTOOLS:${studyId}`;

  const [ui, setUi] = useState<UIState>('idle');
  const [err, setErr] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processedAt, setProcessedAt] = useState<string | null>(null);
  const [reportAvailable, setReportAvailable] = useState(false);
  const [reportPath, setReportPath] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  const previewRef = useRef<HTMLDivElement | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  const clearPollTimer = () => {
    if (pollTimerRef.current != null) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const persist = (data: Partial<{
    processingId: string | null;
    processedAt: string | null;
    reportAvailable: boolean;
    reportPath: string | null;
    rows: Row[];
  }> = {}) => {
    const snapshot = {
      processingId, processedAt, reportAvailable, reportPath, rows, ...data,
    };
    try { sessionStorage.setItem(storageKey, JSON.stringify(snapshot)); } catch { }
  };

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const s = JSON.parse(raw);
        setProcessingId(s.processingId ?? null);
        setProcessedAt(s.processedAt ?? null);
        setReportAvailable(!!s.reportAvailable);
        setReportPath(s.reportPath ?? null);
        setRows(Array.isArray(s.rows) ? s.rows : []);
        setUi('done');
      } else {
        setRows([]);
        setUi('idle');
      }
    } catch {
      setRows([]);
      setUi('idle');
    }

    const controller = new AbortController();
    (async () => {
      setUi('loading');
      setErr('');
      try {
        const { data } = await axios.get(
          `${BASE}status/${encodeURIComponent(studyId)}`,
          { headers: { accept: 'application/json' }, signal: controller.signal }
        );

        const procId: string | null = data.processing_id ?? null;
        const repAvail: boolean = !!data.report_available;
        const repUrl: string | null = data.report_download_url ?? null;
        const procAt: string | null = data.processed_at ?? null;

        setProcessingId(procId);
        setReportAvailable(repAvail);
        setReportPath(repUrl);
        if (procAt) setProcessedAt(procAt);

        persist({
          processingId: procId, processedAt: procAt, reportAvailable: repAvail, reportPath: repUrl,
        });

        setUi('done');
      } catch (e: any) {
        if (axios.isCancel?.(e) || e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return;
        setErr(t('Status error'));
        setUi('error');
      }
    })();

    return () => {
      controller.abort();
      clearPollTimer();
    };
  }, [studyId]);

  const mapResultsToRows = (resultsStr: any): Row[] => {
    if (!resultsStr) return [];
    try {
      const arr = JSON.parse(resultsStr);
      return (arr as any[]).map(item => ({
        disk: item.disk_label ?? null,
        pfirrmann: flattenFirst(item['Pfirrmann grade']),
        bulging: flattenFirst(item['Disc bulging']),
        narrowing: flattenFirst(item['Disc narrowing']),
        hernia: !!item.hernia_detected,
        spondy: !!item.spondy_detected,
        hernia_mm:
          typeof item.hernia_max_protrusion_mm === 'number'
            ? item.hernia_max_protrusion_mm
            : item.hernia_max_protrusion_mm
              ? Number(item.hernia_max_protrusion_mm)
              : null,
      }));
    } catch { return []; }
  };

  const handleProcess = async () => {
    setUi('loading');
    setErr('');
    clearPollTimer();

    const controller = new AbortController();
    try {
      const body = new URLSearchParams();
      body.set('study_id', studyId);

      const { data } = await axios.post(`${BASE}process-study/`, body, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        signal: controller.signal,
      });

      const procId: string | null = data.processing_id || null;
      const repAvail: boolean = !!data.report_available;
      const repUrl: string | null = data.report_download_url || null;

      setProcessingId(procId);
      setReportAvailable(repAvail);
      setReportPath(repUrl);

      const nextRows = mapResultsToRows(data?.pipeline_result?.results);
      setRows(nextRows);

      persist({
        processingId: procId,
        reportAvailable: repAvail,
        reportPath: repUrl,
        rows: nextRows,
      });

      if (repAvail) {
        setUi('done');
        return;
      }

      setUi('polling');
      const maxTries = 30;
      const delay = 2000;

      let tries = 0;
      const tick = async () => {
        try {
          const { data: s } = await axios.get(
            `${BASE}status/${encodeURIComponent(studyId)}`,
            { headers: { accept: 'application/json' }, signal: controller.signal }
          );

          const repAvail2 = !!s.report_available;
          const repUrl2: string | null = s.report_download_url ?? null;
          const procAt2: string | null = s.processed_at ?? null;

          if (procAt2) setProcessedAt(procAt2);
          setReportAvailable(repAvail2);
          setReportPath(repUrl2);
          persist({ processedAt: procAt2, reportAvailable: repAvail2, reportPath: repUrl2 });

          if (repAvail2) {
            setUi('done');
            clearPollTimer();
            return;
          }
        } catch (e: any) {
          if (axios.isCancel?.(e) || e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return;
        }
        tries += 1;
        if (tries >= maxTries) {
          setUi('done');
          clearPollTimer();
          return;
        }
        pollTimerRef.current = window.setTimeout(tick, delay);
      };

      pollTimerRef.current = window.setTimeout(tick, delay);
    } catch (e: any) {
      if (axios.isCancel?.(e) || e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return;
      setErr(t('Processing error'));
      setUi('error');
    }
  };

  const handleDownload = async () => {
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
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });

      let filename = String(processingId || 'report');
      const disp = (resp.headers as any)['content-disposition'];
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
    } catch (e: any) {
      if (axios.isCancel?.(e) || e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return;
      setErr(t('Download error'));
      setUi('error');
    }
  };

  const lastProcessed = formatRuDate(processedAt);
  const isBusy = ui === 'loading' || ui === 'polling';

  return (
    <div className="flex h-full min-h-0 flex-col px-3 pt-3 pb-1 text-white">
      <div className="sticky top-0 z-10 -mx-3 -mt-3 px-3 pt-3 pb-2 bg-black/60 backdrop-blur supports-[backdrop-filter]:bg-black/30 border-b border-white/10">
        <div className="flex flex-col gap-2">
          <Button
            size="initial"
            className="px-2 py-2 text-base"
            color="primaryActive"
            variant="outlined"
            disabled={isBusy}
            onClick={handleProcess}
          >
            {t('Analyze')}
          </Button>

          <Button
            size="initial"
            className="px-2 py-2 text-base bg-orange-600 hover:bg-orange-500"
            variant="outlined"
            disabled={!reportAvailable || isBusy}
            onClick={handleDownload}
          >
            {t('Download report')}
          </Button>

          <div className="ml-auto text-sm text-primary-light">
            {t('Last processed')}: <span className="text-white">{lastProcessed}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <div
          ref={previewRef}
          className="relative h-full border border-primary-light/30 rounded p-3 overflow-auto custom-scroll flex flex-col"
        >
          <div className="mb-3 text-lg text-primary-light">{t('Preview results')}</div>

          <div className="flex-1 min-h-0">
            {isBusy && (
              <div className="h-full w-full flex items-center justify-center">
                <div className="loading">
                  <div className="infinite-loading-bar bg-primary-light" />
                </div>
              </div>
            )}

            {!isBusy && ui === 'error' && (
              <div className="mt-2 text-xs text-red-400">{err || t('Error')}</div>
            )}

            {!isBusy && rows.length === 0 && (
              <div className="text-base text-primary-light">
                {t('Data preview will be available after re-analysis')}
              </div>
            )}

            {!isBusy && rows.length > 0 && (
              <div className="flex flex-col gap-2 text-base">
                {rows.map((r, i) => (
                  <div
                    key={`${r.disk ?? 'disk'}-${i}`}
                    className="grid grid-cols-6 gap-3 items-center border-b border-white/10 pb-2"
                  >
                    <div className="col-span-1">
                      <span className="text-primary-light">{t('Disk')}</span>{' '}
                      <span className="text-white">{r.disk ?? '-'}</span>
                    </div>
                    <div className="col-span-1">
                      <span className="text-primary-light">{t('Pfirrmann grade')}</span>{' '}
                      <span className="text-white">{r.pfirrmann ?? '-'}</span>
                    </div>
                    <div className="col-span-1">
                      <span className="text-primary-light">{t('Bulging')}</span>{' '}
                      <span className="text-white">{r.bulging ?? '-'}</span>
                    </div>
                    <div className="col-span-1">
                      <span className="text-primary-light">{t('Narrowing')}</span>{' '}
                      <span className="text-white">{r.narrowing ?? '-'}</span>
                    </div>
                    <div className="col-span-1">
                      <span className="text-primary-light">{t('Hernia')}</span>{' '}
                      <span className="text-white">{r.hernia ? t('Yes') : t('No')}</span>
                    </div>
                    <div className="col-span-1">
                      <span className="text-primary-light">{t('Spondylolisthesis')}</span>{' '}
                      <span className="text-white">{r.spondy ? t('Yes') : t('No')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
