window.config = {
  routerBasename: '/',
  // whiteLabeling: {},
  extensions: [],
  modes: [],
  customizationService: {
    worksheet: `zmed-common.customizationModule.worksheet`,
    dicomUploadComponent:
      '@ohif/extension-cornerstone.customizationModule.cornerstoneDicomUploadComponent',
  },
  showStudyList: false,
  // some windows systems have issues with more than 3 web workers
  maxNumberOfWebWorkers: 3,
  // below flag is for performance reasons, but it might not work for all servers
  showWarningMessageForCrossOrigin: true,
  showCPUFallbackMessage: true,
  showLoadingIndicator: true,
  strictZSpacingForVolumeViewport: true,
  maxNumRequests: {
    interaction: 100,
    thumbnail: 75,
    // Prefetch number is dependent on the http protocol. For http 2 or
    // above, the number of requests can be go a lot higher.
    prefetch: 25,
  },
  // filterQueryParam: false,
  defaultDataSourceName: 'zmed-dicomweb',
  /* Dynamic config allows user to pass "configUrl" query string this allows to load config without recompiling application. The regex will ensure valid configuration source */
  // dangerouslyUseDynamicConfig: {
  //   enabled: true,
  //   // regex will ensure valid configuration source and default is /.*/ which matches any character. To use this, setup your own regex to choose a specific source of configuration only.
  //   // Example 1, to allow numbers and letters in an absolute or sub-path only.
  //   // regex: /(0-9A-Za-z.]+)(\/[0-9A-Za-z.]+)*/
  //   // Example 2, to restricts to either hosptial.com or othersite.com.
  //   // regex: /(https:\/\/hospital.com(\/[0-9A-Za-z.]+)*)|(https:\/\/othersite.com(\/[0-9A-Za-z.]+)*)/
  //   regex: /.*/,
  // },
  dataSources: [
    {
      namespace: 'zmed-common.dataSourcesModule.zmed-dicomweb',
      sourceName: 'zmed-dicomweb',
      configuration: {
        friendlyName: 'Orthanc Server',
        name: 'Orthanc',
        wadoUriRoot: 'https://atlas.z-union.ru/pacs/wado',
        qidoRoot: 'https://atlas.z-union.ru/pacs/dicom-web',
        wadoRoot: 'https://atlas.z-union.ru/pacs/dicom-web',
        qidoSupportsIncludeField: false,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        omitQuotationForMultipartRequest: true,
        supportsReject: false,
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false,
        supportsWildcard: true,
        staticWado: false,
        singlepart: 'bulkdata,video',
        dicomUploadEnabled: true,
        bulkDataURI: {
          enabled: true,
        },
        personalAccountUri: '/personal',
        domain: 'https://atlas.z-union.ru',
      },
    },
    // {
    //   namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
    //   sourceName: 'zmed-dicomweb',
    //   configuration: {
    //     friendlyName: 'Orthanc Server',
    //     name: 'Orthanc',
    //     wadoUriRoot: 'https://dev-zview.z-union.ru/pacs/wado',
    //     qidoRoot: 'https://dev-zview.z-union.ru/pacs/dicom-web',
    //     wadoRoot: 'https://dev-zview.z-union.ru/pacs/dicom-web',
    //     qidoSupportsIncludeField: false,
    //     imageRendering: 'wadors',
    //     thumbnailRendering: 'wadors',
    //     omitQuotationForMultipartRequest: true,
    //     supportsReject: false,
    //     enableStudyLazyLoad: true,
    //     supportsFuzzyMatching: false,
    //     supportsWildcard: true,
    //     staticWado: false,
    //     singlepart: 'bulkdata,video',
    //     dicomUploadEnabled: true,
    //     bulkDataURI: {
    //       enabled: true,
    //     },
    //     omitQuotationForMultipartRequest: true,
    //   },
    // },
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomjson',
      sourceName: 'dicomjson',
      configuration: {
        friendlyName: 'dicom json',
        name: 'json',
      },
    },
  ],
  httpErrorHandler: error => {
    // This is 429 when rejected from the public idc sandbox too often.
    console.warn(error.status);

    // Could use services manager here to bring up a dialog/modal if needed.
    console.warn('test, navigate to https://atlas.z-union.ru/');
  },
  zmedtools: {
    covidURL: 'https://atlas.z-union.ru/zmedtools/',
    mammoURL: 'https://atlas.z-union.ru/zmedtools/',
    innpolisURL: 'https://atlas.z-union.ru/zmedtools/',
  },
  // This is an array, but we'll only use the first entry for now
  // oidc: [
  //   {
  //     // ~ REQUIRED
  //     // Authorization Server URL
  //     authority: 'https://atlas.z-union.ru/auth/realms/ohif',
  //     client_id: 'ohif-viewer',
  //     redirect_uri: 'https://atlas.z-union.ru/callback', // `OHIFStandaloneViewer.js`
  //     // "Authorization Code Flow"
  //     // Resource: https://medium.com/@darutk/diagrams-of-all-the-openid-connect-flows-6968e3990660
  //     response_type: 'code',
  //     scope: 'openid', // email profile openid
  //     // ~ OPTIONAL
  //     post_logout_redirect_uri: '/logout-redirect.html',
  //   },
  // ],
  whiteLabeling: {
    /* Optional: Should return a React component to be rendered in the "Logo" section of the application's Top Navigation bar */
    createLogoComponentFn: function (React) {
      return React.createElement(
        'a',
        {
          target: '_self',
          rel: 'noopener noreferrer',
          className: 'text-purple-600 line-through',
          href: '/',
        },
        React.createElement('img', {
          src: './zmed-logo.svg',
          // className: 'w-8 h-8',
        })
      );
    },
  },
  sortDisplaySets: {
    getZmedDisplaySetSortFunction: function (protocol) {
      return (a, b) => {
        const aModality = a.Modality;
        const bModality = b.Modality;
        const aDate = a.SeriesDate !== undefined ? Number(a.SeriesDate) : -Infinity;
        const aTime = a.SeriesTime !== undefined ? Number(a.SeriesTime) : -Infinity;
        const bDate = b.SeriesDate !== undefined ? Number(b.SeriesDate) : -Infinity;
        const bTime = b.SeriesTime !== undefined ? Number(b.SeriesTime) : -Infinity;

        switch (protocol.id) {
          case 'default': {
            // 1. Сортировка по модальности: 'OT' и 'SR' в конец
            if (aModality !== 'OT' && aModality !== 'SR') {
              return -1;
            } else if (bModality !== 'OT' && bModality !== 'SR') {
              return 1;
            }

            // 2. Сортировка по дате
            if (aDate < bDate) {
              return 1;
            } else if (aDate > bDate) {
              return -1;
            }

            // 3. Сортировка по времени
            if (aTime < bTime) {
              return 1;
            } else if (aTime > bTime) {
              return -1;
            }

            // 4. Сортировка по описанию
            return b.SeriesDescription.localeCompare(a.SeriesDescription);
          }
          case '@zmed/mammo': {
            const order = {
              'R-MLO': 0,
              'L-MLO': 1,
              'R-CC': 2,
              'L-CC': 3,
            };

            const aImageLaterality =
              a.instance.ImageLaterality ?? a.getReferenceDisplaySet().instance.ImageLaterality;
            const bImageLaterality =
              b.instance.ImageLaterality ?? b.getReferenceDisplaySet().instance.ImageLaterality;
            const aViewPosition =
              a.instance.ViewPosition ?? a.getReferenceDisplaySet().instance.ViewPosition;
            const bViewPosition =
              b.instance.ViewPosition ?? b.getReferenceDisplaySet().instance.ViewPosition;

            const normalizeViewPosition = viewPosition =>
              viewPosition === 'ML' ? 'MLO' : viewPosition;

            const aKey = `${aImageLaterality}-${normalizeViewPosition(aViewPosition)}`;
            const bKey = `${bImageLaterality}-${normalizeViewPosition(bViewPosition)}`;

            const sortValue =
              order[aKey] - order[bKey] >= 1 ? 1 : order[aKey] - order[bKey] <= -1 ? -1 : 0;

            return sortValue;
          }
          default: {
            return 0;
          }
        }
      };
    },
  },
  hotkeys: [
    {
      commandName: 'changeStageByIndex',
      commandOptions: { protocolId: '@zmed/mammo', stageIndex: 0 },
      label: 'MLO/CC',
      keys: ['1'],
      isEditable: true,
    },
    {
      commandName: 'changeStageByIndex',
      commandOptions: { protocolId: '@zmed/mammo', stageIndex: 1 },
      label: 'RMLO/RCC',
      keys: ['2'],
      isEditable: true,
    },
    {
      commandName: 'changeStageByIndex',
      commandOptions: { protocolId: '@zmed/mammo', stageIndex: 2 },
      label: 'LMLO/LCC',
      keys: ['3'],
      isEditable: true,
    },
    {
      commandName: 'changeStageByIndex',
      commandOptions: { protocolId: '@zmed/mammo', stageIndex: 3 },
      label: 'MLO',
      keys: ['4'],
      isEditable: true,
    },
    {
      commandName: 'changeStageByIndex',
      commandOptions: { protocolId: '@zmed/mammo', stageIndex: 4 },
      label: 'CC',
      keys: ['5'],
      isEditable: true,
    },
    {
      commandName: 'changeStageByIndex',
      commandOptions: { protocolId: '@zmed/mammo', stageIndex: 5 },
      label: 'RMLO',
      keys: ['6'],
      isEditable: true,
    },
    {
      commandName: 'changeStageByIndex',
      commandOptions: { protocolId: '@zmed/mammo', stageIndex: 6 },
      label: 'RCC',
      keys: ['7'],
      isEditable: true,
    },
    {
      commandName: 'changeStageByIndex',
      commandOptions: { protocolId: '@zmed/mammo', stageIndex: 7 },
      label: 'LMLO',
      keys: ['8'],
      isEditable: true,
    },
    {
      commandName: 'changeStageByIndex',
      commandOptions: { protocolId: '@zmed/mammo', stageIndex: 8 },
      label: 'LCC',
      keys: ['9'],
      isEditable: true,
    },
  ],
};
