import React from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@ohif/ui';
import DividerItem from './DividerItem';

type BackItemProps = {
  backLabel?: string;
  onBackClick: () => void;
};

const BackItem = ({ backLabel, onBackClick }: BackItemProps) => {
  const { t } = useTranslation('Buttons');
  return (
    <>
      <div
        className="all-in-one-menu-item all-in-one-menu-item-effects"
        onClick={onBackClick}
      >
        <Icon name="content-prev"></Icon>

        <div className="pl-2">{t(backLabel) || t('Back to Display Options')}</div>
      </div>
      <DividerItem></DividerItem>
    </>
  );
};

export default BackItem;
