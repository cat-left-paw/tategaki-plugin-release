export type HeadingLineInfo = {
	prefix: string;
	content: string;
	level: number;
	hasHeading: boolean;
};

export type ListLineInfo = {
	prefix: string;
	indent: string;
	content: string;
	kind: "none" | "bullet" | "ordered" | "task";
};

export const parseHeadingLine = (lineText: string): HeadingLineInfo => {
	let prefix = "";
	let rest = lineText;
	const quoteMatch = rest.match(/^([ \t]{0,3}(?:> ?)+)(.*)$/);
	if (quoteMatch) {
		prefix += quoteMatch[1] ?? "";
		rest = quoteMatch[2] ?? "";
	}
	const taskMatch = rest.match(/^([ \t]*)([-+*])[ \t]+\[([ xX])\][ \t]+/);
	if (taskMatch && taskMatch[0]) {
		prefix += taskMatch[0];
		rest = rest.slice(taskMatch[0].length);
	} else {
		const bulletMatch = rest.match(/^([ \t]*)([-+*])[ \t]+/);
		if (bulletMatch && bulletMatch[0]) {
			prefix += bulletMatch[0];
			rest = rest.slice(bulletMatch[0].length);
		} else {
			const orderedMatch = rest.match(
				/^([ \t]*)(\d{1,9})([.)])[ \t]+/
			);
			if (orderedMatch && orderedMatch[0]) {
				prefix += orderedMatch[0];
				rest = rest.slice(orderedMatch[0].length);
			}
		}
	}
	const headingMatch = rest.match(/^(#{1,6})([ \t]+)(.*)$/);
	if (!headingMatch) {
		return {
			prefix,
			content: rest,
			level: 0,
			hasHeading: false,
		};
	}
	const level = headingMatch[1]?.length ?? 0;
	let content = headingMatch[3] ?? "";
	content = content.replace(/[ \t]+#+[ \t]*$/, "");
	return {
		prefix,
		content,
		level,
		hasHeading: level > 0,
	};
};

export const parseListLine = (lineText: string): ListLineInfo => {
	let prefix = "";
	let rest = lineText;
	const quoteMatch = rest.match(/^([ \t]{0,3}(?:> ?)+)(.*)$/);
	if (quoteMatch) {
		prefix = quoteMatch[1] ?? "";
		rest = quoteMatch[2] ?? "";
	}

	const taskMatch = rest.match(
		/^([ \t]*)([-+*])[ \t]+\[([ xX])\][ \t]+(.*)$/
	);
	if (taskMatch) {
		return {
			prefix,
			indent: taskMatch[1] ?? "",
			content: taskMatch[4] ?? "",
			kind: "task",
		};
	}

	const bulletMatch = rest.match(/^([ \t]*)([-+*])[ \t]+(.*)$/);
	if (bulletMatch) {
		return {
			prefix,
			indent: bulletMatch[1] ?? "",
			content: bulletMatch[3] ?? "",
			kind: "bullet",
		};
	}

	const orderedMatch = rest.match(/^([ \t]*)(\d{1,9})([.)])[ \t]+(.*)$/);
	if (orderedMatch) {
		return {
			prefix,
			indent: orderedMatch[1] ?? "",
			content: orderedMatch[4] ?? "",
			kind: "ordered",
		};
	}

	const indentMatch = rest.match(/^([ \t]*)(.*)$/);
	return {
		prefix,
		indent: indentMatch?.[1] ?? "",
		content: indentMatch?.[2] ?? "",
		kind: "none",
	};
};

export const isBlockquoteLine = (lineText: string): boolean => {
	return /^[ \t]{0,3}> ?/.test(lineText);
};
