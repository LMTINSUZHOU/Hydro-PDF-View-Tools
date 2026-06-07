const fs = require('fs');
const path = require('path');

const packageRoot = path.dirname(require.resolve('pdfjs-dist/package.json'));
const outputRoot = path.resolve(__dirname, '..', 'public', 'hydro-pdf-viewer', 'pdfjs');

function copyFile(relativePath) {
  const source = path.join(packageRoot, relativePath);
  const target = path.join(outputRoot, path.basename(relativePath));
  fs.copyFileSync(source, target);
}

function copyDir(relativePath) {
  const source = path.join(packageRoot, relativePath);
  const target = path.join(outputRoot, relativePath);
  if (!fs.existsSync(source)) return;
  fs.cpSync(source, target, { recursive: true });
}

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });

copyFile('build/pdf.mjs');
copyFile('build/pdf.worker.mjs');
copyDir('cmaps');
copyDir('standard_fonts');
