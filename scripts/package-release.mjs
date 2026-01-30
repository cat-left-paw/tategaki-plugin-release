import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

function run(cmd, args, options = {}) {
	return new Promise((resolve, reject) => {
		execFile(cmd, args, options, (error, stdout, stderr) => {
			if (error) {
				const detail = [
					`command: ${cmd} ${args.join(" ")}`,
					stdout ? `stdout:\n${stdout}` : null,
					stderr ? `stderr:\n${stderr}` : null,
				]
					.filter(Boolean)
					.join("\n\n");
				reject(new Error(`${error.message}\n\n${detail}`));
				return;
			}
			resolve({ stdout, stderr });
		});
	});
}

async function ensureDir(dir) {
	await fs.mkdir(dir, { recursive: true });
}

async function pathExists(targetPath) {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}

async function main() {
	const scriptDir = path.dirname(fileURLToPath(import.meta.url));
	const rootDir = path.resolve(scriptDir, "..");
	const withInstaller = process.argv.includes("--with-installer");
	const withDocs = process.argv.includes("--with-docs");
	const bundleMode = process.argv.includes("--bundle");

	const manifestPath = path.join(rootDir, "manifest.json");
	const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));

	const pluginId = String(manifest.id || "tategaki-plugin");
	const version = String(manifest.version || "0.0.0");

	const outDir = path.join(rootDir, "dist");
	await ensureDir(outDir);

	const stagingRoot = path.join(outDir, "__package_tmp");
	const stagingPluginDir = path.join(stagingRoot, pluginId);

	await fs.rm(stagingRoot, { recursive: true, force: true });
	await ensureDir(stagingPluginDir);

	const files = ["main.js", "manifest.json", "styles.css"];
	for (const filename of files) {
		const src = path.join(rootDir, filename);
		const dst = path.join(stagingPluginDir, filename);
		if (!(await pathExists(src))) {
			throw new Error(`Required file not found: ${src}`);
		}
		await fs.copyFile(src, dst);
	}

	if (withInstaller) {
		const installerAssetsDir = path.join(scriptDir, "installer-assets");
		const assets = [
			{
				src: path.join(installerAssetsDir, "Windows", "INSTALL.ps1"),
				dst: path.join(stagingRoot, "Windows", "install.ps1"),
				executable: false,
			},
			{
				src: path.join(installerAssetsDir, "Windows", "UNINSTALL.ps1"),
				dst: path.join(stagingRoot, "Windows", "uninstall.ps1"),
				executable: false,
			},
			{
				src: path.join(installerAssetsDir, "Windows", "INSTALL-HELPER.cmd"),
				dst: path.join(stagingRoot, "Windows", "install-helper.cmd"),
				executable: false,
			},
			{
				src: path.join(installerAssetsDir, "Windows", "UNINSTALL-HELPER.cmd"),
				dst: path.join(stagingRoot, "Windows", "uninstall-helper.cmd"),
				executable: false,
			},
			{
				src: path.join(installerAssetsDir, "macOS", "INSTALL.command"),
				dst: path.join(stagingRoot, "Mac", "install.command"),
				executable: true,
			},
			{
				src: path.join(installerAssetsDir, "macOS", "UNINSTALL.command"),
				dst: path.join(stagingRoot, "Mac", "uninstall.command"),
				executable: true,
			},
		];

		for (const asset of assets) {
			if (!(await pathExists(asset.src))) {
				throw new Error(`Installer asset not found: ${asset.src}`);
			}
			await ensureDir(path.dirname(asset.dst));
			const raw = await fs.readFile(asset.src, "utf8");
			const content = raw.replaceAll("__PLUGIN_ID__", pluginId);
			const needsBom = asset.dst.toLowerCase().endsWith(".ps1");
			const finalContent =
				needsBom && !content.startsWith("\uFEFF")
					? `\uFEFF${content}`
					: content;
			await fs.writeFile(asset.dst, finalContent, "utf8");
			if (asset.executable) {
				await fs.chmod(asset.dst, 0o755);
			}
		}
	}

	if (withDocs) {
		const docs = [
			"README.md",
			"INSTALL.md",
			"QUICKSTART.md",
			"MANUAL.md",
			"CHANGELOG.md",
		];
		for (const filename of docs) {
			const src = path.join(rootDir, filename);
			const dst = path.join(stagingRoot, filename);
			if (!(await pathExists(src))) {
				throw new Error(`Required file not found: ${src}`);
			}
			await fs.copyFile(src, dst);
		}
	}

	const zipName = bundleMode
		? `${pluginId}-v${version}.zip`
		: withInstaller
			? `${pluginId}-${version}-installer.zip`
			: `${pluginId}-${version}.zip`;
	const zipPath = path.join(outDir, zipName);
	if (await pathExists(zipPath)) {
		await fs.rm(zipPath, { force: true });
	}

	const platform = process.platform;
	const cwd = stagingRoot;

	if (platform === "win32") {
		const psCommand = withInstaller
			? `Compress-Archive -Path "*" -DestinationPath "${zipPath}" -Force`
			: `Compress-Archive -Path "${pluginId}" -DestinationPath "${zipPath}" -Force`;
		await run(
			"powershell",
			["-NoProfile", "-NonInteractive", "-Command", psCommand],
			{ cwd }
		);
	} else {
		const targets = [pluginId];
		if (withInstaller) {
			targets.push("Windows", "Mac");
		}
		if (withDocs) {
			targets.push(
				"README.md",
				"INSTALL.md",
				"QUICKSTART.md",
				"MANUAL.md",
				"CHANGELOG.md"
			);
		}
		const args = ["-r", zipPath, ...targets, "-x", "*.DS_Store"];
		await run("zip", args, { cwd });
	}

	await fs.rm(stagingRoot, { recursive: true, force: true });

	process.stdout.write(`Created: ${zipPath}\n`);
}

main().catch((error) => {
	process.stderr.write(`${error?.stack || error}\n`);
	process.exit(1);
});
