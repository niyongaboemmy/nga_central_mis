/**
 * Code Playground — write, run and check code (lessons, exercises, the
 * /code-playground page). Import from here.
 */
export { default as CodePlayground } from "./CodePlayground";
export type { CodePlaygroundProps } from "./CodePlayground";
export { openPlayground, closePlayground } from "./store";
export type { PlaygroundRequest } from "./store";
export { LANGUAGES, languageById, resolveLanguage } from "./languages";
export type { PlaygroundLanguage } from "./languages";
export type { PlaygroundBlock } from "./playgroundData";
