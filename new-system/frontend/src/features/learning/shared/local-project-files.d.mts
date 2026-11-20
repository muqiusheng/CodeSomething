export interface LocalFile {kind:'file';name:string;getFile():Promise<File>;createWritable():Promise<{write(value:string):Promise<void>;close():Promise<void>;abort?():Promise<void>}>}
export interface LocalDirectory {bridge?:{id:string;token:string;name:string};snapshot?:(course:string)=>Promise<Record<string,string>>;stamp?:(course:string)=>Promise<string>;kind:'directory';name:string;values():AsyncIterable<LocalDirectory|LocalFile>;getDirectoryHandle(name:string):Promise<LocalDirectory>;getFileHandle(name:string):Promise<LocalFile>;queryPermission(options:{mode:'readwrite'}):Promise<PermissionState>;requestPermission(options:{mode:'readwrite'}):Promise<PermissionState>}
export function listDirectory(root:LocalDirectory):Promise<(LocalFile|LocalDirectory)[]>;
export function isMissingProjectEntry(error:unknown):boolean;
export function openFilePresence(root:LocalDirectory,paths:string[]):Promise<Map<string,boolean|undefined>>;
export function readText(root:LocalDirectory,path:string):Promise<string>;
export function saveText(root:LocalDirectory,path:string,expected:string,value:string):Promise<void>;
export function collectCheckFiles(root:LocalDirectory,course:string):Promise<Record<string,string>>;
export function rememberDirectory(key:string,handle:LocalDirectory):Promise<unknown>;
export function recallDirectory(key:string):Promise<LocalDirectory|undefined>;

export function isProjectSourcePath(path:string):boolean;

export function projectStamp(root:LocalDirectory,course:string):Promise<string>;
