import { StudyList } from './../../../../platform/core/src/types/StudyList';
import { api } from 'dicomweb-client';
import axios, { AxiosRequestConfig } from 'axios';
import {
  DicomMetadataStore,
  IWebApiDataSource,
  utils,
  errorHandler,
  classes,
} from '@ohif/core';

import * as Types from '../Types';

import {
  mapParams,
  search as qidoSearch,
  seriesInStudy,
  processResults,
  processSeriesResults,
} from './qido.js';
import dcm4cheeReject from './dcm4cheeReject';

import getImageId from './utils/getImageId';
import dcmjs from 'dcmjs';
import {
  retrieveStudyMetadata,
  deleteStudyMetadataPromise,
} from './retrieveStudyMetadata.js';
import StaticWadoClient from './utils/StaticWadoClient';
import getDirectURL from '../utils/getDirectURL';
import { fixBulkDataURI } from './utils/fixBulkDataURI';
import { sortStudies } from './utils/prepStudies';

import AuthService from '../../../../platform/app/src/services/AuthService';

const { DicomMetaDictionary, DicomDict } = dcmjs.data;
const { naturalizeDataset, denaturalizeDataset } = DicomMetaDictionary;

const ImplementationClassUID =
  '2.25.270695996825855179949881587723571202391.2.0.0';
const ImplementationVersionName = 'OHIF-VIEWER-2.0.0';
const EXPLICIT_VR_LITTLE_ENDIAN = '1.2.840.10008.1.2.1';

const metadataProvider = classes.MetadataProvider;

axios.interceptors.request.use(config => {
  const auth = AuthService.getAuthorizationHeader();
  config.headers = { ...(config.headers || {}), ...auth };
  return config;
});

type SimpleMessageResponse = { message: string };

/**
 *
 * @param {string} name - Data source name
 * @param {string} wadoUriRoot - Legacy? (potentially unused/replaced)
 * @param {string} qidoRoot - Base URL to use for QIDO requests
 * @param {string} wadoRoot - Base URL to use for WADO requests
 * @param {boolean} qidoSupportsIncludeField - Whether QIDO supports the "Include" option to request additional fields in response
 * @param {string} imageRengering - wadors | ? (unsure of where/how this is used)
 * @param {string} thumbnailRendering - wadors | ? (unsure of where/how this is used)
 * @param {bool} supportsReject - Whether the server supports reject calls (i.e. DCM4CHEE)
 * @param {bool} lazyLoadStudy - "enableStudyLazyLoad"; Request series meta async instead of blocking
 * @param {string|bool} singlepart - indicates of the retrieves can fetch singlepart. Options are bulkdata, video, image or boolean true
 */
function createDicomWebApi(dicomWebConfig, servicesManager) {
  const { customizationService } = servicesManager.services;

  let dicomWebConfigCopy,
    qidoConfig,
    wadoConfig,
    qidoDicomWebClient,
    wadoDicomWebClient,
    getAuthrorizationHeader,
    generateWadoHeader;

  console.log(dicomWebConfig.backendUrl);

  const implementation = {
    initialize: ({ params, query }) => {
      if (
        dicomWebConfig.onConfiguration &&
        typeof dicomWebConfig.onConfiguration === 'function'
      ) {
        dicomWebConfig = dicomWebConfig.onConfiguration(dicomWebConfig, {
          params,
          query,
        });
      }

      dicomWebConfigCopy = JSON.parse(JSON.stringify(dicomWebConfig));

      getAuthrorizationHeader = () => {
        return AuthService.getAuthorizationHeader();
      };

      generateWadoHeader = () => {
        const authorizationHeader = getAuthrorizationHeader();
        const formattedAcceptHeader = utils.generateAcceptHeader(
          dicomWebConfig.acceptHeader,
          dicomWebConfig.requestTransferSyntaxUID,
          dicomWebConfig.omitQuotationForMultipartRequest
        );

        return {
          ...authorizationHeader,
          Accept: formattedAcceptHeader,
        };
      };

      qidoConfig = {
        url: dicomWebConfig.qidoRoot,
        staticWado: dicomWebConfig.staticWado,
        singlepart: dicomWebConfig.singlepart,
        headers: AuthService.getAuthorizationHeader(),
        errorInterceptor: errorHandler.getHTTPErrorHandler(),
      };

      wadoConfig = {
        url: dicomWebConfig.wadoRoot,
        staticWado: dicomWebConfig.staticWado,
        singlepart: dicomWebConfig.singlepart,
        headers: AuthService.getAuthorizationHeader(),
        errorInterceptor: errorHandler.getHTTPErrorHandler(),
      };

      qidoDicomWebClient = dicomWebConfig.staticWado
        ? new StaticWadoClient(qidoConfig)
        : new api.DICOMwebClient(qidoConfig);

      wadoDicomWebClient = dicomWebConfig.staticWado
        ? new StaticWadoClient(wadoConfig)
        : new api.DICOMwebClient(wadoConfig);
    },

    query: {
      studies: {
        mapParams: mapParams.bind(),

        search: async function (origParams) {
          const headers = getAuthrorizationHeader();
          qidoDicomWebClient.headers = headers;

          let results = [];
          let response;

          const uploadedAtByUid = new Map();
          const isProcessedByUid = new Map();

          const hasBackendSearchFilters =
            !!origParams.startDate ||
            !!origParams.endDate ||
            !!origParams.patientId ||
            !!origParams.studyDate ||
            !!origParams.studyTime ||
            (Array.isArray(origParams.modalitiesInStudy) &&
              origParams.modalitiesInStudy.length > 0);

          const normalizeStudiesPayload = payload => {
            if (Array.isArray(payload)) {
              return payload;
            }

            if (Array.isArray(payload?.studies)) {
              return payload.studies;
            }

            if (Array.isArray(payload?.items)) {
              return payload.items;
            }

            if (Array.isArray(payload?.results)) {
              return payload.results;
            }

            return [];
          };

          const toStudyUid = item => {
            if (typeof item === 'string') {
              return item;
            }

            return (
              item?.study_instance_uid ||
              item?.studyInstanceUid ||
              item?.uid ||
              null
            );
          };

          const fillMetaMaps = items => {
            items.forEach(item => {
              const uid = toStudyUid(item);

              if (!uid || typeof item !== 'object') {
                return;
              }

              if (item.created_at) {
                uploadedAtByUid.set(uid, item.created_at);
              }

              if (typeof item.is_processed !== 'undefined') {
                isProcessedByUid.set(uid, item.is_processed);
              }
            });
          };

          const stripBackendOnlyFilters = params => {
            if (!params) {
              return {};
            }

            const {
              startDate,
              endDate,
              patientId,
              studyDate,
              studyTime,
              modalitiesInStudy,
              pageNumber,
              resultsPerPage,
              ...rest
            } = params;

            return {
              ...rest,
              pageNumber,
              resultsPerPage,
            };
          };

          if (origParams.me) {
            const head = {
              ...headers,
              'Content-Type': 'application/json',
            };

            let studyRefs = [];
            let pages = 1;
            let size = origParams.resultsPerPage || 25;
            let total = 0;

            if (hasBackendSearchFilters) {
              const searchParams = new URLSearchParams();

              if (origParams.startDate) {
                searchParams.append('start_date', origParams.startDate);
              }

              if (origParams.endDate) {
                searchParams.append('end_date', origParams.endDate);
              }

              if (origParams.patientId) {
                searchParams.append('patient_id', origParams.patientId);
              }

              if (origParams.studyDate) {
                searchParams.append('study_date', origParams.studyDate);
              }

              if (origParams.studyTime) {
                searchParams.append('study_time', origParams.studyTime);
              }

              if (Array.isArray(origParams.modalitiesInStudy)) {
                origParams.modalitiesInStudy.forEach(modality => {
                  if (modality) {
                    searchParams.append('modality', modality);
                  }
                });
              }

              const searchUrl =
                `${dicomWebConfig.backendUrl}` +
                `${dicomWebConfig.personalAccountUri}` +
                `/api/studies/search?${searchParams.toString()}`;

              response = await axios.get(searchUrl, { headers: head });

              const rawItems = normalizeStudiesPayload(response.data);
              fillMetaMaps(rawItems);

              total = response.data?.total ?? rawItems.length;
              size = response.data?.size ?? size;
              pages =
                response.data?.pages ??
                Math.max(1, Math.ceil((total || 0) / size));

              const isBackendPaginated =
                response.data?.pages != null ||
                response.data?.size != null ||
                response.data?.total != null;

              const currentPage = origParams.pageNumber || 1;
              const startIndex = (currentPage - 1) * size;
              const endIndex = startIndex + size;

              studyRefs = isBackendPaginated
                ? rawItems
                : rawItems.slice(startIndex, endIndex);
            } else {
              const config = {
                method: 'get',
                url:
                  dicomWebConfig.backendUrl +
                  dicomWebConfig.personalAccountUri +
                  '/api/studies/',
                headers: head,
                params: {
                  page: origParams.pageNumber,
                  size: origParams.resultsPerPage,
                  asc: 0,
                },
              };

              response = await axios(config);

              const rawItems = response.data?.studies || [];
              fillMetaMaps(rawItems);

              studyRefs = rawItems;
              total = response.data?.total ?? rawItems.length;
              size = response.data?.size ?? size;
              pages = response.data?.pages ?? 1;
            }

            const studyInstanceUidList = studyRefs
              .map(toStudyUid)
              .filter(Boolean);

            if (studyInstanceUidList.length === 0) {
              return {
                studies: [],
                pages,
                size,
                total,
              };
            }

            const qidoBaseParams = hasBackendSearchFilters
              ? stripBackendOnlyFilters(origParams)
              : origParams;

            const qidoParams = {
              ...qidoBaseParams,
              studyInstanceUid: studyInstanceUidList,
              pageNumber: 1,
              resultsPerPage: studyInstanceUidList.length,
            };

            const {
              studyInstanceUid,
              seriesInstanceUid,
              ...mappedParams
            } =
              mapParams(qidoParams, {
                supportsFuzzyMatching: dicomWebConfig.supportsFuzzyMatching,
                supportsWildcard: dicomWebConfig.supportsWildcard,
              }) || {};

            results = await qidoSearch(
              qidoDicomWebClient,
              undefined,
              undefined,
              mappedParams
            );

            const finalStudies = processResults(results);

            finalStudies.forEach(el => {
              const uid = el.studyInstanceUid;
              el.uploadedAt = uploadedAtByUid.get(uid);
              el.isProcessed = isProcessedByUid.get(uid);
            });

            return {
              studies: sortStudies(finalStudies),
              pages,
              size,
              total,
            };
          }

          const {
            studyInstanceUid,
            seriesInstanceUid,
            ...mappedParams
          } =
            mapParams(origParams, {
              supportsFuzzyMatching: dicomWebConfig.supportsFuzzyMatching,
              supportsWildcard: dicomWebConfig.supportsWildcard,
            }) || {};

          results = await qidoSearch(
            qidoDicomWebClient,
            undefined,
            undefined,
            mappedParams
          );

          return processResults(results);
        },

        delete: async function (studyInstanceUid: string) {
          const headers = getAuthrorizationHeader();
          qidoDicomWebClient.headers = headers;

          const head = {
            ...headers,
            'Content-Type': 'application/json',
          };

          const body = JSON.stringify([
            {
              study_instance_uid: studyInstanceUid,
            },
          ]);

          const config: AxiosRequestConfig = {
            method: 'delete',
            url:
              dicomWebConfig.backendUrl +
              dicomWebConfig.personalAccountUri +
              '/api/studies/',
            headers: head,
            data: body,
          };

          await axios(config);
        },

        processResults: processResults.bind(),
      },

      series: {
        search: async function (studyInstanceUid) {
          qidoDicomWebClient.headers = getAuthrorizationHeader();

          const results = await seriesInStudy(
            qidoDicomWebClient,
            studyInstanceUid
          );

          return processSeriesResults(results);
        },

        delete: async function (seriesInstanceUID) {
          const headers = getAuthrorizationHeader();
          qidoDicomWebClient.headers = headers;

          const head = {
            ...headers,
            'Content-Type': 'application/json',
          };

          const config: AxiosRequestConfig = {
            method: 'delete',
            url:
              dicomWebConfig.backendUrl +
              dicomWebConfig.personalAccountUri +
              `/api/studies/${seriesInstanceUID}`,
            headers: head,
          };

          await axios(config);
        },
      },

      instances: {
        search: (studyInstanceUid, queryParameters) => {
          qidoDicomWebClient.headers = getAuthrorizationHeader();
          return qidoSearch.call(
            undefined,
            qidoDicomWebClient,
            studyInstanceUid,
            null,
            queryParameters
          );
        },
      },
    },

    retrieve: {
      directURL: params => {
        return getDirectURL(
          {
            wadoRoot: dicomWebConfig.wadoRoot,
            singlepart: dicomWebConfig.singlepart,
          },
          params
        );
      },

      bulkDataURI: async ({ StudyInstanceUID, BulkDataURI }) => {
        qidoDicomWebClient.headers = getAuthrorizationHeader();

        const options = {
          multipart: false,
          BulkDataURI,
          StudyInstanceUID,
        };

        return qidoDicomWebClient.retrieveBulkData(options).then(val => {
          const ret = (val && val[0]) || undefined;
          return ret;
        });
      },

      series: {
        metadata: async ({
          StudyInstanceUID,
          filters,
          sortCriteria,
          sortFunction,
          madeInClient = false,
          getMetadataFromServer = false,
        } = {}) => {
          if (!StudyInstanceUID) {
            throw new Error(
              'Unable to query for SeriesMetadata without StudyInstanceUID'
            );
          }

          if (dicomWebConfig.enableStudyLazyLoad) {
            return implementation._retrieveSeriesMetadataAsync(
              StudyInstanceUID,
              filters,
              sortCriteria,
              sortFunction,
              madeInClient,
              getMetadataFromServer
            );
          }

          return implementation._retrieveSeriesMetadataSync(
            StudyInstanceUID,
            filters,
            sortCriteria,
            sortFunction,
            madeInClient
          );
        },
      },
    },

    store: {
      dicom: async (dataset, request) => {
        const blob = new Blob([dataset], { type: 'application/dicom' });
        const formData = new FormData();
        formData.append('files', blob, 'filename.dcm');

        wadoDicomWebClient.headers = getAuthrorizationHeader();

        if (dataset instanceof ArrayBuffer) {
          const options = {
            datasets: [dataset],
            request,
          };

          return (function () {
            const headers = {
              ...getAuthrorizationHeader(),
              'Content-Type': 'application/json',
            };

            return axios.post(
              dicomWebConfig.backendUrl +
                dicomWebConfig.personalAccountUri +
                '/api/studies/',
              formData,
              { headers }
            );
          })();
        } else {
          const meta = {
            FileMetaInformationVersion:
              dataset._meta.FileMetaInformationVersion.Value,
            MediaStorageSOPClassUID: dataset.SOPClassUID,
            MediaStorageSOPInstanceUID: dataset.SOPInstanceUID,
            TransferSyntaxUID: EXPLICIT_VR_LITTLE_ENDIAN,
            ImplementationClassUID,
            ImplementationVersionName,
          };

          const denaturalized = denaturalizeDataset(meta);
          const dicomDict = new DicomDict(denaturalized);
          dicomDict.dict = denaturalizeDataset(dataset);

          const part10Buffer = dicomDict.write();

          const options = {
            datasets: [part10Buffer],
            request,
          };

          return wadoDicomWebClient.storeInstances(options).then(function (
            response
          ) {
            console.log('@@@@@@@@@@@@@ upload to me');
            console.log(response);

            const headers = getAuthrorizationHeader();
            headers['Content-Type'] = 'application/json';

            const json = JSON.stringify({
              study_instance_uid:
                studyInfo.data.MainDicomTags.StudyInstanceUID,
            });

            return axios.post(
              dicomWebConfig.personalAccountUri + '/api/studies/',
              json,
              { headers }
            );
          });
        }
      },
    },

    _retrieveSeriesMetadataSync: async (
      StudyInstanceUID,
      filters,
      sortCriteria,
      sortFunction,
      madeInClient
    ) => {
      const enableStudyLazyLoad = false;
      wadoDicomWebClient.headers = generateWadoHeader();

      const data = await retrieveStudyMetadata(
        wadoDicomWebClient,
        StudyInstanceUID,
        enableStudyLazyLoad,
        filters,
        sortCriteria,
        sortFunction
      );

      const naturalizedInstancesMetadata = data.map(naturalizeDataset);

      const seriesSummaryMetadata = {};
      const instancesPerSeries = {};

      naturalizedInstancesMetadata.forEach(instance => {
        if (!seriesSummaryMetadata[instance.SeriesInstanceUID]) {
          seriesSummaryMetadata[instance.SeriesInstanceUID] = {
            StudyInstanceUID: instance.StudyInstanceUID,
            StudyDescription: instance.StudyDescription,
            SeriesInstanceUID: instance.SeriesInstanceUID,
            SeriesDescription: instance.SeriesDescription,
            SeriesNumber: instance.SeriesNumber,
            SeriesTime: instance.SeriesTime,
            SOPClassUID: instance.SOPClassUID,
            ProtocolName: instance.ProtocolName,
            Modality: instance.Modality,
          };
        }

        if (!instancesPerSeries[instance.SeriesInstanceUID]) {
          instancesPerSeries[instance.SeriesInstanceUID] = [];
        }

        const imageId = implementation.getImageIdsForInstance({
          instance,
        });

        instance.imageId = imageId;

        metadataProvider.addImageIdToUIDs(imageId, {
          StudyInstanceUID,
          SeriesInstanceUID: instance.SeriesInstanceUID,
          SOPInstanceUID: instance.SOPInstanceUID,
        });

        instancesPerSeries[instance.SeriesInstanceUID].push(instance);
      });

      const seriesMetadata = Object.values(seriesSummaryMetadata);
      DicomMetadataStore.addSeriesMetadata(seriesMetadata, madeInClient);

      Object.keys(instancesPerSeries).forEach(seriesInstanceUID =>
        DicomMetadataStore.addInstances(
          instancesPerSeries[seriesInstanceUID],
          madeInClient
        )
      );
    },

    admin: {
      assignPermissions: async (
        userId: number,
        permissions: number
      ): Promise<SimpleMessageResponse> => {
        const url =
          dicomWebConfig.domain +
          dicomWebConfig.personalAccountUri +
          '/auth/assign-permissions';

        const headers = {
          ...getAuthrorizationHeader(),
          'Content-Type': 'application/json',
        };

        try {
          const { data } = await axios.post<SimpleMessageResponse>(
            url,
            { user_id: userId, permissions },
            { headers }
          );
          return data;
        } catch (e: any) {
          if (axios.isAxiosError(e) && e.response) {
            const { status, data } = e.response as {
              status: number;
              data?: any;
            };

            if (status === 403) {
              throw new Error('403: нет прав ADMIN');
            }

            if (status === 404) {
              throw new Error('404: пользователь не найден');
            }

            throw new Error(`${status}: ${data?.message || 'Ошибка запроса'}`);
          }

          throw e;
        }
      },

      updatePassword: async (
        userId: number,
        newPassword: string
      ): Promise<SimpleMessageResponse> => {
        const url =
          dicomWebConfig.domain +
          dicomWebConfig.personalAccountUri +
          '/auth/update-password';

        const headers = {
          ...getAuthrorizationHeader(),
          'Content-Type': 'application/json',
        };

        try {
          const { data } = await axios.post<SimpleMessageResponse>(
            url,
            { user_id: userId, new_password: newPassword },
            { headers }
          );
          return data;
        } catch (e: any) {
          if (axios.isAxiosError(e) && e.response) {
            const { status, data } = e.response as {
              status: number;
              data?: any;
            };

            if (status === 403) {
              throw new Error('403: нет прав ADMIN');
            }

            if (status === 404) {
              throw new Error('404: пользователь не найден');
            }

            throw new Error(`${status}: ${data?.message || 'Ошибка запроса'}`);
          }

          throw e;
        }
      },
    },

    _retrieveSeriesMetadataAsync: async (
      StudyInstanceUID,
      filters,
      sortCriteria,
      sortFunction,
      madeInClient = false,
      getMetadataFromServer = false
    ) => {
      const enableStudyLazyLoad = true;
      wadoDicomWebClient.headers = generateWadoHeader();

      const { preLoadData: seriesSummaryMetadata, promises: seriesPromises } =
        await retrieveStudyMetadata(
          wadoDicomWebClient,
          StudyInstanceUID,
          enableStudyLazyLoad,
          filters,
          sortCriteria,
          sortFunction,
          getMetadataFromServer
        );

      const addRetrieveBulkData = instance => {
        const naturalized = naturalizeDataset(instance);

        if (!dicomWebConfig.bulkDataURI?.enabled) {
          return naturalized;
        }

        Object.keys(naturalized).forEach(key => {
          const value = naturalized[key];

          if (value && value.BulkDataURI && !value.Value) {
            value.retrieveBulkData = () => {
              fixBulkDataURI(value, naturalized, dicomWebConfig);

              const options = {
                multipart: false,
                BulkDataURI: value.BulkDataURI,
                StudyInstanceUID: naturalized.StudyInstanceUID,
              };

              return qidoDicomWebClient.retrieveBulkData(options).then(val => {
                const ret =
                  (val instanceof Array &&
                    val.find(arrayBuffer => arrayBuffer?.byteLength)) ||
                  undefined;

                value.Value = ret;
                return ret;
              });
            };
          }
        });

        return naturalized;
      };

      function storeInstances(instances) {
        const naturalizedInstances = instances.map(addRetrieveBulkData);

        naturalizedInstances.forEach((instance, index) => {
          instance.wadoRoot = dicomWebConfig.wadoRoot;
          instance.wadoUri = dicomWebConfig.wadoUri;

          const imageId = implementation.getImageIdsForInstance({
            instance,
          });

          instance.imageId = imageId;

          metadataProvider.addImageIdToUIDs(imageId, {
            StudyInstanceUID,
            SeriesInstanceUID: instance.SeriesInstanceUID,
            SOPInstanceUID: instance.SOPInstanceUID,
          });
        });

        DicomMetadataStore.addInstances(naturalizedInstances, madeInClient);
      }

      function setSuccessFlag() {
        const study = DicomMetadataStore.getStudy(
          StudyInstanceUID,
          madeInClient
        );
        study.isLoaded = true;
      }

      seriesSummaryMetadata.forEach(aSeries => {
        aSeries.StudyInstanceUID = StudyInstanceUID;
      });

      DicomMetadataStore.addSeriesMetadata(seriesSummaryMetadata, madeInClient);

      const seriesDeliveredPromises = seriesPromises.map(promise =>
        promise.then(instances => {
          storeInstances(instances);
        })
      );

      await Promise.all(seriesDeliveredPromises);
      setSuccessFlag();
    },

    deleteStudyMetadataPromise,

    getImageIdsForDisplaySet(displaySet) {
      const images = displaySet.images;
      const imageIds = [];

      if (!images) {
        return imageIds;
      }

      displaySet.images.forEach(instance => {
        const NumberOfFrames = instance.NumberOfFrames;

        if (NumberOfFrames > 1) {
          for (let frame = 1; frame <= NumberOfFrames; frame++) {
            const imageId = this.getImageIdsForInstance({
              instance,
              frame,
            });
            imageIds.push(imageId);
          }
        } else {
          const imageId = this.getImageIdsForInstance({ instance });
          imageIds.push(imageId);
        }
      });

      return imageIds;
    },

    getImageIdsForInstance({ instance, frame }) {
      const imageIds = getImageId({
        instance,
        frame,
        config: dicomWebConfig,
      });

      return imageIds;
    },

    getConfig() {
      return dicomWebConfigCopy;
    },

    getStudyInstanceUIDs({ params, query }) {
      const { StudyInstanceUIDs: paramsStudyInstanceUIDs } = params;
      const queryStudyInstanceUIDs = utils.splitComma(
        query.getAll('StudyInstanceUIDs')
      );

      const StudyInstanceUIDs =
        (queryStudyInstanceUIDs.length && queryStudyInstanceUIDs) ||
        paramsStudyInstanceUIDs;

      const StudyInstanceUIDsAsArray =
        StudyInstanceUIDs && Array.isArray(StudyInstanceUIDs)
          ? StudyInstanceUIDs
          : [StudyInstanceUIDs];

      return StudyInstanceUIDsAsArray;
    },
  };

  if (dicomWebConfig.supportsReject) {
    implementation.reject = dcm4cheeReject(dicomWebConfig.wadoRoot);
  }

  return IWebApiDataSource.create(implementation);
}

export { createDicomWebApi };
