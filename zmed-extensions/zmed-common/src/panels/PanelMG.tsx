// PanelMG.tsx
import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Button, Icon } from '@ohif/ui';
import { useTranslation } from 'react-i18next';
import { useAppConfig } from '@state';

// Глобально на жизнь вкладки: StudyUID -> AbortController
const inflight = new Map<string, AbortController>();

type PanelMGProps = {
  servicesManager: { services: any };
};

function Spinner() {
  return <div className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />;
}

// Надёжное извлечение UID
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

const PanelMG: React.FC<PanelMGProps> = ({ servicesManager }) => {
  const [appConfig] = useAppConfig();
  const { t } = useTranslation('Header');
  const { uiNotificationService, DisplaySetService } = servicesManager.services;

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const mountedRef = useRef(true);

  // Синхронизация состояния при смене активного исследования
  useEffect(() => {
    mountedRef.current = true;
    const uid = getStudyUID(DisplaySetService);
    setIsAnalyzing(!!(uid && inflight.has(uid)));
    return () => {
      mountedRef.current = false;
    };
  }, [DisplaySetService]);

  const setAnalyzingSafe = (v: boolean) => {
    if (mountedRef.current) setIsAnalyzing(v);
  };

  const handleMGStudyClick = async () => {
    const studyId = getStudyUID(DisplaySetService);

    if (!studyId) {
      setAnalyzingSafe(false);
      uiNotificationService?.show({
        title: t('Header:Processing error'),
        message: 'StudyInstanceUID not found',
        type: 'error',
      });
      return;
    }

    // Уже идёт запрос — не запускаем повторно
    if (inflight.has(studyId)) {
      setAnalyzingSafe(true);
      return;
    }

    const controller = new AbortController();
    inflight.set(studyId, controller);
    setAnalyzingSafe(true);

    try {
      const urlPredict = `${appConfig?.zmedtools?.mgURL}predict`;
      const resp = await axios.post(
        urlPredict,
        { study_instance_uid: studyId },
        { responseType: 'blob', signal: controller.signal }
      );

      if (resp.status !== 200) throw new Error(`HTTP ${resp.status}`);

      // Имя файла из заголовка, иначе дефолт
      let filename = `mammography_report_${studyId}.docx`;
      const disp = (resp.headers as any)['content-disposition'];
      if (disp) {
        const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i.exec(disp);
        if (m?.[1]) filename = decodeURIComponent(m[1]);
      }

      const blobUrl = URL.createObjectURL(resp.data);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (error: any) {
      // Любая ошибка, включая сеть/5xx/4xx/отмена
      uiNotificationService?.show({
        title: t('Header:Processing error'),
        message: String(error?.message || ''),
        type: 'error',
      });
    } finally {
      // Всегда очищаем реестр и локальный флаг
      inflight.delete(studyId);
      setAnalyzingSafe(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col px-3 pt-3 pb-1 text-white">
      <div className="sticky top-0 z-10 -mx-3 -mt-3 px-3 pt-3 pb-2 bg-black/60 backdrop-blur supports-[backdrop-filter]:bg-black/30">
        <div className="flex flex-col gap-2 mt-2">
          <Button
            startIcon={!isAnalyzing ? <Icon className="!h-[12px] !w-[12px] text-black" name="sparkles" /> : undefined}
            size="initial"
            className="px-2 py-2 text-base !bg-orange-600 hover:!bg-orange-500"
            onClick={handleMGStudyClick}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? <Spinner /> : <span>{t('AI Analysis')}</span>}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PanelMG;
