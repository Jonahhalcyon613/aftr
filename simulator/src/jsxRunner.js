// jsxRunner.js — loads the real bundled JSX and runs dispatch() against the
// mock AE DOM. This is the key piece: the same JSX code that runs in After
// Effects runs here against mock objects, so we validate the actual command
// implementations, not a separate test copy.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createMockAeDom } from './mockAeDom.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLE_PATH = resolve(__dirname, '..', '..', 'panel', 'jsx', 'bundle.jsx');

/**
 * Create a JSX runner instance. Each instance has its own mock AE DOM and a
 * fresh VM context, so tests can run in isolation.
 */
export function createJsxRunner() {
  const dom = createMockAeDom();

  // Build a sandbox that mirrors what the JSX engine sees in AE.
  const sandbox = {
    app: dom.app,
    File: dom.File,
    CompItem: dom.CompItem,
    // $ is the ExtendScript global object.
    $: {
      evalFile: function () { /* no-op in simulator */ },
    },
    // Console-like for debugging (JSX has no console).
    alert: function () {},
    confirm: function () { return true; },
    prompt: function () { return ''; },
  };

  // Create a V8 context with the sandbox.
  const context = vm.createContext(sandbox);

  // Load and execute the bundled JSX in the sandbox.
  let bundleCode;
  try {
    bundleCode = readFileSync(BUNDLE_PATH, 'utf8');
  } catch (e) {
    throw new Error(
      `Failed to read JSX bundle at ${BUNDLE_PATH}. ` +
      `Run "npm run build:jsx" first. Error: ${e.message}`
    );
  }

  vm.runInContext(bundleCode, context, { filename: 'bundle.jsx' });

  // The bundle defines dispatch() and COMMANDS in the sandbox.
  // Extract dispatch for direct calling.

  return {
    /**
     * Execute a command through the JSX dispatch function.
     * @param {string} command
     * @param {object} params
     * @returns {{ok:boolean, result?:any, error?:string}}
     */
    dispatch(command, params = {}) {
      const paramsJson = JSON.stringify(params);
      const resultJson = vm.runInContext(
        `dispatch(${JSON.stringify(command)}, ${JSON.stringify(paramsJson)})`,
        context,
      );
      return JSON.parse(resultJson);
    },

    /** Access the mock AE DOM for assertions. */
    get dom() { return dom; },

    /** Reset the mock AE state (clears all comps/layers). */
    reset() { dom.reset(); },

    /** Get the list of registered command names. */
    get commandNames() {
      return vm.runInContext('Object.keys(COMMANDS)', context);
    },
  };
}
