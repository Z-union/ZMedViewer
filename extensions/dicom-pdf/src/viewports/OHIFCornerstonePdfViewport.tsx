import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';

function OHIFCornerstonePdfViewport({ displaySets }) {
  const [url, setUrl] = useState(null);

  if (displaySets && displaySets.length > 1) {
    throw new Error(
      'OHIFCornerstonePdfViewport: only one display set is supported for dicom pdf right now'
    );
  }

  const { pdfUrl } = displaySets[0];

  useEffect(() => {
    const load = async () => {
      await pdfUrl;
      console.log('****************************************************');
      console.log(displaySets);
      console.log(pdfUrl);
      setUrl(pdfUrl);
    };

    load();
  }, [pdfUrl]);

  return (
    <div className="bg-primary-black w-full h-full">
      {/* <iframe src={url} className="w-full h-full"></iframe> "text/plain" */}
      <object
        aria-label="PDF Viewer"
        data={url}
        type="application/pdf"
        className="w-full h-full"
        crossOrigin
      >
        <div>No online PDF viewer installed</div>
      </object>
    </div>
  );
}

OHIFCornerstonePdfViewport.propTypes = {
  displaySets: PropTypes.arrayOf(PropTypes.object).isRequired,
};

export default OHIFCornerstonePdfViewport;
