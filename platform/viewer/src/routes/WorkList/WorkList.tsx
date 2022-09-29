import React, { useState, useEffect, useRef, useMemo } from 'react';
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
import { useDebounce, useQuery } from '@hooks';
import { utils, hotkeys } from '@ohif/core';
import Dropzone from 'react-dropzone';

import {
  Icon,
  IconButton,
  StudyListExpandedRow,
  Button,
  EmptyStudies,
  StudyListTable,
  StudyListPagination,
  StudyListFilter,
  TooltipClipboard,
  Header,
  useModal,
  AboutModal,
  UserPreferences,
} from '@ohif/ui';

import i18n from '@ohif/i18n';

const { sortBySeriesDate } = utils;

const { availableLanguages, defaultLanguage, currentLanguage } = i18n;

const seriesInStudiesMap = new Map();

const getLoadButton = (onDrop, text, isDir) => {
  return (
    <Dropzone
      onDrop={onDrop}
      noDrag
      accept="*/dicom, .dcm, image/dcm, */dcm, .dicom, application/zip, application/x-zip-compressed, multipart/x-zip"
    >
      {({ getRootProps, getInputProps }) => (
        <div {...getRootProps()}>
          <Button
            rounded="full"
            size="medium"
            variant="outlined" // mb outlined contained
            disabled={false}
            endIcon={<Icon name="uploadFile" />} // launch-arrow | launch-info
            className={classnames('font-bold', 'ml-2')}
            onClick={() => {}}
          >
            {text}
            {isDir ? (
              <input
                {...getInputProps()}
                webkitdirectory="true"
                mozdirectory="true"
              />
            ) : (
              <input {...getInputProps()} />
            )}
          </Button>
        </div>
      )}
    </Dropzone>
  );
};

/**
 * TODO:
 * - debounce `setFilterValues` (150ms?)
 */
function WorkList({
  data: studies,
  dataTotal: studiesTotal,
  isLoadingData,
  dataSource,
  hotkeysManager,
}) {
  const dropzoneRef = useRef();
  const { hotkeyDefinitions, hotkeyDefaults } = hotkeysManager;
  const { show, hide } = useModal();
  const { t } = useTranslation();
  // ~ Modes
  const [appConfig] = useAppConfig();
  // ~ Filters
  const query = useQuery();
  const navigate = useNavigate();
  const STUDIES_LIMIT = 101;
  const queryFilterValues = _getQueryFilterValues(query);
  const [filterValues, _setFilterValues] = useState({
    ...defaultFilterValues,
    ...queryFilterValues,
  });
  const [countUploadingFiles, setCountUploadinFiles] = useState(0);
  const [countUploadedFiles, setCountUploadedFiles] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);

  const debouncedFilterValues = useDebounce(filterValues, 200);
  const { resultsPerPage, pageNumber, sortBy, sortDirection } = filterValues;

  /*
   * The default sort value keep the filters synchronized with runtime conditional sorting
   * Only applied if no other sorting is specified and there are less than 101 studies
   */

  const canSort = studiesTotal < STUDIES_LIMIT;
  const shouldUseDefaultSort = sortBy === '' || !sortBy;
  const sortModifier = sortDirection === 'descending' ? 1 : -1;
  const defaultSortValues =
    shouldUseDefaultSort && canSort
      ? { sortBy: 'studyDate', sortDirection: 'ascending' }
      : {};
  const sortedStudies = studies;

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

  const setFilterValues = (val) => {
    if (filterValues.pageNumber === val.pageNumber) {
      val.pageNumber = 1;
    }
    _setFilterValues(val);
    setExpandedRows([]);
  };

  const onPageNumberChange = (newPageNumber) => {
    const oldPageNumber = filterValues.pageNumber;
    const rollingPageNumberMod = Math.floor(101 / filterValues.resultsPerPage);
    const rollingPageNumber = oldPageNumber % rollingPageNumberMod;
    const isNextPage = newPageNumber > oldPageNumber;
    const hasNextPage =
      Math.max(rollingPageNumber, 1) * resultsPerPage < numOfStudies;

    if (isNextPage && !hasNextPage) {
      return;
    }

    setFilterValues({ ...filterValues, pageNumber: newPageNumber });
  };

  const onResultsPerPageChange = (newResultsPerPage) => {
    setFilterValues({
      ...filterValues,
      pageNumber: 1,
      resultsPerPage: Number(newResultsPerPage),
    });
  };

  // Set body style
  useEffect(() => {
    document.body.classList.add('bg-black');
    return () => {
      document.body.classList.remove('bg-black');
    };
  }, []);

  // Sync URL query parameters with filters
  useEffect(() => {
    if (!debouncedFilterValues) {
      return;
    }

    const queryString = {};
    Object.keys(defaultFilterValues).forEach((key) => {
      const defaultValue = defaultFilterValues[key];
      const currValue = debouncedFilterValues[key];

      // TODO: nesting/recursion?
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

  // Query for series information
  useEffect(() => {
    const fetchSeries = async (studyInstanceUid) => {
      try {
        const series = await dataSource.query.series.search(studyInstanceUid);
        seriesInStudiesMap.set(studyInstanceUid, sortBySeriesDate(series));
        setStudiesWithSeriesData([...studiesWithSeriesData, studyInstanceUid]);
      } catch (ex) {
        // TODO: UI Notification Service
        console.warn(ex);
      }
    };

    // TODO: WHY WOULD YOU USE AN INDEX OF 1?!
    // Note: expanded rows index begins at 1
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

  const isFiltering = (filterValues, defaultFilterValues) => {
    return !isEqual(filterValues, defaultFilterValues);
  };

  const rollingPageNumberMod = Math.floor(101 / resultsPerPage);
  const rollingPageNumber = (pageNumber - 1) % rollingPageNumberMod;
  const offset = resultsPerPage * rollingPageNumber;
  const offsetAndTake = offset + resultsPerPage;
  const tableDataSource = sortedStudies.map((study, key) => {
    const rowKey = key + 1;
    const isExpanded = expandedRows.some((k) => k === rowKey);
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
    } = study;
    const studyDate =
      date &&
      moment(date, ['YYYYMMDD', 'YYYY.MM.DD'], true).isValid() &&
      moment(date, ['YYYYMMDD', 'YYYY.MM.DD']).format('MMM-DD-YYYY');
    const studyTime =
      time &&
      moment(time, ['HH', 'HHmm', 'HHmmss', 'HHmmss.SSS']).isValid() &&
      moment(time, ['HH', 'HHmm', 'HHmmss', 'HHmmss.SSS']).format('hh:mm A');

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
          gridCol: 3,
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
          key: 'description',
          content: <TooltipClipboard>{description}</TooltipClipboard>,
          gridCol: 4,
        },
        {
          key: 'modality',
          content: modalities,
          title: modalities,
          gridCol: 3,
        },
        {
          key: 'accession',
          content: <TooltipClipboard>{accession}</TooltipClipboard>,
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
      // Todo: This is actually running for all rows, even if they are
      // not clicked on.
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
              ? seriesInStudiesMap.get(studyInstanceUid).map((s) => {
                  return {
                    description: s.description || '(empty)',
                    seriesNumber: s.seriesNumber || '',
                    modality: s.modality || '',
                    instances: s.numSeriesInstances || '',
                  };
                })
              : []
          }
        >
          {appConfig.modes.map((mode, i) => {
            const isFirst = i === 0;

            const isValidMode = mode.isValidMode({ modalities });
            // TODO: Modes need a default/target route? We mostly support a single one for now.
            // We should also be using the route path, but currently are not
            // mode.routeName
            // mode.routes[x].path
            // Don't specify default data source, and it should just be picked up... (this may not currently be the case)
            // How do we know which params to pass? Today, it's just StudyInstanceUIDs
            return (
              <Link
                key={i}
                to={`${mode.routeName}?StudyInstanceUIDs=${studyInstanceUid}`}
                // to={`${mode.routeName}/dicomweb?StudyInstanceUIDs=${studyInstanceUid}`}
              >
                <Button
                  rounded="full"
                  variant={isValidMode ? 'contained' : 'disabled'}
                  disabled={!isValidMode}
                  endIcon={<Icon name="launch-arrow" />} // launch-arrow | launch-info
                  className={classnames('font-bold', 'ml-2')}
                  onClick={() => {}}
                >
                  {t(`Modes:${mode.displayName}`)}
                </Button>
              </Link>
            );
          })}
        </StudyListExpandedRow>
      ),
      onClickRow: () =>
        setExpandedRows((s) =>
          isExpanded ? s.filter((n) => rowKey !== n) : [...s, rowKey]
        ),
      isExpanded,
    };
  });

  const hasStudies = numOfStudies > 0;
  const versionNumber = process.env.VERSION_NUMBER;
  const buildNumber = process.env.BUILD_NUM;

  const menuOptions = [
    {
      title: t('Header:About'),
      icon: 'info',
      onClick: () =>
        show({
          content: AboutModal,
          title: 'About OHIF Viewer',
          contentProps: { versionNumber, buildNumber },
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
            onSubmit: (state) => {
              i18n.changeLanguage(state.language.value);
              hotkeysManager.setHotkeys(state.hotkeyDefinitions);
              hide();
            },
            onReset: () => hotkeysManager.restoreDefaultBindings(),
            hotkeysModule: hotkeys,
          },
        }),
    },
  ];

  const onDrop = async (acceptedFiles) => {
    console.log(acceptedFiles);
    const uploadFile = async (file) => {
      try {
        const response = await dataSource.query.instances.upload(file);
        console.info(`file ${file} uploaded: ${response}`);
      } catch (ex) {
        // TODO: UI Notification Service
        console.warn(ex);
      }
    };

    for (let i = 0; i < acceptedFiles.length; i++) {
      await uploadFile(acceptedFiles[i]);
    }
    navigate({
      pathname: '/',
      search: undefined,
    });
    // const studies = await filesToStudies(acceptedFiles, dataSource)
    // Todo: navigate to work list and let user select a mode
    // navigate(`/viewer/dicomlocal?StudyInstanceUIDs=${studies[0]}`)
  };

  const focusedStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: '#FFFFFF33',
    width: '100vw',
    height: '100vh',
    zIndex: 999,
  };

  return (
    <div>
      {/* {countUploadingFiles == countUploadedFiles &&
      

      } */}
      <Dropzone
        ref={dropzoneRef}
        onDrop={onDrop}
        noClick={true}
        isFocused={true}
        multiple={false}
        accept="*/dicom, .dcm, image/dcm, */dcm, .dicom, application/zip, application/x-zip-compressed, multipart/x-zip"
      >
        {({ getRootProps, getInputProps, isDragActive }) => (
          <div>
            <div
              {...getRootProps()}
              className={classnames('bg-black h-full', {
                'h-screen': !hasStudies,
              })}
            >
              {isDragActive && <div style={focusedStyle}></div>}
              <Header
                primaryChildren={
                  <div>{getLoadButton(onDrop, 'Upload file', false)}</div>
                  // <Button
                  //   rounded="full"
                  //   variant="contained" // outlined
                  //   disabled={false}
                  //   endIcon={<Icon name="launch-arrow" />} // launch-arrow | launch-info
                  //   className={classnames('font-bold', 'ml-2')}
                  //   onClick={() => {open();}}
                  // >
                  //   {/* {text}
                  //   {isDir ? (
                  //     <input
                  //       {...getInputProps()}
                  //       webkitdirectory="true"
                  //       mozdirectory="true"
                  //     />
                  //   ) : ( */}
                  //     <input {...getInputProps()} />
                  //   {/* )} */}
                  // </Button>

                  // <IconButton
                  //   variant="text"
                  //   color="inherit"
                  //   size="initial"
                  //   fullWidth="1"
                  //   className="text-primary-active"
                  //   onClick={() => {}}
                  // >
                  //   <Icon name="uploadFile">
                  //     <input {...getInputProps} />
                  //   </Icon>
                  //   {/* <input {...getInputProps()} /> */}
                  // </IconButton>
                }
                isSticky
                menuOptions={menuOptions}
                isReturnEnabled={false}
                WhiteLabeling={appConfig.whiteLabeling}
              />
              <StudyListFilter
                numOfStudies={
                  pageNumber * resultsPerPage > 100 ? 101 : numOfStudies
                }
                filtersMeta={filtersMeta}
                filterValues={{ ...filterValues, ...defaultSortValues }}
                onChange={setFilterValues}
                clearFilters={() => setFilterValues(defaultFilterValues)}
                isFiltering={isFiltering(filterValues, defaultFilterValues)}
              />
              {hasStudies ? (
                <>
                  <StudyListTable
                    tableDataSource={tableDataSource.slice(
                      offset,
                      offsetAndTake
                    )}
                    numOfStudies={numOfStudies}
                    filtersMeta={filtersMeta}
                  />
                  <StudyListPagination
                    onChangePage={onPageNumberChange}
                    onChangePerPage={onResultsPerPageChange}
                    currentPage={pageNumber}
                    perPage={resultsPerPage}
                  />
                </>
              ) : (
                <div className="flex flex-col items-center justify-center pt-48">
                  <EmptyStudies isLoading={isLoadingData} />
                </div>
              )}
            </div>
          </div>
        )}
      </Dropzone>
    </div>
  );
}

WorkList.propTypes = {
  data: PropTypes.array.isRequired,
  dataSource: PropTypes.shape({
    query: PropTypes.object.isRequired,
  }).isRequired,
  isLoadingData: PropTypes.bool.isRequired,
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
};

function _tryParseInt(str, defaultValue) {
  var retValue = defaultValue;
  if (str !== null) {
    if (str.length > 0) {
      if (!isNaN(str)) {
        retValue = parseInt(str);
      }
    }
  }
  return retValue;
}

function _getQueryFilterValues(query) {
  const queryFilterValues = {
    patientName: query.get('patientName'),
    mrn: query.get('mrn'),
    studyDate: {
      startDate: query.get('startDate'),
      endDate: query.get('endDate'),
    },
    description: query.get('description'),
    modalities: query.get('modalities')
      ? query.get('modalities').split(',')
      : [],
    accession: query.get('accession'),
    sortBy: query.get('sortBy'),
    sortDirection: query.get('sortDirection'),
    pageNumber: _tryParseInt(query.get('pageNumber'), undefined),
    resultsPerPage: _tryParseInt(query.get('resultsPerPage'), undefined),
  };

  // Delete null/undefined keys
  Object.keys(queryFilterValues).forEach(
    (key) => queryFilterValues[key] == null && delete queryFilterValues[key]
  );

  return queryFilterValues;
}

function _sortStringDates(s1, s2, sortModifier) {
  // TODO: Delimiters are non-standard. Should we support them?
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

export default WorkList;
