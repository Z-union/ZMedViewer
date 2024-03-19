let configuration = {
  innopolisBaseURL: "",
};

export default configuration;

export enum StudyStatus {
  success = 'Патологии не выявлены',
  error = 'Выявлена патология',
  warning = 'Требует внимания',
}

export const getStatusIcon = (status: StudyStatus): string => {
  switch (status) {
    case StudyStatus.success:
      return 'status-success';
    case StudyStatus.error:
      return 'status-error';
    case StudyStatus.warning:
      return 'status-warning';
    default:
      return '';
  }
};
