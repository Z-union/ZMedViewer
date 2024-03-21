import React from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';

import { Icon } from '@ohif/ui';

const baseClasses =
  'first:border-0 border-t border-secondary-light cursor-pointer select-none outline-none';

const StudyItem = ({
  title,
  value,
}) => {
  return (
    <div
      className={classnames(
        'bg-black hover:bg-primary-dark',
        {
        'rounded overflow-hidden border-primary-light': true,
      }
      )}
    >
      <div className="flex items-center justify-between gap-4 py-2 text-base text-blue-300 flex-1">
        <div className="pl-1">
          <span className="font-bold text-primary-main">{title + ': '}</span>
        </div>
        <div className="pr-1">
          {value % 1 !== 0 ? Number(value).toFixed(2) : value}
        </div>
      </div>
    </div>
  );
};

StudyItem.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
};

export default StudyItem;
