import React, { useEffect, useState, useCallback } from 'react';
import PropTypes, { number } from 'prop-types';
import { Button, Icon } from '@ohif/ui';
import StudyItem from './StudyItem'
import { useZMedAIMammography } from '../context/ZMedAIContextMammography';
import axios from 'axios'
import './PanelMammography.css';

export default function PanelAIMammography({
    servicesManager,
    commandsManager,
  }) {
    const isMounted = React.useRef(true)
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
      error
    }
    const [processingState, setProcessingState] = useState(AIState.loading)
    const [seriesData, setSeriesData] = useState({
      left: "",
      right: ""
    })
    var timer = null || number

    function _handleStudyClick() {
      setProcessingState(AIState.loading)
      const displaySets = DisplaySetService.getActiveDisplaySets()
        .find(displaySet => displaySet && displaySet.Modality === 'MG');
        console.log(displaySets.SeriesInstanceUID)
        console.log(displaySets.StudyInstanceUID)
      if (displaySets.length == 0) {
        setProcessingState(AIState.unsupported)
        return
      }

      if (displaySets != undefined) {
        var data = JSON.stringify({
          "study_instance_uid": displaySets.StudyInstanceUID,
        });
        var config = {
          method: 'post',
          url: 'http://91.219.167.110:5057/mammography/',
          headers: {
            'Content-Type': 'application/json'
          },
          data : data
        };

        axios(config)
        .then(function(response) {
          if (!isMounted) {
            return
          }
          var interval;
          interval = setInterval(() => {
            clearInterval(interval)
            _retrieveData()
          }, 1000);
          console.log(response)
        })
        .catch(function(reason) {
          console.error(reason)
        })
      }
    }

    const _retrieveData = async() => {
      const displaySets = DisplaySetService.getActiveDisplaySets()
                            .find(displaySet => displaySet && displaySet.Modality === 'MG');
      console.log(displaySets)
      if (displaySets == undefined || displaySets.length == 0) {
        setProcessingState(AIState.unsupported)
        return
      }
      console.log("PANEL MAMMOGRAPHY START")
      console.log(displaySets)
      if (displaySets != undefined) {
        var data = JSON.stringify({
          "study_instance_uid": displaySets.StudyInstanceUID,
        });
        var config = {
          method: 'post',
          url: 'http://91.219.167.110:5057/study/',
          headers: {
            'Content-Type': 'application/json'
          },
          data : data
        };

        axios(config)
        .then(function(response) {
          if (!isMounted) {
            return
          }
          console.log(response)
          const lastIndex = response.data.map( res => res.job_type == 'mammography').lastIndexOf(true)
          if (lastIndex == -1) {
            setProcessingState(AIState.undefined)
            return
          } //job_type == 'covid'
          let element = response.data[lastIndex]
          if (element.task_status == "PENDING" || element.task_status == "started") {
            setProcessingState(AIState.loading)
            var interval;
            interval = setInterval(() => {
              clearInterval(interval);
              _retrieveData()
            }, 1000);
            return
          } else if (element.task_status == "finished") {
            let data = {
              "left": element.data.left_breast,
              "right": element.data.right_breast
            }
            setSeriesData(data)
            setProcessingState(AIState.finished)
          } else {
            setProcessingState(AIState.error)
            return
          }
        })
        .catch(function(reason) {
          setProcessingState(AIState.error)
          console.error(reason)
        })
      }
    }

    useEffect(() => {
      _retrieveData()
      return () => {
        isMounted.current = false;
      }
    }, []);

    function renderState(_state: AIState) {
      switch (_state) {
        case AIState.undefined:
          return <Button size="initial"
                        className="px-2 py-2 text-base text-white"
                        color="primary"
                        variant="outlined"
                        fullWidth={true}
                        onClick={() => {
                          _handleStudyClick()
                        }}>
                          Process
                  </Button>;
        case AIState.loading:
          return <div className="loading h-full w-full">
                      <div className="infinite-loading-bar bg-primary-light"></div>
                </div>
        case AIState.finished:
          return <div>
                <StudyItem
                        left={seriesData?.left ?? 0}
                        right={seriesData?.right ?? 0}
              />
                {/* <Button size="initial"
                            className="px-2 py-2 text-base text-white"
                            color="primaryLight"
                            variant="outlined"
                            fullWidth='true'
                            onClick={() => {
                              _handleStudyClick()
                            }}>
                              Process
                      </Button> */}
            </div>
        case AIState.error:
          return <div className="w-1 mb-2 text-primary-light">error</div>
        case AIState.unsupported:
          return <div className="w-1 mb-2 text-primary-light">Format not supported</div>
      }
    }
    console.log(processingState)
    return (
        <React.Fragment>
          <div className="pt-5"></div>
          <div className="flex flex-col flex-1">
            <div className="flex flexRow flex-center">
              { renderState(processingState) }
            </div>
          </div>
            {/* <div>{value.context.displayName}</div> */}
            {/* <div>{title}</div> */}
        </React.Fragment>
        // <StudyItem
        //       date={date}
        //       description={description}
        //       numInstances={numInstances}
        //       modalities={modalities}
        //       trackedSeries={getTrackedSeries(displaySets)}
        //       isActive={isExpanded}
        //       onClick={() => {
        //         onClickStudy(studyInstanceUid);
        //       }}
        //       data-cy="thumbnail-list"
        //     />
    )
  }

  PanelAIMammography.propTypes = {
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
