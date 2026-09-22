import '../polyfills';
import * as pdfjsLib from 'pdfjs-dist';
// Vite native URL import for assets inside node_modules:
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

export { pdfjsLib };
