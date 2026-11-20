/// <reference types="vite/client" />
declare module 'monaco-editor/editor/browser/coreCommands.js';
declare module 'monaco-editor/editor/contrib/find/browser/findController.js';
declare module 'monaco-editor/editor/contrib/clipboard/browser/clipboard.js';
// Monaco's contribution entry is side-effect-only and does not ship declarations.
declare module 'monaco-editor/editor/contrib/suggest/browser/suggestController.js';
