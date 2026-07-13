// Barrel for the shared protocol/contract layer.
// This module is the single source of truth for the wire format and command
// registry. It is consumed by the controller and the headless simulator. The
// CEP panel carries its own minimal copy of the envelope helpers so it can be
// copied standalone into the Adobe CEP extensions folder.
export * from './protocol.js';
export * from './commands.js';
export * from './validate.js';
