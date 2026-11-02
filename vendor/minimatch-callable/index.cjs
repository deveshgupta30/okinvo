"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS module required by CommonJS dependants */
// minimatch 11 fixes GHSA-g3hv-75wg-m249 by matching without regular expressions, so it no longer
// exports a callable module or `makeRe`, and the parts of `Minimatch#set` are Matcher objects
// instead of RegExps. Dependants still on the minimatch 3 API (eslint-plugin-import,
// eslint-plugin-jsx-a11y, eslint-plugin-react and glob 7, which exceljs reaches through archiver
// and unzipper) get this module through pnpm.overrides, so they run on minimatch 11 unchanged.
const mm = require("minimatch");

function minimatch(path, pattern, options) {
  return mm.minimatch(path, pattern, options);
}

// eslint-plugin-import only calls `.test()` on what makeRe returns.
function makeRe(pattern, options) {
  const matcher = new mm.Minimatch(pattern, options);
  return { test: (path) => matcher.match(path) };
}

// glob 7 matches a directory entry against a set part with `entry.match(part)` and reads
// `part._glob`; RegExp parts had both, so Matcher gets them here. Adding members leaves
// minimatch's own behaviour untouched.
const Matcher = new mm.Minimatch("*").set[0][0].constructor;
if (!(Symbol.match in Matcher.prototype)) {
  Object.defineProperties(Matcher.prototype, {
    [Symbol.match]: {
      value(entry) {
        return this.test(entry) ? [entry] : null;
      },
    },
    _glob: {
      get() {
        return this.pattern;
      },
    },
  });
}

module.exports = Object.assign(minimatch, mm, { default: minimatch, makeRe });
