export {};

declare global {
	interface IdleDeadline {
		didTimeout: boolean;
		timeRemaining(): DOMHighResTimeStamp;
	}

	interface IdleRequestOptions {
		timeout?: number;
	}

	interface Window {
		requestIdleCallback?(
			callback: (deadline: IdleDeadline) => void,
			options?: IdleRequestOptions
		): number;
		cancelIdleCallback?(handle: number): void;
	}
}
