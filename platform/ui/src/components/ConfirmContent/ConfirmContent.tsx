import React from 'react';
import PropTypes from 'prop-types';
import Typography from '../Typography';
import ButtonGroup from '../ButtonGroup';
import { Button } from '@ohif/ui-next';
import { useTranslation } from 'react-i18next';

const ConfirmContent = ({ labelContent = '', handleClickYes, handleClickNo }) => {
  const { t } = useTranslation('Common');
  return (
    <form className="flex flex-col gap-4">
      <label>
        <Typography>{labelContent || t('Confirm the action')}</Typography>
      </label>
      <ButtonGroup
        separated={true}
        className="flex gap-6"
      >
        <Button
          className="w-16"
          onClick={e => {
            handleClickYes(e);
          }}
        >
          {t('Yes')}
        </Button>
        <Button
          className="w-16"
          onClick={e => {
            handleClickNo(e);
          }}
        >
          {t('No')}
        </Button>
      </ButtonGroup>
    </form>
  );
};

ConfirmContent.propTypes = {
  labelContent: PropTypes.string,
  handleClickYes: PropTypes.func.isRequired,
  handleClickNo: PropTypes.func.isRequired,
};

export default ConfirmContent;
