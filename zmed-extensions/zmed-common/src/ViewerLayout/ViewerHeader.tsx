import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import type { withAppTypes } from '@ohif/core/types';
import {
  ErrorBoundary,
  UserPreferences,
  Header,
  useModal,
  DeleteStudyMenu,
} from '@ohif/ui';
import i18n from '@ohif/i18n';
import { hotkeys } from '@ohif/core';
import { Toolbar } from '../Toolbar/Toolbar';

import AboutModal from '../components/AboutModal';
import AuthService from '../../../../platform/app/src/services/AuthService';

const { availableLanguages, defaultLanguage, currentLanguage } = i18n;

const ViewerHeader: React.FC<withAppTypes> = ({
  hotkeysManager,
  extensionManager,
  servicesManager,
  appConfig,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { show, hide } = useModal();
  const { hotkeyDefinitions, hotkeyDefaults } = hotkeysManager;
  const versionNumber = process.env.VERSION_NUMBER;
  const commitHash = process.env.COMMIT_HASH;

  const { uiModalService, uiNotificationService, DisplaySetService, HangingProtocolService } = servicesManager.services;

  const dataSourceName = extensionManager.defaultDataSourceName;
  const dataSource = extensionManager.getDataSources(dataSourceName)?.[0];

  const urlSearchParams = new URLSearchParams(window.location.search);
  const studyInstanceUID = urlSearchParams.get('StudyInstanceUIDs');

  type UserPreferencesSubmitArgs = {
    hotkeyDefinitions: Parameters<
      (typeof hotkeysManager)['setHotkeys']
    >[0];
    language: { value: string };
  };

  const onClickReturnButton = (): void => {
    const { pathname } = location;
    const dataSourceIdx = pathname.indexOf('/', 1);
    const query = new URLSearchParams(window.location.search);
    const configUrl = query.get('configUrl');

    const pathDataSourceName =
      dataSourceIdx !== -1 ? pathname.substring(dataSourceIdx + 1) : '';

    const existingDataSource = pathDataSourceName
      ? extensionManager.getDataSources(pathDataSourceName)
      : undefined;

    const searchQuery = new URLSearchParams();

    if (dataSourceIdx !== -1 && existingDataSource) {
      searchQuery.append('datasources', pathDataSourceName);
    }

    if (configUrl) {
      searchQuery.append('configUrl', configUrl);
    }

    navigate({
      pathname: '/',
      search: decodeURIComponent(searchQuery.toString()),
    });
  };

  const handleConfirmDeleteStudy = async (
    event: React.MouseEvent<HTMLButtonElement>
  ): Promise<void> => {
    event.preventDefault();

    try {
      await dataSource.query.studies.delete(studyInstanceUID);

      uiNotificationService.show({
        title: t('StudyList:Deleting study'),
        message: t(
          'StudyList:Study have been deleted successfully'
        ),
        type: 'success',
      });
    } catch {
        uiNotificationService.show({
          title: t('StudyList:Deleting study'),
          message: t(
            'StudyList:Error while deleting study'
          ),
          type: 'error',
        });
    }
    onClickReturnButton();
    uiModalService.hide();
  };

  const handleConfirmDeleteAllSeries = async (
    event: React.MouseEvent<HTMLButtonElement>
  ): Promise<void> => {
    event.preventDefault();

    const allowedModalities: ReadonlyArray<string> = ['OT', 'SEG', 'SR', 'DOC', 'PDF'];

    if (!dataSource || !dataSource.query?.series?.delete) {
      uiNotificationService.show({
        title: t('StudyList:Deleting Zview reports'),
        message: t(
          'StudyList:Error occurred while deleting Zview reports'
        ),
        type: 'error',
      });
      uiModalService.hide();
      return;
    }

    const activeDisplaySets = DisplaySetService.activeDisplaySets ?? [];

    const deletableDisplaySets = activeDisplaySets.filter(displaySet => {
      const modality = displaySet.Modality?.trim().toUpperCase();
      return (
        modality !== undefined && allowedModalities.includes(modality)
      );
    });

    if (deletableDisplaySets.length === 0) {
      uiNotificationService.show({
        title: t('StudyList:Deleting Zview reports'),
        message: t(
          'StudyList:No Zview reports were found to delete'
        ),
        type: 'info',
      });
      uiModalService.hide();
      return;
    }

    try {
      for (const displaySet of deletableDisplaySets) {
        const seriesInstanceUID = displaySet.SeriesInstanceUID;

        if (!seriesInstanceUID) {
          continue;
        }

        await dataSource.query.series.delete(seriesInstanceUID);
      }

      uiNotificationService.show({
        title: t('StudyList:Deleting Zview reports'),
        message: t(
          'StudyList:Zview reports have been deleted successfully'
        ),
        type: 'success',
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : t('StudyList:Unknown error occurred while deleting Zview reports');

      uiNotificationService.show({
        title: t('StudyList:Deleting Zview reports'),
        message: errorMessage,
        type: 'error',
      });
    } finally {
      uiModalService.hide();
    }
  };

  const handleCancelDelete = (
    event: React.MouseEvent<HTMLButtonElement>
  ): void => {
    event.preventDefault();
    uiModalService.hide();
  };

  const handleDeleteCurrentSeries = async () => {
    if (!dataSource || !dataSource.query?.series?.delete) {
      uiNotificationService.show({
        title: t('StudyList:Deleting current series'),
        message: t(
          'StudyList:Error occurred while deleting current series'
        ),
        type: 'error',
      });
      uiModalService.hide();
      return;
    }

    try {
      const { ViewportGridService, DisplaySetService } =
      servicesManager.services;

    const state = ViewportGridService.getState();
    const displaySetInstanceUID =
      state.viewports.entries().next().value[1].displaySetInstanceUIDs[0];

    if (displaySetInstanceUID) {
      const displaySet =
        DisplaySetService.getDisplaySetByUID(displaySetInstanceUID);

      console.log('SeriesInstanceUID:', displaySet?.SeriesInstanceUID);

      await dataSource.query.series.delete(displaySet?.SeriesInstanceUID);

      uiNotificationService.show({
        title: t('StudyList:Deleting current series'),
        message: t(
          'StudyList:Current series have been deleted successfully'
        ),
        type: 'success',
      });
    }
    uiModalService.hide();
    return;
    }
    catch {
      uiNotificationService.show({
        title: t('StudyList:Deleting current series'),
        message: t('StudyList:Unknown error occurred while deleting current series'),
        type: 'error',
      });
    }
  }

  const onClickDelete = (
    event: React.MouseEvent<HTMLButtonElement>
  ): void => {
    event.preventDefault();

    uiModalService.show({
      title: t('StudyList:Delete study'),
      containerDimensions: 'w-96',
      content: () => (
        <DeleteStudyMenu
          deleteAllSeriesLabel={t(
            'StudyList:Are you sure you wish to delete all Zview reports?'
          )}
          deleteStudyLabel={t(
            'StudyList:Are you sure you wish to delete this study?'
          )}
          deleteCurrentSeriesLabel={t(
            'StudyList:Are you sure you wish to delete the current series?'
          )}
          onConfirmDeleteAllSeries={handleConfirmDeleteAllSeries}
          onConfirmDeleteStudy={handleConfirmDeleteStudy}
          onCancel={handleCancelDelete}
          handleDeleteCurrentSeries={handleDeleteCurrentSeries}
        />
      ),
    });
  };

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
            onSubmit: ({
              hotkeyDefinitions: submittedHotkeyDefinitions,
              language,
            }: UserPreferencesSubmitArgs) => {
              if (language.value !== currentLanguage().value) {
                i18n.changeLanguage(language.value);
              }
              hotkeysManager.setHotkeys(submittedHotkeyDefinitions);
              hide();
            },
            onReset: () => hotkeysManager.restoreDefaultBindings(),
            hotkeysModule: hotkeys,
          },
        }),
    },
    {
      title: t('Header:Logout'),
      icon: 'power-off',
      onClick: async () => {
        AuthService.logout();
      },
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
    >
      <ErrorBoundary context="Primary Toolbar">
        <div className="relative flex justify-center gap-[4px]">
          <Toolbar servicesManager={servicesManager} />
        </div>
      </ErrorBoundary>
    </Header>
  );
};

export default ViewerHeader;
