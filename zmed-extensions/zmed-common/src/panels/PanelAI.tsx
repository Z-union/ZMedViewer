import React, { useEffect, useState, useRef } from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';
import { Button } from '@ohif/ui';
import { useTranslation } from 'react-i18next';
import StudyItem from './StudyItem';
import axios from 'axios';
import './PanelAI.css';
import configuration from './../config';

const Modalities = ['DX', 'CR'];

// Определяем состояния задачи (вместо enum используем объект)
const AIState = {
  undefined: 'undefined',
  loading: 'loading',
  notFinishedYet: 'notFinishedYet',
  finished: 'finished',
  finishedWithApply: 'finishedWithApply', // данные можем показать, но для обновления рабочего стола требуется обновление экрана
  error: 'error',
  null: 'null',
  unsupported: 'unsupported',
};

export default function PanelAI({
  servicesManager,
  commandsManager,
  extensionManager,
}) {
  const { t } = useTranslation('Buttons');
  const isMounted = useRef(true);
  const { DisplaySetService } = servicesManager.services;

  const [processingState, setProcessingState] = useState(AIState.null);
  const [buttonClicked, setButtonClicked] = useState(false);
  const [seriesData, setSeriesData] = useState([]);
  const [wasProcessing, setWasProcessing] = useState(false);

  const StudyInstanceUID =
    DisplaySetService.activeDisplaySets[0].StudyInstanceUID;
  const currentZFluData = `ZFluID: ${StudyInstanceUID}`;
  const zFluResults = sessionStorage.getItem(currentZFluData);

  // Функция запуска задачи (POST-запрос)
  const _handleStudyClick = () => {
    setButtonClicked(true);
    setWasProcessing(true);
    setProcessingState(AIState.loading);

    const displaySet = DisplaySetService.getActiveDisplaySets().find(
      (ds) => ds && Modalities.includes(ds.Modality)
    );

    if (displaySet) {
      const postData = {
        model_name: 'zFlu',
        model_version: 1,
        dcm_study_uid: displaySet.StudyInstanceUID,
        dcm_series_uid: displaySet.SeriesInstanceUID,
        output_lang: 'ru',
      };

      axios
        .post(
          configuration.innopolisBaseURL + 'api/tasks/post_task/',
          postData,
          {
            headers: {
              'Content-Type': 'application/json',
              accept: 'application/json',
            },
          }
        )
        .then((response) => {
          if (!isMounted.current) return;
          // Извлекаем task_id из ответа
          const task_id = response.data;
          // Запускаем опрос статуса через GET-запрос по task_id (третий эндпоинт)
          setTimeout(() => {
            _retrieveData(task_id);
          }, 1000);
        })
        .catch((reason) => {
          console.error(reason);
          setProcessingState(AIState.error);
        });
    }
  };

  // Функция опроса статуса и получения результата.
  // Если передан task_id – используется третий эндпоинт,
  // иначе – опрос по study_uid и series_uid (в монтировании компонента)
  const _retrieveData = (task_id) => {
    const displaySet = DisplaySetService.getActiveDisplaySets().find(
      (ds) => ds && Modalities.includes(ds.Modality)
    );
    const displaySets = DisplaySetService.getActiveDisplaySets().find(
      (displaySet) => displaySet && Modalities.includes(displaySet.Modality)
    );

    if (displaySets == undefined || displaySets.length == 0) {
      setProcessingState(AIState.unsupported);
      return;
    }

    let url = '';
    if (task_id) {
      // GET по задаче с task_id – используем study_instance_uid и query параметр task_id
      url =
        configuration.innopolisBaseURL +
        `api/tasks/results/${displaySet.StudyInstanceUID}?task_id=${task_id}`;
    } else {
      // GET по study_uid и series_uid
      url =
        configuration.innopolisBaseURL +
        `api/tasks/results/${displaySet.StudyInstanceUID}/${displaySet.SeriesInstanceUID}`;
    }

    axios
      .get(url, {
        headers: {
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
      })
      .then((response) => {
        if (!isMounted.current) return;

        // Если опрашиваем по task_id
        if (task_id) {
          const element = response.data;
          if (element.status === 'PENDING' || element.status === 'STARTED') {
            setProcessingState(AIState.loading);
            setTimeout(() => {
              _retrieveData(task_id);
            }, 1000);
          } else if (element.status === 'SUCCESS') {
            let resultData = element.result;
            try {
              // Преобразуем строку с одинарными кавычками в корректный JSON
              resultData = JSON.parse(resultData.replace(/'/g, '"'));
            } catch (e) {
              console.error('Ошибка при парсинге результата:', e);
            }
            const array = Object.entries(resultData).map(([key, val]) => ({
              title: key,
              value: val.probability,
            }));
            setSeriesData(array);
            sessionStorage.setItem(currentZFluData, JSON.stringify(array));
            setProcessingState(
              wasProcessing ? AIState.finishedWithApply : AIState.finished
            );
          }
        } else {
          // Если опрашиваем по study_uid и series_uid
          // Если нет завершённых задач, API возвращает ошибку 500, а сюда мы не попадём
          if (Array.isArray(response.data)) {
            const finishedTasks = response.data.filter(
              (task) => task.status === 'SUCCESS'
            );
            if (finishedTasks.length === 0) {
              setProcessingState(AIState.notFinishedYet);
              sessionStorage.setItem(currentZFluData, JSON.stringify([]));
              return;
            }
            const lastTask = finishedTasks[finishedTasks.length - 1];
            let resultData = lastTask.result;
            try {
              resultData = JSON.parse(resultData.replace(/'/g, '"'));
            } catch (e) {
              console.error('Ошибка при парсинге результата:', e);
            }
            const array = Object.entries(resultData).map(([key, val]) => ({
              title: key,
              value: val.probability,
            }));
            setSeriesData(array);
            sessionStorage.setItem(currentZFluData, JSON.stringify(array));
            setProcessingState(AIState.finished);
          } else {
            // Если ответ не массив – обрабатываем как в случае с task_id
            const element = response.data;
            if (element.status === 'PENDING' || element.status === 'STARTED') {
              setProcessingState(AIState.loading);
              setTimeout(() => {
                _retrieveData();
              }, 1000);
            } else if (element.status === 'SUCCESS') {
              let resultData = element.result;
              try {
                resultData = JSON.parse(resultData.replace(/'/g, '"'));
              } catch (e) {
                console.error('Ошибка при парсинге результата:', e);
              }
              const array = Object.entries(resultData).map(([key, val]) => ({
                title: key,
                value: val.probability,
              }));
              setSeriesData(array);
              sessionStorage.setItem(currentZFluData, JSON.stringify(array));
              setProcessingState(AIState.finished);
            }
          }
        }
      })
      .catch((error) => {
        // Если при GET-запросе по study_uid и series_uid вернулся error 500 – показываем сообщение, что исследование ещё не обрабатывалось
        if (error.response && error.response.status === 500) {
          setProcessingState(AIState.notFinishedYet);
        } else {
          console.error(error);
          setProcessingState(AIState.error);
        }
      });
  };

  // Функция обновления данных серии (оставляем логику sessionStorage)
  function getSeriesData() {
    const datasource = extensionManager.getActiveDataSource()[0];
    datasource.retrieve.series.metadata({
      StudyInstanceUID,
      getMetadataFromServer: true,
    });
  }

  useEffect(() => {
    if (!zFluResults) {
      setProcessingState(AIState.loading);
      _retrieveData();
    } else {
      const storedData = sessionStorage.getItem(currentZFluData);
      const dataArr = storedData ? JSON.parse(storedData) : [];
      setSeriesData(dataArr);
      dataArr.length > 0
        ? setProcessingState(AIState.finished)
        : setProcessingState(AIState.notFinishedYet);
    }
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (
      processingState === AIState.finishedWithApply ||
      processingState === AIState.finished
    ) {
      if (buttonClicked) {
        getSeriesData();
        setButtonClicked(false);
      }
    }
  }, [processingState, buttonClicked]);

  // Отрисовка компонентов в зависимости от состояния
  function renderState(state) {
    switch (state) {
      case AIState.undefined:
        return (
          <Button
            size="initial"
            className="px-2 py-2 text-base text-white"
            color="primaryActive"
            variant="outlined"
            fullWidth
            border="primaryActive"
            onClick={_handleStudyClick}
          >
            {t('Analyze')}
          </Button>
        );
      case AIState.loading:
        return (
          <div className="loading h-full w-full">
            <div className="infinite-loading-bar bg-primary-light"></div>
          </div>
        );
      case AIState.finished:
      case AIState.finishedWithApply:
        return (
          <div className="flex flex-col">
            {seriesData.map((item) => (
              <StudyItem
                key={item.title}
                title={item.title || 'Unknown'}
                value={
                  item.value !== undefined ? item.value.toString() : 'Undefined'
                }
              />
            ))}
            <Button
              size="initial"
              className="px-2 py-2 text-base text-white"
              color="light"
              variant="outlined"
              fullWidth
              border="primaryActive"
              onClick={_handleStudyClick}
            >
              {t('AnalyzeAgain')}
            </Button>
          </div>
        );
      case AIState.error:
        return (
          <div className="w-1 mb-2 text-primary-light">
            {t('Processing error')}
          </div>
        );
      case AIState.unsupported:
        return (
          <div className="w-1 mb-2 text-primary-light">
            {t('Format not supported')}
          </div>
        );
      case AIState.notFinishedYet:
        return (
          <div className="flex flex-col justify-center w-1 mb-2 text-primary-light">
            <Button
              size="initial"
              className="mt-2 px-2 py-2 text-base text-white"
              color="primaryActive"
              variant="outlined"
              fullWidth
              border="primaryActive"
              onClick={_handleStudyClick}
            >
              {t('Analyze')}
            </Button>
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <React.Fragment>
      <div
        className={classnames('flex flex-col mr-1 justify-center', {
          'align-center h-screen': processingState === AIState.loading,
          'mt-4': processingState !== AIState.loading,
        })}
      >
        <div className="flex justify-center">
          {renderState(processingState)}
        </div>
      </div>
    </React.Fragment>
  );
}

PanelAI.propTypes = {
  commandsManager: PropTypes.shape({
    runCommand: PropTypes.func.isRequired,
  }),
  servicesManager: PropTypes.shape({
    services: PropTypes.object.isRequired,
  }).isRequired,
  extensionManager: PropTypes.object.isRequired,
};
