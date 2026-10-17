import { boundary } from './boundaries.mjs';

export function openDialogMode(app, data) { boundary.dialog = { app, data }; }
