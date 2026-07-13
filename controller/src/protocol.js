// protocol.js — controller-local re-export of the shared wire format. Kept as a
// named module (per the build spec's file layout) so controller code imports
// './protocol.js' while the single source of truth stays in @ae-bridge/shared.
export * from '@ae-bridge/shared/protocol';
