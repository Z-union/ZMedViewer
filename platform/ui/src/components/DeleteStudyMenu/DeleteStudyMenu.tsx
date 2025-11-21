import React, { useState } from 'react';
import PropTypes from 'prop-types';
import Typography from '../Typography';
import ButtonGroup from '../ButtonGroup';
import { Button } from '@ohif/ui-next';
import { useTranslation } from 'react-i18next';
import ConfirmContent from '../ConfirmContent';

export type DeleteStudySelection = 'allSeries' | 'study';

export interface DeleteStudyMenuProps {
  deleteAllSeriesLabel?: string;
  deleteStudyLabel?: string;
  onConfirmDeleteAllSeries: (
    event: React.MouseEvent<HTMLButtonElement>
  ) => void | Promise<void>;
  onConfirmDeleteStudy: (
    event: React.MouseEvent<HTMLButtonElement>
  ) => void | Promise<void>;
  onCancel: (event: React.MouseEvent<HTMLButtonElement>) => void | Promise<void>;
}

const DeleteStudyMenu: React.FC<DeleteStudyMenuProps> = ({
  deleteAllSeriesLabel,
  deleteStudyLabel,
  onConfirmDeleteAllSeries,
  onConfirmDeleteStudy,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [selection, setSelection] = useState<DeleteStudySelection>('allSeries');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSelectionChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ): void => {
    const { value } = event.target;
    setSelection(value === 'study' ? 'study' : 'allSeries');
  };

  const handleClickYes = async (
    event: React.MouseEvent<HTMLButtonElement>
  ): Promise<void> => {
    event.preventDefault();

    setIsSubmitting(true);

    try {
      if (selection === 'allSeries') {
        await onConfirmDeleteAllSeries(event);
      } else {
        await onConfirmDeleteStudy(event);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClickNo = async (
    event: React.MouseEvent<HTMLButtonElement>
  ): Promise<void> => {
    event.preventDefault();
    await onCancel(event);
  };

  const labelContent =
    selection === 'allSeries'
      ? deleteAllSeriesLabel ??
        t('StudyList:Are you sure you wish to delete all Zview reports?')
      : deleteStudyLabel ??
        t('StudyList:Are you sure you wish to delete this study?');

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">
          {t('StudyList:Select what to delete')}
        </legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="delete-option"
            value="allSeries"
            checked={selection === 'allSeries'}
            onChange={handleSelectionChange}
            disabled={isSubmitting}
          />
          <Typography>{t('StudyList:Delete Zview reports')}</Typography>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="delete-option"
            value="study"
            checked={selection === 'study'}
            onChange={handleSelectionChange}
            disabled={isSubmitting}
          />
          <Typography>{t('StudyList:Delete study')}</Typography>
        </label>
      </fieldset>

      <ConfirmContent
        labelContent={labelContent}
        handleClickYes={handleClickYes}
        handleClickNo={handleClickNo}
        isLoading={isSubmitting}
      />
    </div>
  );
};

DeleteStudyMenu.propTypes = {
  deleteAllSeriesLabel: PropTypes.string,
  deleteStudyLabel: PropTypes.string,
  onConfirmDeleteAllSeries: PropTypes.func.isRequired,
  onConfirmDeleteStudy: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

export default DeleteStudyMenu;
