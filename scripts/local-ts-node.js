#!/usr/bin/env node
const path = require("path");

require("./setup-test-env");

require("ts-node").register({
	project: path.resolve(__dirname, "../tsconfig.ts-node.json"),
	transpileOnly: true,
	skipProject: false,
	preferTsExts: true,
	compilerOptions: {
		module: "CommonJS",
	},
});

const args = process.argv.slice(2);
if (args.length === 0) {
	console.error("No entry file provided to local ts-node runner.");
	process.exit(1);
}

const [entry, ...rest] = args;
const resolvedEntry = path.resolve(process.cwd(), entry);

process.argv = [process.argv[0], resolvedEntry, ...rest];

require(resolvedEntry);
