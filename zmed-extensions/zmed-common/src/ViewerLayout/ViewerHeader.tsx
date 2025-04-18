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

  const { uiModalService, DisplaySetService } = servicesManager.services;

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

    console.log(displaySet);
    console.log(!!displaySet);

    return !!displaySet;
  };

  const isMr = isMRStudy();

  const handleMRStudyClick = async () => {
    console.log('mrStudyClick');
    setIsAnalyzing(true);

    try {
      // 1) Берём текущий DisplaySet с MR-модальностью
      const displaySet = DisplaySetService.getActiveDisplaySets().find(
        (ds) => ds && 'MR'.includes(ds.Modality)
      );

      const postData = {
        study_instance_uid: displaySet.StudyInstanceUID,
        series_instance_uid: displaySet.SeriesInstanceUID,
      };
      const urlProcessMRT = configuration.mrURL + 'process_mrt';
      const urlGetDocx = configuration.mrURL + 'create_docx/';

      console.log('postData:', postData);

      // 2) Запускаем обработку и сразу получаем task_id
      const postRes = await axios.post(urlProcessMRT, postData);
      const taskId = postRes.data.task_id;
      console.log('Task ID:', taskId);

      // 3) Хелпер для задержки
      const delay = (ms) => new Promise((res) => setTimeout(res, ms));

      // 4) Polling: пытаемся скачать blob до 10 раз с интервалом 2 сек
      let fileBlob = null;
      for (let attempt = 1; attempt <= 10; attempt++) {
        try {
          const getRes = await axios.get(`${urlGetDocx}${taskId}`, {
            responseType: 'blob',
          });
          // Проверяем размер — если больше условного минимума, считаем, что файл готов
          if (getRes.data.size > 1024) {
            fileBlob = getRes.data;
            console.log(`Файл готов (попытка ${attempt})`);
            break;
          }
        } catch (err) {
          // Если 404 — файл ещё не готов, продолжим polling
          if (err.response?.status !== 404) {
            throw err;
          }
        }
        console.log(
          `Файл не готов, повторная попытка ${attempt + 1} через 2 сек…`
        );
        await delay(2000);
      }

      if (!fileBlob) {
        throw new Error(
          'Не удалось получить отчёт: файл не появился на сервере.'
        );
      }

      // 5) Формируем blob‑URL и скачиваем
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

      // 6) Делаем небольшую задержку, чтобы браузер успел стартовать скачивание
      setTimeout(() => {
        window.URL.revokeObjectURL(downloadUrl);
        document.body.removeChild(link);
      }, 100);
    } catch (err) {
      console.error('Ошибка при скачивании отчёта:', err);
      // здесь при необходимости можно показать пользователю уведомление об ошибке
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
