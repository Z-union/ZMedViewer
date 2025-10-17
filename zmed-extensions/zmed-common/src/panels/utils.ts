// Принудительно обновляет серии внутри текущего исследования. Используется после обработки исследования и добавления новой серии на бекенде.
export function forceUpdateSeriesData({ extensionManager, StudyInstanceUID }) {
  const datasource = extensionManager.getActiveDataSource()[0];
  datasource.retrieve.series.metadata({
    StudyInstanceUID,
    getMetadataFromServer: true,
  });
}
