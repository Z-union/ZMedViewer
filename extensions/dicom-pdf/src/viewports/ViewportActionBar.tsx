import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Icon, ButtonGroup, Button, CinePlayer } from '@ohif/ui';
// import { StringNumber } from '../../types';

const ViewportActionBar = ({ onArrowsClick }) => {
  const useAltStyling = false;
  const borderColor = useAltStyling ? '#365A6A' : '#00000000';

  let backgroundColor = '#00000000';
  if (useAltStyling) {
    backgroundColor = '#031923';
  }

  return (
    <div
      className="flex flex-wrap items-center p-2 -mt-2 border-b select-none"
      style={{
        borderColor: borderColor,
        backgroundColor: backgroundColor,
      }}
    >
      {/* <div className="flex flex-1 grow mt-2 min-w-48">
        <div className="flex items-center">
          <span className="mr-2 text-white text-large">{label}</span>
          {showStatus && getStatusComponent()}
        </div>
        <div className="flex flex-col justify-start ml-4">
          <div className="flex">
            <span className="text-base text-white">{studyDate}</span>
            <span className="pl-2 ml-2 text-base border-l border-primary-light text-primary-light">
              S: {currentSeries}
            </span>
          </div>
          <div className="flex">
            <p className="text-base truncate max-w-40 text-primary-light">
              {seriesDescription}
            </p>
          </div>
        </div>
      </div> */}
      <div className="mt-2" style={{ pointerEvents: 'all' }}>
        <ButtonGroup>
          <Button
            size="initial"
            className="px-2 py-1 bg-black"
            border="light"
            onClick={() => onArrowsClick('left')}
          >
            <Icon name="chevron-left" className="w-4 text-white" />
          </Button>
          <Button
            size="initial"
            border="light"
            className="px-2 py-1 bg-black"
            onClick={() => onArrowsClick('right')}
          >
            <Icon name="chevron-right" className="w-4 text-white" />
          </Button>
        </ButtonGroup>
      </div>
    </div>
  );
};

ViewportActionBar.propTypes = {
  onArrowsClick: PropTypes.func.isRequired,
};

ViewportActionBar.defaultProps = {};

export default ViewportActionBar;
