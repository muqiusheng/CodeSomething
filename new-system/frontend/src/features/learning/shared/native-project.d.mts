import type {LocalDirectory} from './local-project-files.mjs';
export type NativeConnection={id:string;token:string;name:string};
export function nativeDirectory(connection:NativeConnection,prefix?:string):LocalDirectory;
export function nativeAvailable():Promise<boolean>;
export function pickNativeDirectory(signal?:AbortSignal):Promise<LocalDirectory>;
