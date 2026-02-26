const fs = require('fs');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

readJson('package.nls.json');
readJson('package.nls.ja.json');
console.log('nls ok');
