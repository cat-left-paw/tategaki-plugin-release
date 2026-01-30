export interface SemverParts {
	major: number;
	minor: number;
	patch: number;
	preRelease: Array<string | number>;
}

function parseSemverIdentifier(id: string): string | number {
	if (/^(0|[1-9]\d*)$/.test(id)) {
		return Number(id);
	}
	return id;
}

export function parseSemver(input: string): SemverParts | null {
	const value = String(input ?? "").trim();
	if (!value) return null;

	// Allow leading "v" (e.g. v1.2.3)
	const normalized = value.startsWith("v") ? value.slice(1) : value;
	const withoutBuild = normalized.split("+")[0] ?? normalized;
	const [mainPart, preReleasePart] = withoutBuild.split("-", 2);
	if (!mainPart) return null;

	const nums = mainPart.split(".").map((p) => p.trim());
	if (nums.length < 1 || nums.length > 3) return null;

	const major = Number(nums[0] ?? "NaN");
	const minor = Number(nums[1] ?? "0");
	const patch = Number(nums[2] ?? "0");
	if (![major, minor, patch].every((n) => Number.isInteger(n) && n >= 0)) {
		return null;
	}

	const preRelease = preReleasePart
		? preReleasePart
				.split(".")
				.map((p) => p.trim())
				.filter((p) => p.length > 0)
				.map(parseSemverIdentifier)
		: [];

	return {
		major,
		minor,
		patch,
		preRelease,
	};
}

export function compareSemver(a: string, b: string): number | null {
	const pa = parseSemver(a);
	const pb = parseSemver(b);
	if (!pa || !pb) return null;

	if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
	if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
	if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;

	const aPre = pa.preRelease;
	const bPre = pb.preRelease;
	const aHasPre = aPre.length > 0;
	const bHasPre = bPre.length > 0;

	// A version without pre-release has higher precedence than one with pre-release.
	if (aHasPre !== bHasPre) return aHasPre ? -1 : 1;
	if (!aHasPre && !bHasPre) return 0;

	const len = Math.max(aPre.length, bPre.length);
	for (let index = 0; index < len; index++) {
		const ai = aPre[index];
		const bi = bPre[index];
		if (ai === undefined) return -1;
		if (bi === undefined) return 1;

		if (ai === bi) continue;

		const aNum = typeof ai === "number";
		const bNum = typeof bi === "number";
		if (aNum && bNum) {
			return ai > (bi as number) ? 1 : -1;
		}
		if (aNum !== bNum) {
			// Numeric identifiers have lower precedence than non-numeric identifiers.
			return aNum ? -1 : 1;
		}

		const as = String(ai);
		const bs = String(bi);
		return as > bs ? 1 : -1;
	}

	return 0;
}

