import React, {
  useEffect,
  useState,
  createRef,
  useCallback,
  useRef,
} from 'react';
import PropTypes from 'prop-types';
import * as PDFJS from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.entry';
PDFJS.GlobalWorkerOptions.workerSrc = pdfjsWorker;

function OHIFCornerstonePdfViewport({ displaySets }) {
  const [url, setUrl] = useState(null);
  const [pdfRef, setPdfRef] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  if (displaySets && displaySets.length > 1) {
    throw new Error(
      'OHIFCornerstonePdfViewport: only one display set is supported for dicom pdf right now'
    );
  }

  const { pdfUrl } = displaySets[0];
  const canvasRef = useRef();

  const renderPage = useCallback(
    (pageNum, pdf = pdfRef) => {
      pdf &&
        pdf.getPage(pageNum).then(function(page) {
          const viewport = page.getViewport({ scale: 1 });
          const canvas = canvasRef.current;
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          const renderContext = {
            canvasContext: canvas.getContext('2d'),
            viewport: viewport,
          };
          page.render(renderContext);
        });
    },
    [pdfRef]
  );

  useEffect(() => {
    renderPage(currentPage, pdfRef);
  }, [pdfRef, currentPage, renderPage]);

  useEffect(() => {
    const load = async () => {
      await pdfUrl;
      console.log('****************************************************');
      console.log(displaySets);
      console.log(pdfUrl);
      const loadedPdf = await PDFJS.getDocument(pdfUrl).promise;
      setPdfRef(loadedPdf);
    };

    load();
  }, [pdfUrl, displaySets]);

  // const nextPage = () => pdfRef && currentPage < pdfRef.numPages && setCurrentPage(currentPage + 1);

  // const prevPage = () => currentPage > 1 && setCurrentPage(currentPage - 1);

  return (
    <div className="bg-primary-black w-full h-full flex justify-center">
      <canvas ref={canvasRef}></canvas>
    </div>
  );
}

OHIFCornerstonePdfViewport.propTypes = {
  displaySets: PropTypes.arrayOf(PropTypes.object).isRequired,
};

export default OHIFCornerstonePdfViewport;
