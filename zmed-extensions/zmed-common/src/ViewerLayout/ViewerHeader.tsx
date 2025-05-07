import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import type { withAppTypes } from '@ohif/core/types';
import {
  ConfirmContent,
  ErrorBoundary,
  UserPreferences,
  Header,
  useModal,
} from '@ohif/ui';
import i18n from '@ohif/i18n';
import { hotkeys } from '@ohif/core';
import { Toolbar } from '../Toolbar/Toolbar';

import AboutModal from '../components/AboutModal';
import configuration from '../config';
import axios from 'axios';

const { availableLanguages, defaultLanguage, currentLanguage } = i18n;

function ViewerHeader({
  hotkeysManager,
  extensionManager,
  servicesManager,
  appConfig,
}: withAppTypes) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const dataSourceName = extensionManager.defaultDataSourceName;
  const dataSource = extensionManager.getDataSources(dataSourceName)?.[0];
  const studyInstanceUID = new URLSearchParams(window.location.search).get(
    'StudyInstanceUIDs'
  );

  const {
    uiModalService,
    DisplaySetService,
    viewportGridService,
    uiNotificationService,
  } = servicesManager.services;

  const handleClickYes = async (e) => {
    e.preventDefault();
    await dataSource.query.studies.delete(studyInstanceUID);
    onClickReturnButton();
    uiModalService.hide();
  };

  const handleClickNo = async (e) => {
    e.preventDefault();
    uiModalService.hide();
  };

  const onClickDelete = (e) => {
    e.preventDefault();
    uiModalService.show({
      title: t('StudyList:Delete study'),
      containerDimensions: 'w-80',
      content: () => {
        return (
          <ConfirmContent
            labelContent={t(
              'StudyList:Are you sure you wish to delete this study?'
            )}
            handleClickYes={handleClickYes}
            handleClickNo={handleClickNo}
          />
        );
      },
    });
  };

  const onClickReturnButton = () => {
    const { pathname } = location;
    const dataSourceIdx = pathname.indexOf('/', 1);
    const query = new URLSearchParams(window.location.search);
    const configUrl = query.get('configUrl');

    const dataSourceName = pathname.substring(dataSourceIdx + 1);
    const existingDataSource = extensionManager.getDataSources(dataSourceName);

    const searchQuery = new URLSearchParams();
    if (dataSourceIdx !== -1 && existingDataSource) {
      searchQuery.append('datasources', pathname.substring(dataSourceIdx + 1));
    }

    if (configUrl) {
      searchQuery.append('configUrl', configUrl);
    }

    navigate({
      pathname: '/',
      search: decodeURIComponent(searchQuery.toString()),
    });
  };

  const isMRStudy = () => {
    const displaySet = DisplaySetService.getActiveDisplaySets().find(
      (ds) => ds && 'MR'.includes(ds.Modality)
    );

    return !!displaySet;
  };

  const isMr = isMRStudy();

  const handleMRStudyClick = async () => {
    setIsAnalyzing(true);

    try {
      // 1) Собираем все MR-датасеты, первый датасет тот, кто во Вьюпорте
      const { activeViewportId, viewports } = viewportGridService.getState();
      const { displaySetInstanceUIDs } = viewports.get(activeViewportId);
      const primaryUID = displaySetInstanceUIDs[0];

      // Собираем все MR-дисплейсеты
      const allMR = DisplaySetService.getActiveDisplaySets().filter(
        (ds) => ds && ds.Modality === 'MR'
      );

      // Ищем индекс того, что должен быть первым
      const primaryIndex = allMR.findIndex(
        (ds) => ds.displaySetInstanceUID === primaryUID
      );

      let mrDisplaySets;
      if (primaryIndex >= 0) {
        const [primarySet] = allMR.splice(primaryIndex, 1);
        mrDisplaySets = [primarySet, ...allMR];
      } else {
        mrDisplaySets = allMR;
      }

      const urlProcessMRT = configuration.mrURL + 'process_mrt';
      const urlGetDocx = configuration.mrURL + 'create_docx/';

      // Хелпер для polling
      const delay = (ms) => new Promise((res) => setTimeout(res, ms));

      let success = false;

      // 2) Перебираем их по порядку
      for (const displaySet of mrDisplaySets) {
        const postData = {
          study_instance_uid: displaySet.StudyInstanceUID,
          series_instance_uid: displaySet.SeriesInstanceUID,
        };

        try {
          // 2.1) Запуск обработки — получаем task_id
          const postRes = await axios.post(urlProcessMRT, postData);
          const taskId = postRes.data.task_id;

          // 2.2) Polling на готовность .docx
          let fileBlob = null;
          for (let attempt = 1; attempt <= 10; attempt++) {
            try {
              const getRes = await axios.get(`${urlGetDocx}${taskId}`, {
                responseType: 'blob',
              });
              if (getRes.data.size > 1024) {
                fileBlob = getRes.data;
                console.log(
                  `Файл готов для датасета ${displaySet.SeriesInstanceUID} (попытка ${attempt})`
                );
                break;
              }
            } catch (err) {
              // 404 — ещё не готов, продолжаем polling
              if (err.response?.status !== 404) {
                throw err;
              }
            }
            await delay(2000);
          }

          if (!fileBlob) {
            throw new Error('Polling завершился без готового файла');
          }

          // 2.3) Скачиваем результат и выходим из цикла
          const blob = new Blob([fileBlob], {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          });
          const downloadUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.style.display = 'none';
          link.href = downloadUrl;
          link.download = `${taskId}_report.docx`;
          document.body.appendChild(link);
          link.click();
          setTimeout(() => {
            window.URL.revokeObjectURL(downloadUrl);
            document.body.removeChild(link);
          }, 100);

          success = true;
          break;
        } catch (err) {
          // 500 от сервера — просто переходим к следующему датасету
          if (err.response?.status === 500) {
            console.warn(
              `Обработка датасета ${displaySet.SeriesInstanceUID} вернула 500, пробуем следующий…`
            );
            continue;
          }
          // Другие ошибки — кидаем дальше
          throw err;
        }
      }

      // 3) Если ни один датасет не сработал — сообщаем об этом в консоль
      if (!success) {
        console.log('Data Error');
        uiNotificationService.show({
          title: t('Header:Processing error'),
          message: t(
            'Header:The study does not contain a series with a sagittal slice'
          ),
          type: 'error',
        });
      }
    } catch (err) {
      console.error('Ошибка при скачивании отчёта:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const { t } = useTranslation();
  const { show, hide } = useModal();
  const { hotkeyDefinitions, hotkeyDefaults } = hotkeysManager;
  const versionNumber = process.env.VERSION_NUMBER;
  const commitHash = process.env.COMMIT_HASH;

  const menuOptions = [
    {
      title: t('Header:About'),
      icon: 'info',
      onClick: () =>
        show({
          content: AboutModal,
          title: 'About ZMed Viewer',
          contentProps: { versionNumber, commitHash },
        }),
    },
    {
      title: t('Header:Preferences'),
      icon: 'settings',
      onClick: () =>
        show({
          title: t('UserPreferencesModal:User preferences'),
          content: UserPreferences,
          containerDimensions: 'w-[70%] max-w-[900px]',
          contentProps: {
            hotkeyDefaults:
              hotkeysManager.getValidHotkeyDefinitions(hotkeyDefaults),
            hotkeyDefinitions,
            currentLanguage: currentLanguage(),
            availableLanguages,
            defaultLanguage,
            onCancel: () => {
              hotkeys.stopRecord();
              hotkeys.unpause();
              hide();
            },
            onSubmit: ({ hotkeyDefinitions, language }) => {
              if (language.value !== currentLanguage().value) {
                i18n.changeLanguage(language.value);
              }
              hotkeysManager.setHotkeys(hotkeyDefinitions);
              hide();
            },
            onReset: () => hotkeysManager.restoreDefaultBindings(),
            hotkeysModule: hotkeys,
          },
        }),
    },
  ];

  if (appConfig.oidc) {
    menuOptions.push({
      title: t('Header:Logout'),
      icon: 'power-off',
      onClick: async () => {
        navigate(
          `/logout?redirect_uri=${encodeURIComponent(window.location.href)}`
        );
      },
    });
  }

  return (
    <Header
      menuOptions={menuOptions}
      isReturnEnabled={!!!appConfig.showStudyList}
      onClickReturnButton={onClickReturnButton}
      WhiteLabeling={appConfig.whiteLabeling}
      showPatientInfo={appConfig.showPatientInfo}
      servicesManager={servicesManager}
      appConfig={appConfig}
      onClickDelete={onClickDelete}
      handleMRStudyClick={handleMRStudyClick}
      isAnalyzing={isAnalyzing}
      isMRStudy={isMr}
    >
      <ErrorBoundary context="Primary Toolbar">
        <div className="relative flex justify-center gap-[4px]">
          <Toolbar servicesManager={servicesManager} />
        </div>
      </ErrorBoundary>
    </Header>
  );
}

export default ViewerHeader;
