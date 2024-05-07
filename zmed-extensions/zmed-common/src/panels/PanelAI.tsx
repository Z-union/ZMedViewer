import React, { useEffect, useState, useCallback } from 'react';
// import { useState } from 'react-usestateref'
import PropTypes, { number } from 'prop-types';
import classnames from 'classnames';
import {
  Button,
  Icon,
  LoadingIndicator,
  LoadingIndicatorProgress,
} from '@ohif/ui';
import StudyItem from './StudyItem';
import axios from 'axios';
import './PanelAI.css';
import configuration from './../config';

let Modalities = ['DX', 'CR']

export default function PanelAI({ servicesManager, commandsManager, extensionManager }) {
  const isMounted = React.useRef(true);
  const {
    DisplaySetService,
    // ToolGroupService,
    // ToolBarService,
    // HangingProtocolService,
  } = servicesManager.services;

  enum AIState {
    undefined,
    loading,
    unsupported,
    finished,
    finishedWithApply, // данные можем показать, но чтобы обновить рабочий стол, нужно обновить экран
    error,
    null
  }
  const [processingState, setProcessingState] = useState(AIState.null);
  const [buttonClicked, setButtonClicked] = useState(false);
  const [seriesData, setSeriesData] = useState([{
    title: '',
    value: '',
  }]);
  const [wasProcessing, setWasProcessing] = useState(false);
  const StudyInstanceUID =
      DisplaySetService.activeDisplaySets[0].StudyInstanceUID;
  const currentZFluData = `ZFluID: ${StudyInstanceUID}`
  const zFluResults = sessionStorage.getItem(currentZFluData)
  const timer = null || number;

  // function checkStatus()

  function _handleStudyClick() {
    setButtonClicked(true);
    let processing = true
    setWasProcessing(processing);
    setProcessingState(AIState.loading);
    const displaySets = DisplaySetService.getActiveDisplaySets().find(
      displaySet => displaySet && Modalities.includes(displaySet.Modality)
    );
    console.log(displaySets.SeriesInstanceUID);
    console.log(displaySets.StudyInstanceUID);

    if (displaySets != undefined) {
      const data = JSON.stringify({
        study_instance_uid: displaySets.StudyInstanceUID,
        series_instance_uid: displaySets.SeriesInstanceUID,
        sop_instance_uid: [],
        plot3d: false,
      });
      const config = {
        method: 'post',
        url: configuration.innopolisBaseURL + 'innopolis/',
        headers: {
          'Content-Type': 'application/json',
        },
        data: data,
      };

      axios(config)
        .then(function(response) {
          if (!isMounted) {
            return;
          }
          let interval;
          interval = setInterval(() => {
            clearInterval(interval);
            _retrieveData();
          }, 1000);
          // response.data.task_id
          console.log(response);
          // setProcessingState(AIState.finished)
        })
        .catch(function(reason) {
          console.error(reason);
        });
    }
  }

  const _retrieveData = async () => { //1.2.840.10008.5.1.4.1.1.7
    //SecondaryCaptureImageStorage
    console.log("-------------------")
    console.log(DisplaySetService.getActiveDisplaySets())
    const displaySets = DisplaySetService.getActiveDisplaySets().find(
      displaySet => displaySet && Modalities.includes(displaySet.Modality)
    );
    if (displaySets == undefined || displaySets.length == 0) {
      setProcessingState(AIState.unsupported);
      return;
    }
    if (displaySets != undefined) {
      const data = JSON.stringify({
        study_instance_uid: displaySets.StudyInstanceUID,
        series_instance_uid: displaySets.SeriesInstanceUID,
      });
      const config = {
        method: 'post',
        url: configuration.innopolisBaseURL + 'series/',
        headers: {
          'Content-Type': 'application/json',
        },
        data: data,
      };

      axios(config)
        .then(function(response) {
          if (!isMounted) {
            return;
          }
          const lastIndex = response.data
            .map(res => res.job_type == 'innopolis')
            .lastIndexOf(true);
          if (lastIndex == -1) {
            setProcessingState(AIState.undefined);
            sessionStorage.setItem(currentZFluData, JSON.stringify([]));
            return;
          }
          const element = response.data[lastIndex];
          if (
            element.task_status == 'PENDING' ||
            element.task_status == 'started'
          ) {
            let processing = true
            setWasProcessing(processing);
            setProcessingState(AIState.loading);
            let interval;
            interval = setInterval(() => {
              clearInterval(interval);
              _retrieveData();
            }, 1000);
            return;
          } else if (element.task_status == 'finished') {
            console.log("!!!!!!!")
            console.log(element.data)
            let array = Object.entries(element.data).map((item) => {
              console.log(item)
              return {
                title: item[0],
                value: item[1].probability
              }
            })
            console.log("processed array")
            console.log(array)
            setSeriesData(array);
            sessionStorage.setItem(currentZFluData, JSON.stringify(array));
            console.log('------- isWasProcessed');
            console.log(wasProcessing);
            if (wasProcessing) {
              // если происходит загрузка, то true, иначе уже обработано исследование
              setProcessingState(AIState.finishedWithApply);
            } else {
              setProcessingState(AIState.finished);
            }
          } else {
            // (element.task_status == "error" ||
            // element.task_status == "failed")
            setProcessingState(AIState.error);
            return;
          }
        })
        .catch(function(reason) {
          setProcessingState(AIState.error);
          console.error(reason);
        });
    }
  };

  function getSeriesData() {
    const datasource = extensionManager.getActiveDataSource()[0];
    datasource.retrieve.series.metadata({
      StudyInstanceUID,
      getMetadataFromServer: true,
    });
  }

  useEffect(() => {
    if (!zFluResults){
      setProcessingState(AIState.loading)
      _retrieveData();
    } else {
      const storedData = sessionStorage.getItem(currentZFluData);
      const diases = storedData ? JSON.parse(storedData) : [];
      setSeriesData(diases);
      diases.length > 0 ? setProcessingState(AIState.finished) : setProcessingState(AIState.undefined);
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

  function renderState(_state: AIState) {
    switch (_state) {
      case AIState.undefined:
        // ["default","primary","primaryActive","secondary","white","black","inherit","light","translucent"].
        return (
          <div>
            <Button
              size="initial"
              className="px-2 py-2 mt-2 text-base text-white"
              color="primaryActive"
              variant="outlined"
              fullWidth={true}
              border="primaryActive"
              onClick={() => {
                _handleStudyClick();
              }}
            >
              Analyze
            </Button>
          </div>
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
              <StudyItem key={item.title}
                title={item.title ?? "Unknown"}
                value={item.value.toString() ?? "Undefined"}
              />
            ))}
            <div>
              <Button
                size="initial"
                className="px-2 py-2 mt-2 text-base text-white"
                color="light"
                variant="outlined"
                fullWidth={true}
                border="primaryActive"
                onClick={() => {
                  _handleStudyClick();
                }}
              >
                Analyze again
              </Button>
            </div>
          </div>
        );
      case AIState.error:
        return <div className="w-1 mb-2 text-primary-light">error</div>;
      case AIState.unsupported:
        return (
          <div className="w-1 mb-2 text-primary-light">
            Format not supported
          </div>
        );
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
    services: PropTypes.shape({
      // SegmentationService: PropTypes.shape({
      //   getSegmentation: PropTypes.func.isRequired,
      //   getSegmentations: PropTypes.func.isRequired,
      //   toggleSegmentationVisibility: PropTypes.func.isRequired,
      //   subscribe: PropTypes.func.isRequired,
      //   EVENTS: PropTypes.object.isRequired,
      // }).isRequired,
    }).isRequired,
  }).isRequired,
};