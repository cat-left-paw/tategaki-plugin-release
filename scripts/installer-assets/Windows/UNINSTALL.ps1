# Tategaki Plugin Uninstaller (Windows)
# - GUIでVaultフォルダを選択してアンインストールします
# - 事前に Obsidian を終了してください

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$PluginId = "__PLUGIN_ID__"
$BackupRelPath = ".obsidian\\tategaki-sync-backups"
$FormsAvailable = $false

function Show-ConsoleMessage([string]$message, [string]$title) {
	Write-Host ""
	Write-Host "[$title]"
	Write-Host $message
	Write-Host ""
	Read-Host "Enterで閉じます" | Out-Null
}

function Initialize-Ui() {
	try {
		Add-Type -AssemblyName System.Windows.Forms -ErrorAction Stop
		[System.Windows.Forms.Application]::EnableVisualStyles()
		$script:FormsAvailable = $true
	} catch {
		$script:FormsAvailable = $false
	}
}

if ([Threading.Thread]::CurrentThread.ApartmentState -ne "STA" -and -not $env:TATEGAKI_UNINSTALLER_STA) {
	try {
		$env:TATEGAKI_UNINSTALLER_STA = "1"
		$hostExe = (Get-Command powershell.exe -ErrorAction SilentlyContinue).Source
		if (-not $hostExe) { $hostExe = (Get-Process -Id $PID).Path }
		if (-not $hostExe) { $hostExe = "powershell" }
		Start-Process -FilePath $hostExe -ArgumentList @(
			"-NoProfile",
			"-ExecutionPolicy", "Bypass",
			"-STA",
			"-File", $PSCommandPath
		) -Wait
	} catch {
		Show-ConsoleMessage ("起動に失敗しました。`n`n" + $_.Exception.Message) "Tategaki アンインストーラー"
	}
	exit 0
}

Initialize-Ui

function Show-Message([string]$message, [string]$title, [string]$icon = "Information") {
	if (-not $script:FormsAvailable) {
		Show-ConsoleMessage $message $title
		return
	}
	$buttons = [System.Windows.Forms.MessageBoxButtons]::OK
	$mbIcon = [System.Windows.Forms.MessageBoxIcon]::$icon
	[System.Windows.Forms.MessageBox]::Show($message, $title, $buttons, $mbIcon) | Out-Null
}

function Ask-YesNo([string]$message, [string]$title) {
	if (-not $script:FormsAvailable) {
		$input = Read-Host "$message (y/N)"
		return $input -match "^(y|yes)$"
	}
	$buttons = [System.Windows.Forms.MessageBoxButtons]::YesNo
	$icon = [System.Windows.Forms.MessageBoxIcon]::Warning
	$result = [System.Windows.Forms.MessageBox]::Show($message, $title, $buttons, $icon)
	return $result -eq [System.Windows.Forms.DialogResult]::Yes
}

function Normalize-VaultPath([string]$p) {
	$p = (Resolve-Path $p).Path

	$leaf = Split-Path -Leaf $p
	if ($leaf -ieq "plugins") {
		$p = Split-Path -Parent $p
		$leaf = Split-Path -Leaf $p
	}
	if ($leaf -ieq ".obsidian") {
		$p = Split-Path -Parent $p
	}
	return $p
}

function Move-ToRecycleBin([string]$path) {
	try {
		Add-Type -AssemblyName Microsoft.VisualBasic
		if (Test-Path -Path $path -PathType Container) {
			[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory(
				$path,
				"OnlyErrorDialogs",
				"SendToRecycleBin"
			)
		} elseif (Test-Path -Path $path -PathType Leaf) {
			[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(
				$path,
				"OnlyErrorDialogs",
				"SendToRecycleBin"
			)
		}
		return $true
	} catch {
		return $false
	}
}

function Remove-PathSafely([string]$path, [string]$label) {
	if (-not (Test-Path $path)) { return }

	$ok = Ask-YesNo "$label を削除します（ゴミ箱へ移動）。続行しますか？`n`n$path" "Tategaki アンインストーラー"
	if (-not $ok) { return }

	if (-not (Move-ToRecycleBin $path)) {
		$ok2 = Ask-YesNo "ゴミ箱へ移動できませんでした。完全に削除しますか？`n`n$path" "Tategaki アンインストーラー"
		if (-not $ok2) { return }
		Remove-Item -Path $path -Recurse -Force
	}
}

try {
	$vaultPath = $null
	if ($FormsAvailable) {
		$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
		$dialog.Description = "Obsidian の Vault フォルダを選択してください（`.obsidian` の外側のフォルダ）"
		$dialog.ShowNewFolderButton = $false
		if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
			exit 0
		}
		$vaultPath = Normalize-VaultPath $dialog.SelectedPath
	} else {
		$input = Read-Host "Vaultフォルダのパスを入力してください（`.obsidian` の外側）"
		if (-not $input) { exit 0 }
		$vaultPath = Normalize-VaultPath $input
	}
	$pluginPath = Join-Path $vaultPath (".obsidian\\plugins\\" + $PluginId)
	$backupPath = Join-Path $vaultPath $BackupRelPath

	if (-not (Test-Path $pluginPath)) {
		Show-Message "プラグインフォルダが見つかりませんでした。`n`n$pluginPath" "Tategaki アンインストーラー" "Warning"
		exit 0
	}

	Remove-PathSafely $pluginPath "プラグインフォルダ"

	if (Test-Path $backupPath) {
		Remove-PathSafely $backupPath "同期バックアップフォルダ（任意）"
	}

	Show-Message "アンインストールが完了しました。" "Tategaki アンインストーラー" "Information"
} catch {
	Show-Message ("アンインストールに失敗しました。`n`n" + $_.Exception.Message) "Tategaki アンインストーラー" "Error"
	exit 1
}
