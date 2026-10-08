# Manda un archivo binario tal cual (RAW) a una impresora de Windows por
# nombre, sin pasar por el dialogo de impresion ni por el renderizado
# normal de texto/GDI. Es el patron clasico "RawPrinterHelper" que usa la
# API WritePrinter de winspool.drv via P/Invoke: funciona con la impresora
# tal como Windows ya la tiene instalada (no hace falta compartirla ni
# cambiarle el driver).
#
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File print-raw.ps1 -PrinterName "POS-58-Series" -FilePath "C:\ruta\ticket.bin"

param(
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [Parameter(Mandatory = $true)][string]$FilePath
)

$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

    public static bool SendBytesToPrinter(string printerName, byte[] bytes, out int errorCode)
    {
        IntPtr hPrinter;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "MaderoSys Ticket";
        di.pDataType = "RAW";
        bool success = false;
        errorCode = 0;

        if (OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
        {
            if (StartDocPrinter(hPrinter, 1, di))
            {
                if (StartPagePrinter(hPrinter))
                {
                    IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
                    Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
                    int written;
                    success = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out written);
                    Marshal.FreeCoTaskMem(pUnmanagedBytes);
                    EndPagePrinter(hPrinter);
                }
                EndDocPrinter(hPrinter);
            }
            ClosePrinter(hPrinter);
        }
        if (!success) { errorCode = Marshal.GetLastWin32Error(); }
        return success;
    }
}
"@

$bytes = [System.IO.File]::ReadAllBytes($FilePath)
$errorCode = 0
$ok = [RawPrinterHelper]::SendBytesToPrinter($PrinterName, $bytes, [ref]$errorCode)

if ($ok) {
  Write-Output "OK"
  exit 0
} else {
  Write-Error "No se pudo imprimir en '$PrinterName' (codigo de error de Windows: $errorCode)"
  exit 1
}
