import React from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';

import { Icon } from '@ohif/ui';

const baseClasses =
  'first:border-0 border-t border-secondary-light cursor-pointer select-none outline-none';

const StudyItem = ({
  date,
  description,
}) => {
  return (
    <div
      className={classnames(
        'bg-black hover:bg-secondary-main',
        {
          'rounded overflow-hidden border-primary-light': true,
        }
      )}
    //   onClick={onClick}
    //   onKeyDown={onClick}
    //   role="button"
    >
      <div className="flex flex-row items-center flex-1 pt-2 text-base text-blue-300">
          <div className="mr-4">
            <span className="font-bold text-primary-main">{'Date: '}</span>
          </div>
          <div className="flex flex-row items-center flex-1">
            {date}
          </div>
      </div>
      <div className="flex flex-row items-center flex-1 pt-2 text-base text-blue-300">
          <div className="mr-4">
            <span className="font-bold text-primary-main">{'Affected rate: '}</span>
          </div>
          <div className="flex flex-row items-center flex-1">
            {description}
          </div>
      </div>
      {/* <div className="text-base text-white break-all">{description}</div> */}
    </div>
  );
};

StudyItem.propTypes = {
  date: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
};

export default StudyItem;
