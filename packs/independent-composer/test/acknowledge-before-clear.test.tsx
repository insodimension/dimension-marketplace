/** WHAT BREAKS IN THE PRODUCT IF THIS GOES RED: you type a message on your
 *  phone, press send, and the words vanish — not into the transcript, not back
 *  into the field, nowhere. Measured on a real device 2026-09-07 (Android
 *  emulator, System WebView 113, 412x915): with the wire down the text was gone
 *  in under a second. The `phone` space requires THIS composer, not
 *  composer-classic, and this pack had never been migrated to the delivery
 *  verdict `actions.sendMessage` hands back.
 *
 *  The fix is an ORDER, not a restore: the draft is cleared only AFTER the host
 *  acknowledges delivery. Clear-then-restore cannot work, because with the wire
 *  down `sendMessage` never resolves at all — there is no verdict to restore on.
 *  That is why the never-settling promise below is a first-class case and not a
 *  curiosity: it is the exact device defect.
 *
 *  Leaving the text is visually free — `Composer.submitValue` clears its own
 *  attachment pills but deliberately leaves the TEXT to the controlled `value`
 *  (fraym/packages/ui/src/features/composer/composer-core.tsx) — so the only
 *  thing standing between a user and lost words is the order in `onSubmit`.
 *
 *  HARNESS NOTE: `@fraym/ui` is a HOST-RESOLVED external, never a pack
 *  dependency (see vite.config.ts `rollupOptions.external`), so it is replaced
 *  here by the smallest honest stand-ins: a `Composer` that records the props it
 *  is handed, and a `useObservable` that is the real `useSyncExternalStore`.
 *  What is under test is this pack's OWN section wiring — the send mapping, the
 *  draft persistence, and the acknowledgement. `react`, `react-dom` and
 *  `linkedom` come from the Dimension monorepo this repo is mounted into, which
 *  is where pack tests run (marketplace CI validates only what is standalone).
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { parseHTML } from "linkedom";
import { act, createElement, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";

// ── The published parts, replaced by stand-ins ───────────────────────────────

interface ComposerCapture {
	readonly value: string;
	readonly onChange: (text: string) => void;
	readonly onSubmit: (text: string, attachments?: readonly unknown[]) => void;
	readonly disabled: boolean;
}

let composer: ComposerCapture | null = null;

mock.module("@fraym/ui", () => ({
	Composer: (props: ComposerCapture) => {
		composer = props;
		return null;
	},
	GoalComposerSurface: () => null,
	UsageLimitComposerSurface: () => null,
	// The real one is a useSyncExternalStore wrapper; use the real hook so the
	// component's NO_SESSION stability contract is exercised, not faked.
	useObservable: (source: { subscribe: (fn: () => void) => () => void; getSnapshot: () => unknown }) =>
		useSyncExternalStore(source.subscribe, source.getSnapshot),
	useSlashCommands: () => undefined,
	useFileCompletions: () => undefined,
	useArgumentCompletions: () => undefined,
}));

// Static imports are hoisted above `mock.module`, so the module under test must
// be pulled in after the stand-ins are registered.
const IndependentComposer = (await import("../src/index")).default;

// ── DOM harness ──────────────────────────────────────────────────────────────

const globalNames = ["window", "document", "navigator", "HTMLElement", "Element", "Event", "IS_REACT_ACT_ENVIRONMENT"] as const;
type DomGlobal = (typeof globalNames)[number];

let originalGlobals: Record<DomGlobal, PropertyDescriptor | undefined> | undefined;
let container: HTMLElement;
const roots: Root[] = [];

beforeEach(() => {
	const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
	originalGlobals ??= Object.fromEntries(
		globalNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
	) as Record<DomGlobal, PropertyDescriptor | undefined>;
	Object.assign(globalThis, {
		window,
		document: window.document,
		navigator: window.navigator,
		HTMLElement: window.HTMLElement,
		Element: window.Element,
		Event: window.Event,
		IS_REACT_ACT_ENVIRONMENT: true,
	});
	container = window.document.getElementById("root") as unknown as HTMLElement;
	composer = null;
});

afterEach(async () => {
	for (const root of roots.splice(0)) await act(async () => root.unmount());
	for (const name of globalNames) {
		const descriptor = originalGlobals?.[name];
		if (descriptor) Object.defineProperty(globalThis, name, descriptor);
		else Reflect.deleteProperty(globalThis, name);
	}
	originalGlobals = undefined;
	composer = null;
});

// ── Fixtures ─────────────────────────────────────────────────────────────────

const SENT = "roll the deploy back, the p99 just tripled";
const NEWER = "actually hold on, page the on-call first";

/** A stable snapshot source: `useObservable` is useSyncExternalStore, so an
 *  unstable getSnapshot would loop rather than fail. */
const SESSION = { subscribe: () => () => {}, getSnapshot: () => null };

function deferred<T>() {
	let settle!: (value: T) => void;
	const promise = new Promise<T>(resolve => {
		settle = resolve;
	});
	return { promise, settle };
}

interface Mounted {
	readonly sent: unknown[];
	/** Re-render the SAME instance against a different session. */
	rerender(sessionId: string): Promise<void>;
	unmount(): Promise<void>;
}

function propsFor(sessionId: string, sendMessage: (input: unknown) => Promise<boolean | void>) {
	return {
		sessionRef: { workspaceId: "ws1", sessionId },
		placeholder: "Ask anything",
		actions: { sendMessage, interruptRunForQueuedMessage: async () => {} },
		session: SESSION,
		disabled: false,
		opening: false,
		continuation: { continued: false },
	} as const;
}

async function mount(sessionId: string, reply: (input: unknown) => Promise<boolean | void>): Promise<Mounted> {
	const sent: unknown[] = [];
	const sendMessage = (input: unknown) => {
		sent.push(input);
		return reply(input);
	};
	const root = createRoot(container);
	roots.push(root);
	await act(async () => root.render(createElement(IndependentComposer, propsFor(sessionId, sendMessage))));
	return {
		sent,
		rerender: async (nextId: string) => {
			await act(async () => root.render(createElement(IndependentComposer, propsFor(nextId, sendMessage))));
		},
		unmount: async () => {
			await act(async () => root.unmount());
		},
	};
}

/** What a fresh mount of the same session shows — i.e. what survived in the
 *  module-level per-session `drafts` map after the component went away. This is
 *  the product behaviour that map exists for: switch away mid-sentence, come
 *  back, the words are still there. */
async function reopen(sessionId: string): Promise<string> {
	const again = await mount(sessionId, async () => true);
	const value = value_();
	await again.unmount();
	return value;
}

function value_(): string {
	if (!composer) throw new Error("Composer was never rendered");
	return composer.value;
}

async function type(text: string): Promise<void> {
	const onChange = composer?.onChange;
	if (!onChange) throw new Error("Composer was never rendered");
	await act(async () => onChange(text));
}

async function submit(text: string): Promise<void> {
	const onSubmit = composer?.onSubmit;
	if (!onSubmit) throw new Error("Composer was never rendered");
	await act(async () => onSubmit(text, []));
}

/** Let every already-queued microtask in the submit chain run. Nothing here
 *  waits on the clock — an unsettled send stays unsettled forever, which is
 *  precisely the device condition. */
async function flush(): Promise<void> {
	await act(async () => {
		for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
	});
}

// ── Contracts ────────────────────────────────────────────────────────────────

describe("an unacknowledged send keeps the words", () => {
	test("a send that NEVER settles leaves the text on screen and in the draft map (the device defect)", async () => {
		// The wire is down: `sendMessage` returns a promise that never resolves,
		// so there is no verdict at all — not false, not an error, nothing.
		const view = await mount("never-settles", () => new Promise<boolean>(() => {}));
		await type(SENT);
		await submit(SENT);
		await flush();

		expect(view.sent).toEqual([SENT]);
		expect(value_()).toBe(SENT);

		await view.unmount();
		expect(await reopen("never-settles")).toBe(SENT);
	});

	test("a send the host REFUSES (false) leaves the text on screen and in the draft map", async () => {
		const view = await mount("refused", async () => false);
		await type(SENT);
		await submit(SENT);
		await flush();

		expect(view.sent).toEqual([SENT]);
		expect(value_()).toBe(SENT);

		await view.unmount();
		expect(await reopen("refused")).toBe(SENT);
	});

	test("a host older than the verdict contract (undefined) counts as UNDELIVERED, never a silent success", async () => {
		const view = await mount("legacy-host", async () => undefined);
		await type(SENT);
		await submit(SENT);
		await flush();

		expect(view.sent).toEqual([SENT]);
		expect(value_()).toBe(SENT);

		await view.unmount();
		expect(await reopen("legacy-host")).toBe(SENT);
	});
});

describe("an acknowledged send drops the copy", () => {
	test("a delivered send (true) empties the field and removes the session's draft-map entry", async () => {
		const view = await mount("delivered", async () => true);
		await type(SENT);
		await submit(SENT);
		await flush();

		expect(view.sent).toEqual([SENT]);
		expect(value_()).toBe("");

		await view.unmount();
		expect(await reopen("delivered")).toBe("");
	});

	test("attachments travel with the text, and delivery still clears", async () => {
		// The wire shape the reference's sendComposed produces; a delivered send
		// must clear regardless of which shape went out.
		const view = await mount("delivered-with-image", async () => true);
		await type(SENT);
		const onSubmit = composer?.onSubmit;
		if (!onSubmit) throw new Error("Composer was never rendered");
		await act(async () => onSubmit(SENT, [{ data: "AAAA", mimeType: "image/png", name: "shot.png" }]));
		await flush();

		expect(view.sent).toEqual([
			{ text: SENT, attachments: [{ kind: "image", mimeType: "image/png", data: "AAAA", name: "shot.png" }] },
		]);
		expect(value_()).toBe("");
	});
});

describe("a late acknowledgement cannot overwrite what came after it", () => {
	test("words typed while the send is in flight survive a delivered acknowledgement", async () => {
		const answer = deferred<boolean>();
		const view = await mount("typed-newer", () => answer.promise);
		await type(SENT);
		await submit(SENT);
		await type(NEWER);

		await act(async () => answer.settle(true));
		await flush();

		expect(value_()).toBe(NEWER);
		await view.unmount();
		expect(await reopen("typed-newer")).toBe(NEWER);
	});

	test("an acknowledgement for a session the user has LEFT does not empty the field in front of them", async () => {
		// Submit under session A, then the host re-renders this instance against
		// session B while the answer is still in flight. `sentKey` was bound
		// before the await, so the answer belongs to A: A's map entry is dropped,
		// but the local field — which is what the reader is looking at now — must
		// not be touched by a session they are no longer in.
		const answer = deferred<boolean>();
		const view = await mount("left-session-a", () => answer.promise);
		await type(SENT);
		await submit(SENT);
		await view.rerender("left-session-b");

		await act(async () => answer.settle(true));
		await flush();

		// TWO FACTS ARE GLUED TOGETHER ON THIS LINE, AND THE SECOND IS A DEFECT.
		// (1) The contract this test defends: A's late acknowledgement did not
		//     empty the field in front of a reader who has already moved on.
		// (2) NOT a contract — CROSS-SESSION DRAFT BLEED, recorded here as
		//     CURRENT behaviour, not as desired behaviour: the field the reader
		//     sees under session B still holds session A's words. `draft` is
		//     `useState(() => drafts.get(draftKey) ?? "")` (src/index.tsx:67),
		//     initialised ONCE, and the host mounts this section with no `key` —
		//     the session arrives as a prop
		//     (fraym/packages/ui/src/shell/workspace-session-pane-core.tsx:217) —
		//     so a session switch REUSES this instance and the old text stays on
		//     screen. The next keystroke then persists A's words under B's key.
		//     The classic composer is immune because it derives the draft FROM
		//     the key: `useSessionComposerDraft(draftKey)`
		//     (fraym/packages/ui/src/shell/space/impls/composer-classic.tsx:58-59),
		//     which re-reads whenever the key changes.
		//     When that fix lands here this line becomes `.toBe("")`, and fact
		//     (1) loses its on-screen surface — assert it through A's map entry
		//     (the `reopen` below) at that point, not through the visible value.
		expect(value_()).toBe(SENT);
		await view.unmount();
		// A's delivered copy is gone — the map is keyed, so the right session's
		// copy was the one dropped.
		expect(await reopen("left-session-a")).toBe("");
	});
});

describe("a stray second Enter cannot post the message twice", () => {
	test("resubmitting the SAME text while the first send is unresolved does not send twice", async () => {
		// The device condition from the first contract in this file: the wire is
		// down, so `sendMessage` never resolves — and because the words
		// deliberately stay on screen, the reader believes the send failed and
		// presses Enter again.
		const view = await mount("double-enter", () => new Promise<boolean>(() => {}));
		await type(SENT);
		await submit(SENT);
		await flush();
		await submit(SENT);
		await flush();

		expect(view.sent).toEqual([SENT]);
		// Still unacknowledged, so this remains the only copy of the words.
		expect(value_()).toBe(SENT);
	});

	test("editing the text and resubmitting while the first send is unresolved DOES send", async () => {
		// The guard is keyed `(draftKey, text)`. Keyed on the session alone it
		// would swallow the correction the reader typed BECAUSE the first send
		// looked like it failed — a worse bug than the duplicate it prevents.
		const view = await mount("edit-and-resend", () => new Promise<boolean>(() => {}));
		await type(SENT);
		await submit(SENT);
		await flush();
		await type(NEWER);
		await submit(NEWER);
		await flush();

		expect(view.sent).toEqual([SENT, NEWER]);
	});
});
