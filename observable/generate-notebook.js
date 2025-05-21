import { notebook } from './basic-example.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function generateNotebook() {
  const notebookContent = JSON.stringify(notebook, null, 2);
  await fs.writeFile(
    path.join(__dirname, 'notebook.json'),
    notebookContent
  );
  console.log('Notebook JSON generated successfully!');
}

generateNotebook().catch(console.error); 