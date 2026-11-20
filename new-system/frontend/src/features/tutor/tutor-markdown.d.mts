export function markdownBlocks(source:string):({kind:'paragraph';text:string}|{kind:'code';text:string;language:string}|{kind:'list';items:string[]})[];
