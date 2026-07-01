import { action, DialDownEvent, DialRotateEvent, DialUpEvent, DidReceiveSettingsEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import type { DialAction } from "@elgato/streamdeck";
import { deviceCache } from "../cache";
import { Device } from "../device";
import { getHSBColor, hsl2rgb, parseHSBResult, rgb2hex, sendSaturation, togglePower } from "../utils";

@action({ UUID: "de.itnox.streamdeck.tasmota.saturation" })
export class SaturationControl extends SingletonAction<EncoderSettings> {
    private contextSettings: Map<string, EncoderSettings> = new Map();
    private pressStart: Map<string, number> = new Map();
    private actionInstances: Map<string, DialAction<EncoderSettings>> = new Map();

    override async onWillAppear(ev: WillAppearEvent<EncoderSettings>): Promise<void> {
        if (!ev.action.isDial()) return;
        const act = ev.action;
        await act.setFeedbackLayout("layouts/saturation.json");

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
        if (settings.url) {
            const device = deviceCache.getOrAddDevice(ctxId, settings.url, settings);
            if (device) this.resubscribe(settings.url, device);
            deviceCache.removeContext(ctxId, settings.url);
        }
    }

    override onDialRotate(ev: DialRotateEvent<EncoderSettings>): void {
        const { settings } = ev.payload;
        if (!settings.url) return;

        const device = deviceCache.getOrAddDevice(ev.action.id, settings.url, settings);
        if (!device) return;

        device.HSBColor[1] = Math.max(0, Math.min(100, device.HSBColor[1] + ev.payload.ticks));
        ev.action.setFeedback(buildFeedback(device.HSBColor[0], device.HSBColor[1]));
        sendSaturation(device, device.HSBColor[1], (dev, success) => { if (!success) this.showAlertAll(dev); });
    }

    override onDialDown(ev: DialDownEvent<EncoderSettings>): void {
        this.pressStart.set(ev.action.id, Date.now());
    }

    override onDialUp(ev: DialUpEvent<EncoderSettings>): void {
        const elapsed = Date.now() - (this.pressStart.get(ev.action.id) ?? Date.now());
        this.pressStart.delete(ev.action.id);
        const { settings } = ev.payload;
        if (!settings.url) return;

        const device = deviceCache.getOrAddDevice(ev.action.id, settings.url, settings);
        if (!device) return;

        if (elapsed >= 500) {
            togglePower(device, (_dev, success) => { if (!success) ev.action.showAlert(); });
        } else {
            device.HSBColor[1] = device.HSBColor[1] > 0 ? 0 : 100;
            ev.action.setFeedback(buildFeedback(device.HSBColor[0], device.HSBColor[1]));
            sendSaturation(device, device.HSBColor[1], (dev, success) => { if (!success) this.showAlertAll(dev); });
        }
    }

    private initAction(act: DialAction<EncoderSettings>, settings: EncoderSettings) {
        const device = deviceCache.getOrAddDevice(act.id, settings.url!, settings);
        if (!device) return;
        this.actionInstances.set(act.id, act);
        this.contextSettings.set(act.id, settings);

        getHSBColor(device, (_dev, success, result) => {
            if (!success) { this.showAlertAll(_dev); return; }
            parseHSBResult(device, result);
            act.setFeedback(buildFeedback(device.HSBColor[0], device.HSBColor[1]));
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
            device.unsubscribeHSBPoll("saturation");
            return;
        }
        device.subscribeHSBPoll("saturation", minSecs, (success, result) => {
            if (!success) { this.showAlertAll(device); return; }
            parseHSBResult(device, result);
            for (const ctx of device.contexts) {
                const a = this.actionInstances.get(ctx);
                if (a) a.setFeedback(buildFeedback(device.HSBColor[0], device.HSBColor[1]));
            }
        });
    }

    private showAlertAll(dev: Device): void {
        for (const ctx of dev.contexts) {
            this.actionInstances.get(ctx)?.showAlert();
        }
    }
}

function buildFeedback(hue: number, sat: number) {
    const color = rgb2hex(...hsl2rgb(hue, 1, 0.5));
    return {
        value: String(sat),
        indicator: { bar_bg_c: `0:#ffffff,1:${color}`, value: sat }
    };
}

type EncoderSettings = {
    url?: string;
    password?: string;
    autoRefresh?: number;
};
