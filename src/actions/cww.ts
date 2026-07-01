import { action, DialDownEvent, DialRotateEvent, DialUpEvent, DidReceiveSettingsEvent, SingletonAction, TouchTapEvent, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import type { DialAction, FeedbackPayload } from "@elgato/streamdeck";
import { deviceCache } from "../cache";
import { Device } from "../device";
import { getHSBColor, parseHSBResult, sendCT, sendWhite, togglePower } from "../utils";

const LAYOUTS: [string, string][] = [
    ["layouts/colortemp.json", "imgs/actions/cww"],
    ["layouts/brightness.json", "imgs/actions/brightness"],
];

@action({ UUID: "de.itnox.streamdeck.tasmota.wwdevice" })
export class CwwControl extends SingletonAction<EncoderSettings> {
    private readonly viewStates = new Map<string, number>();
    private contextSettings: Map<string, EncoderSettings> = new Map();
    private pressStart: Map<string, number> = new Map();
    private actionInstances: Map<string, DialAction<EncoderSettings>> = new Map();

    override async onWillAppear(ev: WillAppearEvent<EncoderSettings>): Promise<void> {
        if (!ev.action.isDial()) return;
        const act = ev.action;

        if (!this.viewStates.has(act.id)) this.viewStates.set(act.id, 0);
        const vs = this.viewStates.get(act.id)!;
        await act.setFeedbackLayout(LAYOUTS[vs][0]);
        await act.setFeedback({ icon: LAYOUTS[vs][1] });

        const { settings } = ev.payload;
        if (!settings.url) { act.getSettings(); return; }

        this.initAction(act, settings);
    }

    override onDidReceiveSettings(ev: DidReceiveSettingsEvent<EncoderSettings>): void {
        const { settings } = ev.payload;
        if (!settings.url || !ev.action.isDial()) return;
        this.initAction(ev.action, settings);
    }

    override onWillDisappear(ev: WillDisappearEvent<EncoderSettings>): void {
        const ctxId = ev.action.id;
        const { settings } = ev.payload;
        this.actionInstances.delete(ctxId);
        this.contextSettings.delete(ctxId);
        this.viewStates.delete(ctxId);
        if (settings.url) {
            const device = deviceCache.getOrAddDevice(ctxId, settings.url, settings);
            if (device) this.resubscribe(settings.url, device);
            deviceCache.removeContext(ctxId, settings.url);
        }
    }

    override onDialDown(ev: DialDownEvent<EncoderSettings>): void {
        this.pressStart.set(ev.action.id, Date.now());
    }

    override async onDialUp(ev: DialUpEvent<EncoderSettings>): Promise<void> {
        const elapsed = Date.now() - (this.pressStart.get(ev.action.id) ?? Date.now());
        this.pressStart.delete(ev.action.id);
        const { settings } = ev.payload;
        if (!settings.url) return;

        const device = deviceCache.getOrAddDevice(ev.action.id, settings.url, settings);
        if (!device) return;

        if (elapsed >= 500) {
            togglePower(device, (_dev, success) => { if (!success) ev.action.showAlert(); });
            return;
        }

        const vs = ((this.viewStates.get(ev.action.id) ?? 0) + 1) % LAYOUTS.length;
        this.viewStates.set(ev.action.id, vs);

        await ev.action.setFeedbackLayout(LAYOUTS[vs][0]);
        await ev.action.setFeedback({
            ...buildFeedback(vs, device),
            icon: LAYOUTS[vs][1]
        });
    }

    override onDialRotate(ev: DialRotateEvent<EncoderSettings>): void {
        const { settings } = ev.payload;
        if (!settings.url) return;

        const device = deviceCache.getOrAddDevice(ev.action.id, settings.url, settings);
        if (!device) return;

        const vs = this.viewStates.get(ev.action.id) ?? 0;
        const ticks = ev.payload.ticks;

        if (vs === 0) {
            device.CT = Math.max(153, Math.min(500, device.CT + ticks));
            ev.action.setFeedback(buildFeedback(0, device));
            sendCT(device, device.CT, (dev, success) => { if (!success) this.showAlertAll(dev); });
        } else {
            device.White = Math.max(0, Math.min(100, device.White + ticks));
            ev.action.setFeedback(buildFeedback(1, device));
            sendWhite(device, device.White, (dev, success) => { if (!success) this.showAlertAll(dev); });
        }
    }

    override onTouchTap(ev: TouchTapEvent<EncoderSettings>): void {
        if (!ev.payload.hold) return;
        const { settings } = ev.payload;
        if (!settings.url) return;

        const device = deviceCache.getOrAddDevice(ev.action.id, settings.url, settings);
        if (!device) return;

        togglePower(device, (_dev, success) => {
            if (!success) ev.action.showAlert();
        });
    }

    private initAction(act: DialAction<EncoderSettings>, settings: EncoderSettings) {
        const device = deviceCache.getOrAddDevice(act.id, settings.url!, settings);
        if (!device) return;
        this.actionInstances.set(act.id, act);
        this.contextSettings.set(act.id, settings);

        getHSBColor(device, (_dev, success, result) => {
            if (!success) { this.showAlertAll(_dev); return; }
            parseHSBResult(device, result);
            const vs = this.viewStates.get(act.id) ?? 0;
            act.setFeedback(buildFeedback(vs, device));
        });

        this.resubscribe(settings.url!, device);
    }

    private resubscribe(url: string, device: Device): void {
        let minSecs = Infinity;
        for (const s of this.contextSettings.values()) {
            if (s.url === url && s.autoRefresh && Number(s.autoRefresh) > 0)
                minSecs = Math.min(minSecs, Number(s.autoRefresh));
        }
        if (!isFinite(minSecs)) {
            device.unsubscribeHSBPoll("cww");
            return;
        }
        device.subscribeHSBPoll("cww", minSecs, (success, result) => {
            if (!success) { this.showAlertAll(device); return; }
            parseHSBResult(device, result);
            for (const ctx of device.contexts) {
                const a = this.actionInstances.get(ctx);
                if (a) {
                    const vs = this.viewStates.get(ctx) ?? 0;
                    a.setFeedback(buildFeedback(vs, device));
                }
            }
        });
    }

    private showAlertAll(dev: Device): void {
        for (const ctx of dev.contexts) {
            this.actionInstances.get(ctx)?.showAlert();
        }
    }
}

function buildFeedback(vs: number, device: { CT: number; White: number } | undefined): FeedbackPayload {
    if (!device) return {};
    const val = vs === 0 ? device.CT : device.White;
    return { value: String(val), indicator: val };
}

type EncoderSettings = {
    url?: string;
    password?: string;
    autoRefresh?: number;
};
