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
        wadoUriRoot: 'https://zview.z-union.ru/pacs/wado',
        qidoRoot: 'https://zview.z-union.ru/pacs/dicom-web',
        wadoRoot: 'https://zview.z-union.ru/pacs/dicom-web',
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
        backendUrl: 'https://zview.z-union.ru',
        domain: 'https://zview.z-union.ru',
      },
    },
    // {
    //   namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
    //   sourceName: 'zmed-dicomweb',
    //   configuration: {
    //     friendlyName: 'Orthanc Server',
    //     name: 'Orthanc',
    //     wadoUriRoot: 'https://zview.z-union.ru/pacs/wado',
    //     qidoRoot: 'https://zview.z-union.ru/pacs/dicom-web',
    //     wadoRoot: 'https://zview.z-union.ru/pacs/dicom-web',
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
    console.warn('test, navigate to https://zview.z-union.ru/');
  },
  zmedtools: {
    covidURL: 'https://zview.z-union.ru/zmedtools/',
    mammoURL: 'https://zview.z-union.ru/zmedtools/',
    innpolisURL: 'https://zview.z-union.ru/zmedtools/',
    mrURL: 'https://zview.z-union.ru/mrtools/',
    mgURL: 'https://zview.z-union.ru/mgtools/',
    personalURL: 'https://zview.z-union.ru/personal/'
  },
  // This is an array, but we'll only use the first entry for now
  // oidc: [
  //   {
  //     // ~ REQUIRED
  //     // Authorization Server URL
  //     authority: 'https://zview.z-union.ru/auth/realms/ohif',
  //     client_id: 'ohif-viewer',
  //     redirect_uri: 'http://localhost:3000/callback', // `OHIFStandaloneViewer.js`
  //     // "Authorization Code Flow"
  //     // Resource: https://medium.com/@darutk/diagrams-of-all-the-openid-connect-flows-6968e3990660
  //     response_type: 'code',
  //     scope: 'openid', // email profile openid
  //     automaticSilentRenew: true,
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
    getZmedDisplaySetSortFunction: function () {
    return (a, b) => {
      const priorityModalities = ['MR', 'MG', 'CT', 'DX'];
      const restOrder = { OT: 0, SR: 1, SEG: 2, SC: 3 };

      const normMod = m => String(m || '').toUpperCase();

      const aModality = normMod(a.modality || a.Modality);
      const bModality = normMod(b.modality || b.Modality);

      const toNumDate = v => {
        if (v == null) return -Infinity;
        const s = String(v).trim();

        if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
          const [dd, mm, yyyy] = s.split('.');
          return Number(`${yyyy}${mm}${dd}`);
        }

        const d = s.replace(/\D/g, '');
        if (d.length < 8) return -Infinity;

        const yFirst = Number(d.slice(0, 4));
        const yLast = Number(d.slice(4, 8));

        if (yFirst >= 1900 && yFirst <= 2999) {
          return Number(d.slice(0, 8));
        }
        if (yLast >= 1900 && yLast <= 2999) {
          // DDMMYYYY -> YYYYMMDD
          const dd = d.slice(0, 2);
          const mm = d.slice(2, 4);
          const yy = d.slice(4, 8);
          return Number(`${yy}${mm}${dd}`);
        }

        return -Infinity;
      };

      const toNumTime = v => {
        if (v == null) return -Infinity;
        let s = String(v).trim();
        let frac = 0;
        if (s.includes('.')) {
          const [base, f] = s.split('.');
          s = base;
          if (/^\d+$/.test(f)) frac = Number(`0.${f}`);
        }
        s = s.replace(/\D/g, '');
        if (!s) return -Infinity;

        const base = (s + '000000').slice(0, 6);
        const hh = Number(base.slice(0, 2));
        const mm = Number(base.slice(2, 4));
        const ss = Number(base.slice(4, 6));
        if ([hh, mm, ss].some(n => Number.isNaN(n))) return -Infinity;

        return hh * 3600 + mm * 60 + ss + frac;
      };

      const toNumSeries = v => {
        if (v == null) return Number.POSITIVE_INFINITY;
        const n = Number(String(v).trim());
        return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
      };

      const aDate = toNumDate(a.seriesDate ?? a.SeriesDate);
      const bDate = toNumDate(b.seriesDate ?? b.SeriesDate);
      const aTime = toNumTime(a.seriesTime ?? a.SeriesTime);
      const bTime = toNumTime(b.seriesTime ?? b.SeriesTime);

      const aSeriesNum = toNumSeries(a.seriesNumber ?? a.SeriesNumber);
      const bSeriesNum = toNumSeries(b.seriesNumber ?? b.SeriesNumber);

      // 1) MR/MG/CT/DX сверху
      const aIsPriority = priorityModalities.includes(aModality);
      const bIsPriority = priorityModalities.includes(bModality);
      if (aIsPriority !== bIsPriority) return aIsPriority ? -1 : 1;

      // 1a) Внутри priority-модальностей — по возрастанию SeriesNumber
      if (aIsPriority && bIsPriority && aSeriesNum !== bSeriesNum) {
        return aSeriesNum - bSeriesNum;
      }

      // 2) По дате (новее выше)
      if (aDate !== bDate) return bDate - aDate;

      // 3) При одинаковой дате — по времени (позже выше)
      if (aTime !== bTime) return bTime - aTime;

      // 4) При равенстве — по модальностям OT → SR → SEG → SC → прочее
      const aRank = Object.prototype.hasOwnProperty.call(restOrder, aModality)
        ? restOrder[aModality]
        : Number.POSITIVE_INFINITY;
      const bRank = Object.prototype.hasOwnProperty.call(restOrder, bModality)
        ? restOrder[bModality]
        : Number.POSITIVE_INFINITY;
      if (aRank !== bRank) return aRank - bRank;

      // 5) Тай-брейк по описанию
      const aDesc = a.seriesDescription || a.SeriesDescription || '';
      const bDesc = b.seriesDescription || b.SeriesDescription || '';
      return bDesc.localeCompare(aDesc);
      };
    },
  },
  hotkeys: [
    {
      commandName: 'incrementActiveViewport',
      label: 'Next Viewport',
      keys: ['right'],
    },
    {
      commandName: 'decrementActiveViewport',
      label: 'Previous Viewport',
      keys: ['left'],
    },
    { commandName: 'rotateViewportCW', label: 'Rotate Right', keys: ['r'] },
    { commandName: 'rotateViewportCCW', label: 'Rotate Left', keys: ['l'] },
    { commandName: 'invertViewport', label: 'Invert', keys: ['i'] },
    {
      commandName: 'flipViewportHorizontal',
      label: 'Flip Horizontally',
      keys: ['h'],
    },
    {
      commandName: 'flipViewportVertical',
      label: 'Flip Vertically',
      keys: ['v'],
    },
    { commandName: 'scaleUpViewport', label: 'Zoom In', keys: ['+'] },
    { commandName: 'scaleDownViewport', label: 'Zoom Out', keys: ['-'] },
    { commandName: 'fitViewportToWindow', label: 'Zoom to Fit', keys: ['='] },
    { commandName: 'resetViewport', label: 'Reset', keys: ['space'] },
    { commandName: 'nextImage', label: 'Next Image', keys: ['down'] },
    { commandName: 'previousImage', label: 'Previous Image', keys: ['up'] },
    // {
    //   commandName: 'previousViewportDisplaySet',
    //   label: 'Previous Series',
    //   keys: ['pagedown'],
    // },
    // {
    //   commandName: 'nextViewportDisplaySet',
    //   label: 'Next Series',
    //   keys: ['pageup'],
    // },
    {
      commandName: 'setToolActive',
      commandOptions: { toolName: 'Zoom' },
      label: 'Zoom',
      keys: ['z'],
    },
    // ~ Window level presets
    {
      commandName: 'windowLevelPreset1',
      label: 'W/L Preset 1',
      keys: ['1'],
    },
    {
      commandName: 'windowLevelPreset2',
      label: 'W/L Preset 2',
      keys: ['2'],
    },
    {
      commandName: 'windowLevelPreset3',
      label: 'W/L Preset 3',
      keys: ['3'],
    },
    {
      commandName: 'windowLevelPreset4',
      label: 'W/L Preset 4',
      keys: ['4'],
    },
    {
      commandName: 'windowLevelPreset5',
      label: 'W/L Preset 5',
      keys: ['5'],
    },
    {
      commandName: 'windowLevelPreset6',
      label: 'W/L Preset 6',
      keys: ['6'],
    },
    {
      commandName: 'windowLevelPreset7',
      label: 'W/L Preset 7',
      keys: ['7'],
    },
    {
      commandName: 'windowLevelPreset8',
      label: 'W/L Preset 8',
      keys: ['8'],
    },
    {
      commandName: 'windowLevelPreset9',
      label: 'W/L Preset 9',
      keys: ['9'],
    },
  ],
};
