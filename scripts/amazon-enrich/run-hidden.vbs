' Lanzador sin ventana para la tarea programada de Windows. node.exe es una
' app de consola y abriría una ventana cada 5 min; con Run(..., 0) no aparece
' nada, así que teclear o hacer clic no puede interferir con el proceso.
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)
shell.Run "cmd /c """"C:\Program Files\nodejs\node.exe"" enrich.js --if-pending >> enrich.log 2>&1""", 0, True
