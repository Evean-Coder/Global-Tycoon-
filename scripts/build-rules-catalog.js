'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { REGIONS, NEWS, OPPORTUNITIES } = require('../src/gameplayCatalog');
const target = path.join(__dirname, '../public/rules-catalog.js');
function content() {
  return "'use strict';\n// Generated from src/gameplayCatalog.js; run scripts/build-rules-catalog.js.\nwindow.RULES_CATALOG = " + JSON.stringify({ regions: REGIONS, news: NEWS, opportunities: OPPORTUNITIES }, null, 2) + ';\n';
}
function build(check = false) {
  const output = content();
  if (check) return fs.existsSync(target) && fs.readFileSync(target, 'utf8') === output;
  fs.writeFileSync(target, output);
  return true;
}
if (require.main === module && !build(process.argv.includes('--check'))) {
  process.stderr.write('公开规则目录与源不一致，请重新生成。\n');
  process.exitCode = 1;
}
module.exports = { content, build };
