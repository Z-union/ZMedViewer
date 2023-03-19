import React, { useEffect, useState, useCallback } from 'react';
import PropTypes, { number } from 'prop-types';
import { Button, Icon, LoadingIndicatorProgress } from '@ohif/ui';
import StudyItem from './StudyItem'
import { useZMedAI } from '../context/ZMedAIContext';
import axios from 'axios'

export default function PanelAI({
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
      date: "",
      volume: ""
    })
    const [wasProcessing, setWasProcessing] = useState(false)
    var timer = null || number
    // const [displayName, setDisplayName] = useZMedAI()

    // function checkStatus()

    function _handleStudyClick() {
      setWasProcessing(true)
      setProcessingState(AIState.loading)
      const displaySets = DisplaySetService.getActiveDisplaySets()
        .find(displaySet => displaySet && displaySet.Modality === 'CT');
        console.log(displaySets.SeriesInstanceUID)
        console.log(displaySets.StudyInstanceUID)

      if (displaySets != undefined) {
        var data = JSON.stringify({
          "study_instance_uid": displaySets.StudyInstanceUID,
          "series_instance_uid": displaySets.SeriesInstanceUID,
          "sop_instance_uid": [],
          "plot3d": false
        });
        var config = {
          method: 'post',
          url: 'http://91.219.167.110:5057/covid/',
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
          // response.data.task_id
          console.log(response)
          // setProcessingState(AIState.finished)
        })
        .catch(function(reason) {
          console.error(reason)
        })
      }
    }

    const _retrieveData = async() => {
      const displaySets = DisplaySetService.getActiveDisplaySets()
                            .find(displaySet => displaySet && displaySet.Modality === 'CT');
      if (displaySets.length == 0) {
        setProcessingState(AIState.unsupported)
        return
      }
      console.log("PANEL START")
      console.log(displaySets)
      if (displaySets != undefined) {
        var data = JSON.stringify({
          "study_instance_uid": displaySets.StudyInstanceUID,
          "series_instance_uid": displaySets.SeriesInstanceUID
        });
        var config = {
          method: 'post',
          url: 'http://91.219.167.110:5057/series/',
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
          const lastIndex = response.data.map( res => res.job_type == 'covid').lastIndexOf(true)
          if (lastIndex == -1) {
            setProcessingState(AIState.undefined)
            return
          } //job_type == 'covid'
          let element = response.data[lastIndex]
          if (element.task_status == "queued" || element.task_status == "started") {
            setWasProcessing(true)
            setProcessingState(AIState.loading)
            var interval;
            interval = setInterval(() => {
              clearInterval(interval);
              _retrieveData()
            }, 1000);
            return
          }
          if (element.task_status == "error") {
            setProcessingState(AIState.error)
            return
          }
          let covidData = {
            "date": element.date_processed.$date != null ? new Date(element.date_processed.$date).toString() : "Date",
            "volume": element.data.affected_rate ?? "rate"
          }
          setSeriesData(covidData)
          setProcessingState(AIState.finished)
          console.log("------- isWasProcessed")
          console.log(wasProcessing)
          if (wasProcessing) {
            window.location.reload()
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
                        color="primaryLight"
                        variant="outlined"
                        fullWidth='true'
                        onClick={() => {
                          _handleStudyClick()
                        }}>
                          Detect covid
                  </Button>;
        case AIState.loading:
          return <div><Icon name="dotted-circle" className="w-4 mb-2 text-primary-light" /></div>;
        case AIState.finished:
          return <div>
                <StudyItem
                        date={seriesData?.date ?? "Date"}
                        description={seriesData?.volume ?? "rate"}
              />
                <Button size="initial"
                            className="px-2 py-2 text-base text-white"
                            color="primaryLight"
                            variant="outlined"
                            fullWidth='true'
                            onClick={() => {
                              _handleStudyClick()
                            }}>
                              Detect covid
                      </Button>
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
