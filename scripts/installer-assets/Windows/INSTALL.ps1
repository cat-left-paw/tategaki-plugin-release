# Tategaki Plugin Installer (Windows)
# - GUIでVaultフォルダを選択してインストールします
# - 事前に Obsidian を終了してください

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$PluginId = "__PLUGIN_ID__"
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

if ([Threading.Thread]::CurrentThread.ApartmentState -ne "STA" -and -not $env:TATEGAKI_INSTALLER_STA) {
	try {
		$env:TATEGAKI_INSTALLER_STA = "1"
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
		Show-ConsoleMessage ("起動に失敗しました。`n`n" + $_.Exception.Message) "Tategaki インストーラー"
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

try {
	$scriptDir = Split-Path -Parent $PSCommandPath
	$packageRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
	$sourceDir = Join-Path $packageRoot $PluginId
	$sourceManifest = Join-Path $sourceDir "manifest.json"

	if (-not (Test-Path $sourceManifest)) {
		Show-Message "同じZip内に `"$PluginId`" フォルダが見つかりませんでした。Zipを正しく展開してから実行してください。" "Tategaki インストーラー" "Error"
		exit 1
	}

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
	$obsidianDir = Join-Path $vaultPath ".obsidian"

	if (-not (Test-Path $obsidianDir)) {
		$ok = Ask-YesNo "選んだフォルダに `.obsidian` が見つかりませんでした。本当にVaultフォルダですか？`n`n続行しますか？" "Tategaki インストーラー"
		if (-not $ok) { exit 0 }
	}

	$pluginsDir = Join-Path $obsidianDir "plugins"
	$destDir = Join-Path $pluginsDir $PluginId
	New-Item -ItemType Directory -Path $destDir -Force | Out-Null

	Copy-Item -Path (Join-Path $sourceDir "*") -Destination $destDir -Recurse -Force

	Show-Message "インストールが完了しました。`n`nインストール先:`n$destDir`n`nObsidian を再起動して、設定 → コミュニティプラグイン から有効化してください。" "Tategaki インストーラー" "Information"
} catch {
	Show-Message ("インストールに失敗しました。`n`n" + $_.Exception.Message) "Tategaki インストーラー" "Error"
	exit 1
}
