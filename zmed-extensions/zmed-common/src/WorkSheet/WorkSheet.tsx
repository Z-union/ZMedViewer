import React, { useState, useEffect, useMemo } from 'react';
import classnames from 'classnames';
import PropTypes from 'prop-types';
import { Link, useNavigate } from 'react-router-dom';
import moment from 'moment';
import qs from 'query-string';
import isEqual from 'lodash.isequal';
import { useTranslation } from 'react-i18next';
//
import filtersMeta from './filtersMeta.js';
import { useAppConfig } from '@state';
import { useDebounce, useSearchParams } from '@hooks';
import { utils, hotkeys, ServicesManager, Types as CoreTypes } from '@ohif/core';

import {
  Icon,
  StudyListExpandedRow,
  LegacyButton,
  EmptyStudies,
  StudyListTable,
  StudyListPagination,
  StudyListFilter,
  TooltipClipboard,
  Header,
  useModal,
  useSessionStorage,
  UserPreferences,
  LoadingIndicatorProgress,
  DeleteStudyMenu,
} from '@ohif/ui';

import AboutModal from '../components/AboutModal';
import AdminModal from './AdminModal';
import Feedback from '../components/Feedback';

import i18n from '@ohif/i18n';

import { Types } from '@ohif/ui';

import AuthService from '../../../../platform/app/src/services/AuthService.js';

const { sortBySeriesDate, getDateWithTimezone } = utils;

const { availableLanguages, defaultLanguage, currentLanguage } = i18n;

const PatientInfoVisibility = Types.PatientInfoVisibility;

const seriesInStudiesMap = new Map();

/**
 * TODO:
 * - debounce `setFilterValues` (150ms?)
 */
function WorkSheet({
  data: studies,
  pages,
  size,
  dataTotal: studiesTotal,
  isLoadingData,
  dataSource,
  hotkeysManager,
  dataPath,
  onRefresh,
  servicesManager,
  isLoadingError,
  getData,
}) {
  const { hotkeyDefinitions, hotkeyDefaults } = hotkeysManager;
  const { uiNotificationService, uiModalService } = servicesManager.services;
  const userEmail = 'zview'; // servicesManager.services.userAuthenticationService.getUser().profile.preferred_username;
  const { show, hide } = useModal();
  const { t } = useTranslation('StudyList');
  // ~ Modes
  const [appConfig] = useAppConfig();
  // ~ Filters
  const searchParams = useSearchParams();
  const navigate = useNavigate();
  const STUDIES_LIMIT = 101;
  const queryFilterValues = _getQueryFilterValues(searchParams);
  const [sessionQueryFilterValues, updateSessionQueryFilterValues] =
    useSessionStorage({
      key: 'queryFilterValues',
      defaultValue: queryFilterValues,
      clearOnUnload: true,
    });
  const [filterValues, _setFilterValues] = useState({
    ...defaultFilterValues,
    ...sessionQueryFilterValues,
  });

  const [isAdmin, setIsAdmin] = useState(AuthService.isAdmin());
  useEffect(() => {
    let cancelled = false;
    AuthService.checkAdminAndCache()
      .then(val => {
        if (!cancelled) setIsAdmin(!!val);
      })
      .catch(() => {});
    const onStorage = e => {
      if (e.key === 'is_admin') {
        setIsAdmin(e.newValue === '1');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const debouncedFilterValues = useDebounce(filterValues, 20);
  const { resultsPerPage, pageNumber, sortBy, sortDirection } = filterValues;

  const canSort = false;
  const shouldUseDefaultSort = sortBy === '' || !sortBy;
  const sortModifier = sortDirection === 'descending' ? 1 : -1;
  const defaultSortValues =
    shouldUseDefaultSort && canSort
      ? { sortBy: 'studyDate', sortDirection: 'ascending' }
      : {};
  const sortedStudies: CoreTypes.StudiesMetadata[] = studies;
  if (canSort) {
    studies.sort((s1, s2) => {
      if (shouldUseDefaultSort) {
        const ascendingSortModifier = -1;
        return _sortStringDates(s1, s2, ascendingSortModifier);
      }

      const s1Prop = s1[sortBy];
      const s2Prop = s2[sortBy];

      if (typeof s1Prop === 'string' && typeof s2Prop === 'string') {
        return s1Prop.localeCompare(s2Prop) * sortModifier;
      } else if (typeof s1Prop === 'number' && typeof s2Prop === 'number') {
        return (s1Prop > s2Prop ? 1 : -1) * sortModifier;
      } else if (!s1Prop && s2Prop) {
        return -1 * sortModifier;
      } else if (!s2Prop && s1Prop) {
        return 1 * sortModifier;
      } else if (sortBy === 'studyDate') {
        return _sortStringDates(s1, s2, sortModifier);
      }

      return 0;
    });
  }

  // ~ Rows & Studies
  const [expandedRows, setExpandedRows] = useState([]);
  const [studiesWithSeriesData, setStudiesWithSeriesData] = useState([]);
  const numOfStudies = studiesTotal;
  const querying = useMemo(() => {
    return isLoadingData || expandedRows.length > 0;
  }, [isLoadingData, expandedRows]);

  const setFilterValues = val => {
    if (filterValues.pageNumber === val.pageNumber) {
      val.pageNumber = 1;
    }
    _setFilterValues(val);
    updateSessionQueryFilterValues(val);
    setExpandedRows([]);
  };

  const onPageNumberChange = newPageNumber => {
    setFilterValues({ ...filterValues, pageNumber: newPageNumber });
  };

  const onResultsPerPageChange = newResultsPerPage => {
    setFilterValues({
      ...filterValues,
      pageNumber: 1,
      resultsPerPage: Number(newResultsPerPage),
    });
  };

  useEffect(() => {
    document.body.classList.add('bg-black');
    return () => {
      document.body.classList.remove('bg-black');
    };
  }, []);

  useEffect(() => {
    if (!debouncedFilterValues) {
      return;
    }

    const queryString: Record<string, string> = {};
    Object.keys(defaultFilterValues).forEach(key => {
      const defaultValue = (defaultFilterValues as any)[key];
      const currValue = (debouncedFilterValues as any)[key];

      if (key === 'studyDate') {
        if (
          currValue.startDate &&
          defaultValue.startDate !== currValue.startDate
        ) {
          queryString.startDate = currValue.startDate;
        }
        if (currValue.endDate && defaultValue.endDate !== currValue.endDate) {
          queryString.endDate = currValue.endDate;
        }
      } else if (key === 'modalities' && currValue.length) {
        queryString.modalities = currValue.join(',');
      } else if (currValue !== defaultValue) {
        queryString[key] = currValue;
      }
    });

    const search = qs.stringify(queryString, {
      skipNull: true,
      skipEmptyString: true,
    });

    navigate({
      pathname: '/',
      search: search ? `?${search}` : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedFilterValues]);

  useEffect(() => {
    const fetchSeries = async studyInstanceUid => {
      try {
        const series = await dataSource.query.series.search(studyInstanceUid);
        seriesInStudiesMap.set(studyInstanceUid, sortBySeriesDate(series));
        setStudiesWithSeriesData([...studiesWithSeriesData, studyInstanceUid]);
      } catch (ex) {
        console.warn(ex);
      }
    };

    for (let z = 0; z < expandedRows.length; z++) {
      const expandedRowIndex = expandedRows[z] - 1;
      const studyInstanceUid = sortedStudies[expandedRowIndex].studyInstanceUid;

      if (studiesWithSeriesData.includes(studyInstanceUid)) {
        continue;
      }

      fetchSeries(studyInstanceUid);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedRows, studies]);

  const isFiltering = (fv, dfv) => {
    return !isEqual(fv, dfv);
  };

  const rollingPageNumberMod = Math.floor(101 / resultsPerPage);
  const rollingPageNumber = (pageNumber - 1) % rollingPageNumberMod;
  const offset = resultsPerPage * rollingPageNumber;
  const offsetAndTake = offset + resultsPerPage;
  const tableDataSource = sortedStudies.map((study, key) => {
    const rowKey = key + 1;
    const isExpanded = expandedRows.some(k => k === rowKey);
    const {
      studyInstanceUid,
      accession,
      modalities,
      instances,
      description,
      mrn,
      patientName,
      date,
      time,
      uploadedAt,
      isProcessed,
    } = study;

    const [studyDate, studyTime] = i18n.formatFullDateWithTimezone(date, time);
    const [uploadDate, uploadTime] =
      i18n.formatFullDateWithTimezone(uploadedAt);

    const handleConfirmDeleteStudy = async e => {
      e.preventDefault();
      try {
        await dataSource.query.studies.delete(studyInstanceUid);

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
      onRefresh();
      uiModalService.hide();
    };

    const handleCancelDelete = (
      event: React.MouseEvent<HTMLButtonElement>
    ): void => {
      event.preventDefault();
      uiModalService.hide();
    };

    const handleConfirmDeleteAllSeries = async (
      event: React.MouseEvent<HTMLButtonElement>,
      studyInstanceUid: string,
    ): Promise<void> => {
      event.preventDefault();

      const allowedModalities: ReadonlyArray<string> = ['OT', 'SEG', 'SR', 'DOC', 'PDF'];

      const activeDisplaySets = await dataSource.query.series.search(studyInstanceUid) ?? [];

        const deletableDisplaySets = activeDisplaySets.filter(displaySet => {
        const modality = displaySet.modality?.trim().toUpperCase();
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
          const seriesInstanceUID = displaySet.seriesInstanceUid;

          if (!seriesInstanceUID) {
            continue;
          }

          await dataSource.query.series.delete(seriesInstanceUID);
        }

        onRefresh();

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

    return {
      row: [
        {
          key: 'patientName',
          content: patientName ? (
            <TooltipClipboard>{patientName}</TooltipClipboard>
          ) : (
            <span className="text-gray-700">(Empty)</span>
          ),
          gridCol: 4,
        },
        {
          key: 'mrn',
          content: <TooltipClipboard>{mrn}</TooltipClipboard>,
          gridCol: 2,
        },
        {
          key: 'studyUploadedAt',
          content: (
            <>
              {uploadDate && <span className="mr-4">{uploadDate}</span>}
              {uploadTime && <span>{uploadTime}</span>}
            </>
          ),
          title: `${uploadDate || ''} ${uploadTime || ''}`,
          gridCol: 5,
        },
        {
          key: 'studyDate',
          content: (
            <>
              {studyDate && <span className="mr-4">{studyDate}</span>}
              {studyTime && <span>{studyTime}</span>}
            </>
          ),
          title: `${studyDate || ''} ${studyTime || ''}`,
          gridCol: 5,
        },
        {
          key: 'modality',
          content: modalities,
          title: modalities,
          gridCol: 3,
        },
        {
          key: 'accession',
          content: <p>{isProcessed ? t('StudyList:Processed') : t('StudyList:Not processed')}</p>,
          gridCol: 3,
        },
        {
          key: 'instances',
          content: (
            <>
              <Icon
                name="group-layers"
                className={classnames('inline-flex mr-2 w-4', {
                  'text-primary-active': isExpanded,
                  'text-secondary-light': !isExpanded,
                })}
              />
              {instances}
            </>
          ),
          title: (instances || 0).toString(),
          gridCol: 4,
        },
      ],
      expandedContent: (
        <StudyListExpandedRow
          seriesTableColumns={{
            description: 'Description',
            seriesNumber: 'Series',
            modality: 'Modality',
            instances: 'Instances',
          }}
          seriesTableDataSource={
            seriesInStudiesMap.has(studyInstanceUid)
              ? seriesInStudiesMap.get(studyInstanceUid).map(s => {
                  return {
                    description: s.description || '(empty)',
                    seriesNumber: s.seriesNumber ?? '',
                    modality: s.modality || '',
                    instances: s.numSeriesInstances || '',
                  };
                })
              : []
          }
        >
          <div className="flex flex-row gap-2">
            {appConfig.loadedModes.map((mode, i) => {
              const isFirst = i === 0;

              const modalitiesToCheck = modalities.replaceAll('/', '\\');

              const isValidModeCheck = mode.isValidMode({
                modalities: modalitiesToCheck,
                study,
              });
              const isValidMode = isValidModeCheck === !!isValidModeCheck;
              const query = new URLSearchParams();
              if (filterValues.configUrl) {
                query.append('configUrl', filterValues.configUrl);
              }
              query.append('StudyInstanceUIDs', studyInstanceUid);
              return (
                mode.displayName && (
                  <Link
                    className={isValidMode ? '' : 'cursor-not-allowed'}
                    key={i}
                    to={`${dataPath ? '../../' : ''}${
                      mode.routeName
                    }${dataPath || ''}?${query.toString()}`}
                    onClick={event => {
                      if (!isValidMode) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <LegacyButton
                      rounded="full"
                      variant={isValidMode ? 'contained' : 'disabled'}
                      disabled={!isValidMode}
                      endIcon={<Icon name="launch-arrow" />}
                      onClick={() => {}}
                    >
                      {t(`${mode.displayName}`)}
                    </LegacyButton>
                  </Link>
                )
              );
            })}
          </div>
        </StudyListExpandedRow>
      ),
      onClickRow: () => {
        const modes = appConfig.loadedModes || [];
        const basicViewerMode = modes.find(m => m.routeName === 'viewer');
        const mrViewerMode = modes.find(m => m.routeName === 'mr-viewer');
        const mgViewerMode = modes.find(m => m.routeName === 'mg-viewer');

        const modalitiesToCheck = String(modalities || '').replaceAll('/', '\\');
        const hasMR = modalitiesToCheck
          .split('\\')
          .some(m => m.trim().toUpperCase() === 'MR');

        const hasMG = modalitiesToCheck
          .split('\\')
          .some(m => m.trim().toUpperCase() === 'MG');

        const targetMode = hasMR
          ? mrViewerMode
          : hasMG
          ? mgViewerMode
          : basicViewerMode;

        if (!targetMode) {
          uiNotificationService.show({
            title: t('Mode not found'),
            message: t('Cannot find a suitable viewer mode'),
            type: 'error',
          });
          return;
        }

        const isValidMode =
          typeof targetMode.isValidMode === 'function'
            ? !!targetMode.isValidMode({
                modalities: modalitiesToCheck,
                study,
              })
            : true;

        if (!isValidMode) {
          uiNotificationService.show({
            title: t('Invalid mode'),
            message: hasMR
              ? t('Cannot open the study in MR Viewer')
              : t('Cannot open the study in basic Viewer'),
            type: 'error',
          });
          return;
        }

        navigate(
          `/${targetMode.routeName}?StudyInstanceUIDs=${studyInstanceUid}`
        );
      },
      isExpanded,
      onClickDelete: e => {
        e.stopPropagation();
        uiModalService.show({
          title: t('Delete study'),
          containerDimensions: 'w-96',
          content: () => (
            <DeleteStudyMenu
              deleteAllSeriesLabel={t(
                'Are you sure you wish to delete all Zview reports?'
              )}
              deleteStudyLabel={t(
                'Are you sure you wish to delete this study?'
              )}
              onConfirmDeleteAllSeries={(e) => handleConfirmDeleteAllSeries(e, studyInstanceUid)}
              onConfirmDeleteStudy={handleConfirmDeleteStudy}
              onCancel={handleCancelDelete}
            />
          ),
        });
      },
    };
  });

  const hasStudies = numOfStudies > 0;
  const versionNumber = process.env.VERSION_NUMBER;
  const commitHash = process.env.COMMIT_HASH;

  const menuOptions = useMemo(() => {
    const base = [
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
            title: t('UserPreferencesModal:User Preferences'),
            content: UserPreferences,
            contentProps: {
              hotkeyDefaults:
                hotkeysManager.getValidHotkeyDefinitions(hotkeyDefaults),
              hotkeyDefinitions,
              onCancel: hide,
              currentLanguage: currentLanguage(),
              availableLanguages,
              defaultLanguage,
              onSubmit: state => {
                i18n.changeLanguage(state.language.value);
                hotkeysManager.setHotkeys(state.hotkeyDefinitions);
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

    if (isAdmin) {
      base.unshift({
        title: t('Common:AdminPanelTitle'),
        icon: 'info-action',
        onClick: () =>
          show({
            content: AdminModal,
            title: t('Common:AdminPanelTitle'),
          }),
      });
    }
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, t]);

  if (appConfig.oidc) {
    menuOptions.push({
      icon: 'power-off',
      title: t('Header:Logout'),
      onClick: () => {
        navigate(
          `/logout?redirect_uri=${encodeURIComponent(window.location.href)}`
        );
      },
    });
  }

  const { customizationService } = servicesManager.services;
  const { component: dicomUploadComponent } =
    customizationService.get('dicomUploadComponent') ?? {};
  const uploadTitle = t('Upload files');
  const uploadProps =
    dicomUploadComponent && dataSource.getConfig()?.dicomUploadEnabled
      ? {
          title: uploadTitle,
          closeButton: true,
          shouldCloseOnEsc: false,
          shouldCloseOnOverlayClick: false,
          content: dicomUploadComponent.bind(null, {
            dataSource,
            onComplete: () => {
              hide();
              onRefresh();
            },
            onStarted: () => {
              show({
                ...uploadProps,
                closeButton: false,
              });
            },
          }),
        }
      : undefined;

  const { component: dataSourceConfigurationComponent } =
    customizationService.get('ohif.dataSourceConfigurationComponent') ?? {};

  return (
    <div className="bg-black h-screen flex flex-col ">
      <Header
        isSticky
        menuOptions={menuOptions}
        isReturnEnabled={false}
        WhiteLabeling={appConfig.whiteLabeling}
        showPatientInfo={PatientInfoVisibility.DISABLED}
        servicesManager={servicesManager}
      />
      <div className="overflow-y-auto ohif-scrollbar flex flex-col grow">
        <StudyListFilter
          numOfStudies={numOfStudies}
          filtersMeta={filtersMeta}
          filterValues={{ ...filterValues, ...defaultSortValues }}
          onChange={setFilterValues}
          clearFilters={() => setFilterValues(defaultFilterValues)}
          isFiltering={isFiltering(filterValues, defaultFilterValues)}
          onUploadClick={uploadProps ? () => show(uploadProps) : undefined}
          getDataSourceConfigurationComponent={
            dataSourceConfigurationComponent
              ? () => dataSourceConfigurationComponent()
              : undefined
          }
        />
        {hasStudies ? (
          <div className="grow flex flex-col">
            <StudyListTable
              tableDataSource={tableDataSource}
              numOfStudies={numOfStudies}
              querying={querying}
              filtersMeta={filtersMeta}
            />
            <div className="grow">
              <StudyListPagination
                onChangePage={onPageNumberChange}
                onChangePerPage={onResultsPerPageChange}
                currentPage={pageNumber}
                perPage={resultsPerPage}
                pages={pages}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center pt-48">
            {appConfig.showLoadingIndicator && isLoadingData ? (
              <LoadingIndicatorProgress className={'w-full h-full bg-black'} />
            ) : (
              <EmptyStudies isLoadingError={isLoadingError} getData={getData} />
            )}
          </div>
        )}
      </div>
      <Feedback
        email={userEmail}
        apiKey="f93c4e9eb0094e9c13317eaa1925cb0a"
      />
    </div>
  );
}

WorkSheet.propTypes = {
  data: PropTypes.array.isRequired,
  dataSource: PropTypes.shape({
    query: PropTypes.object.isRequired,
    getConfig: PropTypes.func,
  }).isRequired,
  isLoadingData: PropTypes.bool.isRequired,
  servicesManager: PropTypes.instanceOf(ServicesManager),
};

const defaultFilterValues = {
  patientName: '',
  mrn: '',
  studyDate: {
    startDate: null,
    endDate: null,
  },
  description: '',
  modalities: [],
  accession: '',
  sortBy: '',
  sortDirection: 'none',
  pageNumber: 1,
  resultsPerPage: 25,
  datasources: '',
  configUrl: null,
};

function _tryParseInt(str, defaultValue) {
  let retValue = defaultValue;
  if (str && str.length > 0) {
    if (!isNaN(str as any)) {
      retValue = parseInt(str);
    }
  }
  return retValue;
}

function _getQueryFilterValues(params) {
  const queryFilterValues: any = {
    patientName: params.get('patientname'),
    mrn: params.get('mrn'),
    studyDate: {
      startDate: params.get('startdate') || null,
      endDate: params.get('enddate') || null,
    },
    description: params.get('description'),
    modalities: params.get('modalities')
      ? params.get('modalities').split(',')
      : [],
    accession: params.get('accession'),
    sortBy: params.get('sortby'),
    sortDirection: params.get('sortdirection'),
    pageNumber: _tryParseInt(params.get('pageNumber'), undefined),
    resultsPerPage: _tryParseInt(params.get('resultsperpage'), undefined),
    datasources: params.get('datasources'),
    configUrl: params.get('configurl'),
  };

  Object.keys(queryFilterValues).forEach(
    key => queryFilterValues[key] == null && delete queryFilterValues[key]
  );

  return queryFilterValues;
}

function _sortStringDates(s1, s2, sortModifier) {
  const s1Date = moment(s1.date, ['YYYYMMDD', 'YYYY.MM.DD'], true);
  const s2Date = moment(s2.date, ['YYYYMMDD', 'YYYY.MM.DD'], true);

  if (s1Date.isValid() && s2Date.isValid()) {
    return (
      (s1Date.toISOString() > s2Date.toISOString() ? 1 : -1) * sortModifier
    );
  } else if (s1Date.isValid()) {
    return sortModifier;
  } else if (s2Date.isValid()) {
    return -1 * sortModifier;
  }
}

export default WorkSheet;
