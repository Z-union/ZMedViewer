import React from 'react';
import PropTypes from 'prop-types';
import Typography from '../Typography';
import ButtonGroup from '../ButtonGroup';
import { Button } from '@ohif/ui-next';
import { useTranslation } from 'react-i18next';

export interface ConfirmContentProps {
  labelContent?: string;
  isLoading?: boolean;
  handleClickYes: (
    event: React.MouseEvent<HTMLButtonElement>
  ) => void | Promise<void>;
  handleClickNo: (
    event: React.MouseEvent<HTMLButtonElement>
  ) => void | Promise<void>;
}

const ConfirmContent: React.FC<ConfirmContentProps> = ({
  labelContent,
  isLoading = false,
  handleClickYes,
  handleClickNo,
}) => {
  const { t } = useTranslation('Common');
  const label = labelContent || t('Confirm the action');

  return (
    <div className="flex flex-col gap-4">
      <label>
        <Typography>{label}</Typography>
      </label>
      <ButtonGroup separated className="flex gap-6">
        <Button
          className="w-16 flex items-center justify-center"
          onClick={handleClickYes}
          disabled={isLoading}
        >
          {isLoading ? (
            <span
              className="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin"
              aria-label={t('Loading')}
            />
          ) : (
            t('Yes')
          )}
        </Button>
        <Button
          className="w-16"
          onClick={handleClickNo}
          disabled={isLoading}
        >
          {t('No')}
        </Button>
      </ButtonGroup>
    </div>
  );
};

ConfirmContent.propTypes = {
  labelContent: PropTypes.string,
  isLoading: PropTypes.bool,
  handleClickYes: PropTypes.func.isRequired,
  handleClickNo: PropTypes.func.isRequired,
};

export default ConfirmContent;
