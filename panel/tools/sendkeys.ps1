# sendkeys.ps1 — force After Effects to the foreground (bypassing the Windows
# foreground-lock via AttachThreadInput) and send a SendKeys string to it.
# Invoked by the panel's keystroke layer: powershell -File sendkeys.ps1 -Keys "^s"
param([Parameter(Mandatory = $true)][string]$Keys)

Add-Type -AssemblyName System.Windows.Forms

$sig = @"
using System;
using System.Runtime.InteropServices;
public class Fg {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
}
"@
Add-Type -TypeDefinition $sig

$proc = Get-Process AfterFX -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if ($proc) {
  $h = $proc.MainWindowHandle
  $fg = [Fg]::GetForegroundWindow()
  $tCur = [Fg]::GetCurrentThreadId()
  $pidFg = [uint32]0; $tFg = [Fg]::GetWindowThreadProcessId($fg, [ref]$pidFg)
  $pidAe = [uint32]0; $tAe = [Fg]::GetWindowThreadProcessId($h, [ref]$pidAe)
  [void][Fg]::AttachThreadInput($tCur, $tAe, $true)
  if ($tFg -ne $tCur) { [void][Fg]::AttachThreadInput($tFg, $tAe, $true) }
  [void][Fg]::ShowWindow($h, 5)        # SW_SHOW
  [void][Fg]::BringWindowToTop($h)
  [void][Fg]::SetForegroundWindow($h)
  Start-Sleep -Milliseconds 220
  [void][Fg]::AttachThreadInput($tCur, $tAe, $false)
  if ($tFg -ne $tCur) { [void][Fg]::AttachThreadInput($tFg, $tAe, $false) }
}
Start-Sleep -Milliseconds 100
[System.Windows.Forms.SendKeys]::SendWait($Keys)
