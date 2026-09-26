import '../polyfills';
import * as pdfjsLib from 'pdfjs-dist';
// Vite native URL import for assets inside node_modules:
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  // Suppress PDF.js warnings about TrueType font functions
  // These warnings are harmless and come from font parsing in certain PDFs
  const originalConsoleWarn = console.warn;
  console.warn = (...args: any[]) => {
    // Filter out PDF.js TrueType font warnings
    if (args[0] && typeof args[0] === 'string' && args[0].includes('TT: undefined function')) {
      return;
    }
    originalConsoleWarn.apply(console, args);
  };
}

export { pdfjsLib };
