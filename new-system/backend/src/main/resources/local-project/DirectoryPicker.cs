using System;
using System.IO;
using System.Text;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;

// A fixed-purpose native desktop chooser, with no command or root path argument.
public static class CodeSomethingDirectoryPicker {
 [ComImport,Guid("D57C7288-D4AD-4768-BE02-9D969532D960"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IFileOpenDialog {
  [PreserveSig] int Show(IntPtr owner);
  void SetFileTypes(uint count,IntPtr types);void SetFileTypeIndex(uint index);void GetFileTypeIndex(out uint index);void Advise(IntPtr events,out uint cookie);void Unadvise(uint cookie);
  void SetOptions(uint options);void GetOptions(out uint options);void SetDefaultFolder(IShellItem folder);void SetFolder(IShellItem folder);void GetFolder(out IShellItem folder);void GetCurrentSelection(out IShellItem item);
  void SetFileName([MarshalAs(UnmanagedType.LPWStr)]string name);void GetFileName(out IntPtr name);void SetTitle([MarshalAs(UnmanagedType.LPWStr)]string title);void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)]string text);void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)]string text);
  void GetResult(out IShellItem item);void AddPlace(IShellItem item,uint place);void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)]string extension);void Close(int result);void SetClientGuid(ref Guid guid);void ClearClientData();void SetFilter(IntPtr filter);void GetResults(out IntPtr items);void GetSelectedItems(out IntPtr items);
 }
 [ComImport,Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IShellItem {
  void BindToHandler(IntPtr context,ref Guid handler,ref Guid iid,out IntPtr result);void GetParent(out IShellItem parent);void GetDisplayName(uint kind,out IntPtr name);void GetAttributes(uint mask,out uint attributes);void Compare(IShellItem other,uint hint,out int order);
 }
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct Startup {
  public int cb;public string reserved,desktop,title;
  public int x,y,width,height,xchars,ychars,fill,flags;public short show,reservedSize;
  public IntPtr reservedBytes,input,output,error;
 }
 [StructLayout(LayoutKind.Sequential)] struct ProcessInfo {public IntPtr process,thread;public int pid,tid;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string app,StringBuilder command,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr env,string cwd,ref Startup startup,out ProcessInfo info);
 [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int kind);
 [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle,uint timeout);
 [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr handle,out uint code);
 [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr handle,uint code);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 [STAThread] public static int Main(string[] args) {
  if(args.Length==1&&args[0]=="--interactive")return Choose();
  if(args.Length!=0)return 1;
  var startup=new Startup();startup.cb=Marshal.SizeOf(typeof(Startup));startup.desktop="winsta0\\default";
  startup.flags=0x100;startup.input=GetStdHandle(-10);startup.output=GetStdHandle(-11);startup.error=GetStdHandle(-12);
  var executable=Assembly.GetExecutingAssembly().Location;ProcessInfo info;
  if(!CreateProcess(executable,new StringBuilder("\""+executable+"\" --interactive"),IntPtr.Zero,IntPtr.Zero,true,0x08000000,IntPtr.Zero,null,ref startup,out info))return 1;
  try{if(WaitForSingleObject(info.process,165000)!=0){TerminateProcess(info.process,2);return 2;}uint code;GetExitCodeProcess(info.process,out code);return (int)code;}
  finally{CloseHandle(info.thread);CloseHandle(info.process);}
 }
 static int Choose(){
  try{
   Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
   {
    var dialog=(IFileOpenDialog)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")));
    try{
     dialog.SetOptions(0x20|0x40|0x800|0x02000000);dialog.SetTitle("码起步 - 选择学习工程根目录");dialog.SetOkButtonLabel("连接此工程");
     int result=dialog.Show(IntPtr.Zero);if(result==unchecked((int)0x800704C7))return 0;Marshal.ThrowExceptionForHR(result);
     IShellItem item;dialog.GetResult(out item);try{IntPtr name;item.GetDisplayName(0x80058000,out name);try{string selected=Marshal.PtrToStringUni(name);using(var output=Console.OpenStandardOutput()){var bytes=new UTF8Encoding(false).GetBytes(selected);output.Write(bytes,0,bytes.Length);output.Flush();}}finally{Marshal.FreeCoTaskMem(name);}}finally{Marshal.ReleaseComObject(item);}
    }finally{Marshal.ReleaseComObject(dialog);}
   }
   return 0;
  }catch{return 1;}
 }
}
