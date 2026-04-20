const filtersMeta = [
  {
    name: 'patientName',
    displayName: 'PatientName',
    inputType: 'Text',
    isSortable: true,
    gridCol: 4,
  },
  {
    name: 'mrn',
    displayName: 'MRN',
    inputType: 'Text',
    isSortable: true,
    gridCol: 2,
  },
  {
    name: 'studyUploadedAt',
    displayName: 'StudyUploadedAt',
    inputType: 'DateRange',
    isSortable: false,
    gridCol: 5,
  },
  {
    name: 'studyDate',
    displayName: 'StudyDate',
    inputType: 'DateRange',
    isSortable: false,
    gridCol: 5,
  },
  {
    name: 'modalities',
    displayName: 'Modality',
    inputType: 'MultiSelect',
    inputProps: {
      options: [
        { value: 'CT', label: 'CT' },
        { value: 'DOC', label: 'DOC' },
        { value: 'MG', label: 'MG' },
        { value: 'MR', label: 'MR' },
        { value: 'OT', label: 'OT' },
        { value: 'PDF', label: 'PDF' },
        { value: 'SEG', label: 'SEG' },
        { value: 'SR', label: 'SR' },
        { value: 'US', label: 'US' },
        { value: 'XA', label: 'XA' },
      ],
    },
    isSortable: true,
    gridCol: 3,
  },
  {
    name: 'accession',
    displayName: 'Status',
    inputType: 'None',
    isSortable: false,
    gridCol: 3,
  },
  {
    name: 'instances',
    displayName: 'Instances',
    inputType: 'None',
    isSortable: false,
    gridCol: 2,
  },
];

export default filtersMeta;
