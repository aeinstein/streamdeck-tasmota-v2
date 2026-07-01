import streamDeck from "@elgato/streamdeck";

const log = streamDeck.logger.createScope("Device");

export type Callback = (device: Device, success: boolean, result: any) => void;

interface QueueItem {
    querystring: string;
    callback: Callback;
}

export class Device {
    queue: QueueItem[] = [];
    TimerPid: ReturnType<typeof setTimeout> | null = null;
    RefreshPid: ReturnType<typeof setInterval> | null = null;
    url: string;
    password: string;
    contexts: string[] = [];
    settings: Record<string, any> = {};

    // Device state (kept in sync with Tasmota responses)
    POWER: number = 0;
    HSBColor: [number, number, number] = [0, 0, 0];
    CT: number = 0;
    White: number = 0;
    Dimmer: number = 0;

    constructor(contextId: string, url: string, settings: any) {
        this.url = url;
        this.password = settings?.password ?? "";
        this.contexts = [contextId];
        this.settings[contextId] = settings;
    }

    send(querystring: string, callback: Callback, noQueue = false) {
        if (noQueue) {
            this.doRequest({ querystring, callback });
            return;
        }

        const existing = this.queue.find(item => item.querystring === querystring);
        if (existing) {
            const prev = existing.callback;
            existing.callback = (dev, success, result) => { prev(dev, success, result); callback(dev, success, result); };
        } else {
            this.queue.push({ querystring, callback });
            this.tick();
        }
    }

    tick() {
        if (this.TimerPid !== null) clearTimeout(this.TimerPid);

        this.TimerPid = setTimeout(() => {
            this.TimerPid = null;
            const item = this.queue.pop();
            this.queue = [];
            if (item) this.doRequest(item);
        }, 200);
    }

    async doRequest(item: QueueItem): Promise<void> {
        const auth = this.password ? `&user=admin&password=${this.password}` : "";
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 2000);
            log.debug("fetch: " + this.url + item.querystring);

            const response = await fetch(this.url + item.querystring + auth, { signal: controller.signal });
            clearTimeout(timeout);

            if (!response.ok) {
                item.callback(this, false, "Could not connect to tasmota device.");
                return;
            }

            const result = await response.json();
            item.callback(this, true, result);
        } catch (err: any) {
            if (err?.name === "AbortError") {
                item.callback(this, false, "Connection to the bridge timed out.");
            } else {
                item.callback(this, false, "Unable to connect to the bridge.");
            }
        }
    }

    forEachContext(fnc: (contextId: string) => void) {
        for (const contextId of this.contexts) {
            fnc(contextId);
        }
    }

    setAutoRefresh(secs: number, callback: () => void) {
        if (this.RefreshPid !== null) {
            clearInterval(this.RefreshPid);
            this.RefreshPid = null;
        }

        if (secs > 0) {
            this.RefreshPid = setInterval(callback, secs * 1000);
        }
    }

    private hsbPollSubs = new Map<string, { minSecs: number; cb: (success: boolean, result: any) => void }>();
    private hsbPollTimer: ReturnType<typeof setInterval> | undefined;

    subscribeHSBPoll(key: string, minSecs: number, cb: (success: boolean, result: any) => void): void {
        this.hsbPollSubs.set(key, { minSecs, cb });
        this.restartHSBPollTimer();
    }

    unsubscribeHSBPoll(key: string): void {
        this.hsbPollSubs.delete(key);
        this.restartHSBPollTimer();
    }

    private restartHSBPollTimer(): void {
        if (this.hsbPollTimer !== undefined) { clearInterval(this.hsbPollTimer); this.hsbPollTimer = undefined; }
        let min = Infinity;
        for (const { minSecs } of this.hsbPollSubs.values()) min = Math.min(min, minSecs);
        if (!isFinite(min)) return;
        this.hsbPollTimer = setInterval(() => {
            this.doRequest({
                querystring: "/cm?cmnd=HSBColor",
                callback: (_dev, success, result) => {
                    for (const { cb } of this.hsbPollSubs.values()) cb(success, result);
                }
            });
        }, min * 1000);
    }
}
