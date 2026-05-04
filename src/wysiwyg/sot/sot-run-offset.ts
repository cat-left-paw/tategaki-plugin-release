export type SoTRunTextNodeInfo = {
	from: number;
	to: number;
	textNode: Text;
};

export type SoTRunTextPosition = {
	node: Text;
	offset: number;
};

function clampTextOffset(node: Text, offset: number): number {
	return Math.max(0, Math.min(offset, node.length));
}

export function findSoTRunTextPositionAtOffset(
	runInfos: readonly SoTRunTextNodeInfo[],
	safeLocal: number,
): SoTRunTextPosition | null {
	const first = runInfos[0];
	const last = runInfos[runInfos.length - 1];
	if (!first || !last) return null;

	if (safeLocal <= first.from) {
		return { node: first.textNode, offset: 0 };
	}
	if (safeLocal >= last.to) {
		return {
			node: last.textNode,
			offset: clampTextOffset(last.textNode, last.to - last.from),
		};
	}

	for (let i = 0; i < runInfos.length; i += 1) {
		const run = runInfos[i]!;
		const next = runInfos[i + 1];
		if (next && safeLocal === run.to && next.from === run.to) {
			return { node: next.textNode, offset: 0 };
		}
		if (safeLocal >= run.from && safeLocal < run.to) {
			return {
				node: run.textNode,
				offset: clampTextOffset(run.textNode, safeLocal - run.from),
			};
		}
		if (safeLocal === run.to) {
			return {
				node: run.textNode,
				offset: clampTextOffset(run.textNode, run.to - run.from),
			};
		}
		if (next && safeLocal > run.to && safeLocal < next.from) {
			return { node: next.textNode, offset: 0 };
		}
	}

	return {
		node: last.textNode,
		offset: clampTextOffset(last.textNode, last.to - last.from),
	};
}
