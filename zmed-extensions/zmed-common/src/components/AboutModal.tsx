import React from 'react';
import PropTypes from 'prop-types';
import detect from 'browser-detect';
import { useTranslation } from 'react-i18next';

import {
  Icon,
  Typography,
} from '@ohif/ui';

const Link = ({ href, children, showIcon = false }) => {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      <Typography
        variant="subtitle"
        component="p"
        color="primaryActive"
        className="flex items-center"
      >
        {children}
        {!!showIcon && (
          <Icon name="external-link" className="w-5 ml-2 text-white" />
        )}
      </Typography>
    </a>
  );
};

const Row = ({ title, value, link }) => {
  return (
    <div className="flex mb-4">
      <Typography variant="subtitle" component="p" className="w-48 text-white">
        {title}
      </Typography>

      {link ? (
        <Link href={link}>{value}</Link>
      ) : (
        <Typography
          variant="subtitle"
          component="p"
          className="w-48 text-white"
        >
          {value}
        </Typography>
      )}
    </div>
  );
};

const AboutModal = ({ buildNumber, versionNumber, commitHash }) => {
  const { t } = useTranslation('AboutModal');
  const { os, version, name } = detect();
  const browser = `${name[0].toUpperCase()}${name.substr(1)} ${version}`;

  const renderRowTitle = title => (
    <div className="pb-3 mb-3 border-b-2 border-black">
      <Typography
        variant="inherit"
        color="primaryLight"
        className="text-[16px] font-semibold !leading-[1.2]"
      >
        {t(title)}
      </Typography>
    </div>
  );
  return (
    <div>
      {renderRowTitle('Important Links')}
      <div className="flex mb-8">
        <span className="ml-4">
          <Link href="https://z-union.ru/" showIcon={true}>
            {t("More details")}
          </Link>
        </span>
      </div>

      {renderRowTitle('Version Information')}
      <div className="flex flex-col">
        <Row title={t("Version number")} value={versionNumber} />
        {buildNumber && <Row title={t("Build number")} value={buildNumber} />}
        {commitHash && <Row title={t("Commit Hash")} value={commitHash} />}
        <Row title={t("Browser")} value={browser} />
        <Row title={t("OS")} value={os} />
      </div>
    </div>
  );
};

AboutModal.propTypes = {
  buildNumber: PropTypes.string,
  versionNumber: PropTypes.string,
};

export default AboutModal;
