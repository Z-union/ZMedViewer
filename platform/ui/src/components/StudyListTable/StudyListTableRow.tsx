import React from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';
import getGridWidthClass from '../../utils/getGridWidthClass';

import Icon from '../Icon';

const StudyListTableRow = props => {
  const { tableData } = props;
  const { row, expandedContent, onClickRow, onClickDelete, isExpanded, dataCY, clickableCY } =
    tableData;
  return (
    <>
      <tr
        className="select-none"
        data-cy={dataCY}
      >
        <td
          className={classnames('border-0 p-0', {
            'border-secondary-light bg-primary-dark border-b': isExpanded,
          })}
        >
          <div
            className={classnames(
              'relative w-full transition duration-300',
              {
                'border-primary-light hover:border-secondary-light mb-2 overflow-visible rounded border':
                  isExpanded,
              },
              {
                'border-transparent': !isExpanded,
              }
            )}
          >
            <table className={classnames('w-full p-4')}>
              <tbody>
                <tr
                  className={classnames(
                    'hover:bg-secondary-main cursor-pointer transition duration-300',
                    {
                      'bg-primary-dark': !isExpanded,
                    },
                    { 'bg-secondary-dark': isExpanded }
                  )}
                  onClick={onClickRow}
                  data-cy={clickableCY}
                >
                  {row.map((cell, index) => {
                    const { content, title, gridCol } = cell;
                    const isLastElement = index === row.length - 1;
                    return (
                      <React.Fragment key={index}>
                        <td
                          className={classnames(
                            'truncate px-4 py-2 text-base',
                            { 'border-secondary-light border-b': !isExpanded },
                            getGridWidthClass(gridCol) || ''
                          )}
                          style={{
                            maxWidth: 0,
                          }}
                          title={title}
                        >
                          <div className="flex">
                            {index === 0 && (
                              <div>
                                <Icon
                                  name={isExpanded ? 'chevron-down' : 'chevron-right'}
                                  className="mr-4 inline-flex"
                                />
                              </div>
                            )}
                            <div
                              className={classnames(
                                { 'overflow-hidden': true },
                                { truncate: true }
                              )}
                            >
                              {content}
                            </div>
                          </div>
                        </td>
                        {isLastElement && (
                          <td className='absolute right-0 h-full flex items-center justify-center p-2 mr-2 aspect-square'
                          onClick={e => onClickDelete(e)}
                          >
                            <div className='h-full w-full flex items-center justify-center h-20/24 aspect-square hover:bg-black rounded-full'>
                              <Icon name="close" />
                            </div>
                          </td>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tr>
                {isExpanded && (
                  <tr className="max-h-0 w-full select-text overflow-hidden bg-black">
                    <td colSpan={row.length}>{expandedContent}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </td>
      </tr>
    </>
  );
};

StudyListTableRow.propTypes = {
  tableData: PropTypes.shape({
    /** A table row represented by an array of "cell" objects */
    row: PropTypes.arrayOf(
      PropTypes.shape({
        key: PropTypes.string.isRequired,
        /** Optional content to render in row's cell */
        content: PropTypes.node,
        /** Title attribute to use for provided content */
        title: PropTypes.string,
        gridCol: PropTypes.number.isRequired,
      })
    ).isRequired,
    expandedContent: PropTypes.node.isRequired,
    onClickRow: PropTypes.func.isRequired,
    onClickDelete: PropTypes.func,
    isExpanded: PropTypes.bool.isRequired,
    dataCY: PropTypes.string,
    clickableCY: PropTypes.string,
  }),
};

export default StudyListTableRow;
