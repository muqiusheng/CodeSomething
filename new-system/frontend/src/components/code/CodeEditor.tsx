import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import {useEffect,useImperativeHandle,useRef,useState,type Ref} from 'react';
import {Keyboard,Lightbulb,Maximize2,Minimize2} from 'lucide-react';
import {completionCandidates} from './completions';
import type * as Monaco from 'monaco-editor/editor/editor.api.js';
import {useTheme} from '../../theme/theme';
import '../../styles/browser-workspace.css';

(globalThis as typeof globalThis & {MonacoEnvironment:unknown}).MonacoEnvironment={getWorker:()=>new EditorWorker()};
let runtime:Promise<typeof Monaco>|undefined;
function loadEditor(){return runtime??=Promise.all([
 import('monaco-editor/editor/editor.api.js'),
 import('monaco-editor/editor/browser/coreCommands.js'),
 import('monaco-editor/editor/contrib/find/browser/findController.js'),
 import('monaco-editor/editor/contrib/clipboard/browser/clipboard.js'),
 import('monaco-editor/editor/contrib/suggest/browser/suggestController.js'),
 import('monaco-editor/features/snippet/register'),
 import('monaco-editor/features/hover/register'),
 import('monaco-editor/languages/definitions/java/register.js'),
 import('monaco-editor/languages/definitions/sql/register.js'),
 import('monaco-editor/languages/definitions/xml/register.js'),
]).then(([api])=>{
 for(const language of ['java','sql'])api.languages.registerCompletionItemProvider(language,{triggerCharacters:['.','@'],provideCompletionItems(model,position){const word=model.getWordUntilPosition(position),line=model.getLineContent(position.lineNumber).slice(0,position.column-1);const start=word.startColumn>1&&model.getLineContent(position.lineNumber)[word.startColumn-2]==='@'?word.startColumn-1:word.startColumn;return {suggestions:completionCandidates(language,line,model.getValue()).filter(item=>start===word.startColumn||item.label.startsWith('@')).map(item=>({...item,kind:item.snippet?api.languages.CompletionItemKind.Snippet:api.languages.CompletionItemKind.Keyword,insertTextRules:item.snippet?api.languages.CompletionItemInsertTextRule.InsertAsSnippet:undefined,range:new api.Range(position.lineNumber,start,position.lineNumber,word.endColumn)}))}}});
 return api;
});}
export type CodeEditorHandle = {getSelectedText(): string};

export function CodeEditor({path,value,onChange,readOnly=false,line,errorLine,selectionRef}:{path:string;value:string;onChange:(value:string)=>void;readOnly?:boolean;line?:number;errorLine?:number;selectionRef?:Ref<CodeEditorHandle>}){
 const host=useRef<HTMLDivElement>(null),instance=useRef<Monaco.editor.IStandaloneCodeEditor|null>(null),api=useRef<typeof Monaco|null>(null);
 const applyingValue=useRef(false);
 const models=useRef(new Map<string, {model:Monaco.editor.ITextModel;view:Monaco.editor.ICodeEditorViewState|null}>());
 const activePath=useRef<string|undefined>(undefined);
 function showFile(editor:Monaco.editor.IStandaloneCodeEditor, monaco:typeof Monaco, path:string, value:string) {
  const switching=activePath.current!==path;
  const previous=activePath.current===undefined?undefined:models.current.get(activePath.current);
  if(switching&&previous)previous.view=editor.saveViewState();

  let file=models.current.get(path);
  if(!file){
   file={model:monaco.editor.createModel(value,language(path)),view:null};
   models.current.set(path,file);
  }
  applyingValue.current=true;
  try{
   const model=file.model;
   const next=value.replace(/\r\n?/g,'\n');
   const current=model.getValue(monaco.editor.EndOfLinePreference.LF);
   if(current!==next){
    // Keep the external edit as a single undo step on this file's model.
    let start=0,end=0;
    while(start<current.length&&start<next.length&&current[start]===next[start])start++;
    while(end<current.length-start&&end<next.length-start&&current[current.length-1-end]===next[next.length-1-end])end++;
    if(/[\uDC00-\uDFFF]/.test(current[start]??'')||/[\uDC00-\uDFFF]/.test(next[start]??''))start=Math.max(0,start-1);
    if(end&&(/[\uDC00-\uDFFF]/.test(current[current.length-end]??'')||/[\uDC00-\uDFFF]/.test(next[next.length-end]??'')))end--;
    const asOffset=(index:number)=>model.getEOL()==='\n'?index:current.slice(0,index).replaceAll('\n','\r\n').length;
    const from=model.getPositionAt(asOffset(start)), to=model.getPositionAt(asOffset(current.length-end));
    model.pushStackElement();
    model.pushEditOperations(null,[{range:monaco.Range.fromPositions(from,to),text:next.slice(start,next.length-end)}],()=>null);
    model.pushStackElement();
   }
   if(switching){
    editor.setModel(model);
    activePath.current=path;
    if(file.view)editor.restoreViewState(file.view);
   }
  }finally{applyingValue.current=false}
 }

 const errorDecoration=useRef<Monaco.editor.IEditorDecorationsCollection|null>(null);
 function showError(editor:Monaco.editor.IStandaloneCodeEditor,line?:number) {
  errorDecoration.current?.clear();
  const model=editor.getModel();
  if(!model||!line||line<1||line>model.getLineCount())return;
  errorDecoration.current=editor.createDecorationsCollection([{
   range:{startLineNumber:line,startColumn:1,endLineNumber:line,endColumn:model.getLineMaxColumn(line)},
   options:{isWholeLine:true,className:'code-diagnostic-line'},
  }]);
  editor.revealLineInCenter(line);
 }
 const latest=useRef({value,onChange,path,readOnly,line,errorLine});latest.current={value,onChange,path,readOnly,line,errorLine};
 const [failed,setFailed]=useState(false);const {resolved}=useTheme();
 const panel=useRef<HTMLDialogElement>(null),expandButton=useRef<HTMLButtonElement>(null);
 const fallback=useRef<HTMLTextAreaElement>(null);
 useImperativeHandle(selectionRef,()=>({getSelectedText(){
  const editor=instance.current, range=editor?.getSelection();
  if(range)return editor?.getModel()?.getValueInRange(range,api.current?.editor.EndOfLinePreference.LF)??'';
  const input=fallback.current;
  return input?input.value.slice(input.selectionStart,input.selectionEnd):'';
 }}),[]);
 const [shortcuts,setShortcuts]=useState(false);
 const [expanded,setExpanded]=useState(false);
 function restore(){panel.current?.close();setExpanded(false);expandButton.current?.focus()}
 function expand(){panel.current?.showModal();setExpanded(true)}
 useEffect(()=>{if(!expanded)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous}},[expanded]);
 useEffect(()=>{let active=true;let dispose:(()=>void)|undefined;
  void loadEditor().then(monaco=>{if(!active||!host.current)return;api.current=monaco;monaco.editor.defineTheme('cs-code-light',{base:'vs',inherit:true,rules:[{token:'annotation',foreground:'626270'}],colors:{}});monaco.editor.defineTheme('cs-code-dark',{base:'vs-dark',inherit:true,rules:[{token:'comment',foreground:'92AD9B'},{token:'annotation',foreground:'D6A0A8'}],colors:{'editor.background':'#160d2e','editorGutter.background':'#160d2e','editor.lineHighlightBackground':'#21153b','editor.selectionBackground':'#523875'}});
   const editor=monaco.editor.create(host.current,{model:null,readOnly:latest.current.readOnly,automaticLayout:true,editContext:false,minimap:{enabled:false},fontSize:14,lineHeight:23,fontFamily:'Consolas, monospace',scrollBeyondLastLine:false,wordWrap:'on',tabSize:4,insertSpaces:true,quickSuggestions:{other:true,comments:false,strings:false},suggestOnTriggerCharacters:true,tabCompletion:'on',snippetSuggestions:'top',wordBasedSuggestions:'off',suggest:{showWords:false,preview:true},accessibilitySupport:'on',ariaLabel:'代码编辑器 '+latest.current.path,theme:document.documentElement.dataset.theme==='dark'?'cs-code-dark':'cs-code-light',padding:{top:14,bottom:14}});
   instance.current=editor;
   showFile(editor,monaco,latest.current.path,latest.current.value);
   showError(editor,latest.current.errorLine);
   if(latest.current.line){editor.revealLineInCenter(latest.current.line);editor.setPosition({lineNumber:latest.current.line,column:1});editor.focus()}
   const changed=editor.onDidChangeModelContent(()=>{
    if(!applyingValue.current&&activePath.current===latest.current.path)latest.current.onChange(editor.getValue());
   });
   dispose=()=>{
    changed.dispose();
    errorDecoration.current=null;
    editor.dispose();
    for(const {model} of models.current.values())model.dispose();
    models.current.clear();
    activePath.current=undefined;
    api.current=null;
    instance.current=null;
   };
  }).catch(()=>{if(active)setFailed(true)});
  return()=>{active=false;dispose?.()};
 },[]);
 useEffect(()=>{
  const editor=instance.current;
  if(!editor||!api.current)return;
  showFile(editor,api.current,path,value);
  editor.updateOptions({ariaLabel:'代码编辑器 '+path,readOnly});
 },[path,value,readOnly]);
 useEffect(()=>{if(instance.current)showError(instance.current,errorLine)},[errorLine,path]);
 useEffect(()=>{api.current?.editor.setTheme(resolved==='dark'?'cs-code-dark':'cs-code-light')},[resolved]);
 useEffect(()=>{if(line&&instance.current){instance.current.revealLineInCenter(line);instance.current.setPosition({lineNumber:line,column:1});instance.current.focus()}},[line,path]);
 return <dialog ref={panel} className="code-editor-shell" role={expanded?'dialog':'region'} aria-label={'编辑 '+path} aria-modal={expanded?true:undefined} onKeyDownCapture={e=>{if(expanded&&e.key==='Escape'){e.preventDefault();e.stopPropagation();restore()}}} onCancel={e=>{e.preventDefault();restore()}} onClose={()=>setExpanded(false)}>
 <div className="editor-floating-tools">
  {!readOnly&&<button type="button" className="button secondary" aria-label="代码提示" title="代码提示（Ctrl+Space）" onClick={()=>{instance.current?.focus();instance.current?.trigger('toolbar','editor.action.triggerSuggest',{})}}><Lightbulb size={15}/></button>}
  <button ref={expandButton} type="button" className="button secondary" title={expanded?'还原编辑器':readOnly?'放大查看':'放大编辑'} aria-label={expanded?'还原编辑器':readOnly?'放大查看':'放大编辑'} aria-expanded={expanded} onClick={expanded?restore:expand}>{expanded?<Minimize2 size={15}/>:<Maximize2 size={15}/>}</button>
 </div>
 <div className="code-editor-area">{failed?<><p role="status">编辑器加载失败，可继续使用文本编辑。</p><textarea ref={fallback} aria-label={'代码编辑器 '+path} value={value} readOnly={readOnly} onChange={e=>onChange(e.target.value)} spellCheck={false}/></>:<div ref={host} className="code-editor"/>}</div><div className="editor-shortcuts" data-open={shortcuts} onKeyDown={event=>{if(event.key==='Escape')setShortcuts(false)}}><button type="button" aria-label="编辑器快捷键" aria-expanded={shortcuts} onClick={()=>setShortcuts(value=>!value)}><Keyboard size={16}/></button><span>UTF-8 · {expanded?'Esc 还原 · ':''}{readOnly?'只读查看':'Ctrl+Space 提示 · Enter 采纳 · Tab 下一处 · Ctrl+F 查找 · Ctrl+M 切换焦点移动'}</span></div></dialog>;
}
function language(path:string){return path.endsWith('.java')?'java':path.endsWith('.sql')?'sql':path.endsWith('.xml')?'xml':'plaintext'}
