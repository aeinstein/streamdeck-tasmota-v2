import { action, DialDownEvent, DialRotateEvent, DialUpEvent, DidReceiveSettingsEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import type { DialAction } from "@elgato/streamdeck";
import { deviceCache } from "../cache";
import { getHSBColor, parseHSBResult, sendBrightness, togglePower } from "../utils";

@action({ UUID: "de.itnox.streamdeck.tasmota.brightness" })
export class BrightnessControl extends SingletonAction<EncoderSettings> {
    private refreshTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
    private pressStart: Map<string, number> = new Map();

    override async onWillAppear(ev: WillAppearEvent<EncoderSettings>): Promise<void> {
        if (!ev.action.isDial()) return;
        const act = ev.action;
        await act.setFeedbackLayout("layouts/brightness.json");

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
        this.clearRefresh(ev.action.id);
        const { settings } = ev.payload;
        if (settings.url) deviceCache.removeContext(ev.action.id, settings.url);
    }

    override onDialRotate(ev: DialRotateEvent<EncoderSettings>): void {
        const { settings } = ev.payload;
        if (!settings.url) return;

        const device = deviceCache.getOrAddDevice(ev.action.id, settings.url, settings);
        if (!device) return;

        device.HSBColor[2] = Math.max(0, Math.min(100, device.HSBColor[2] + ev.payload.ticks));
        ev.action.setFeedback({ value: String(device.HSBColor[2]), indicator: device.HSBColor[2] });
        sendBrightness(device, device.HSBColor[2], () => {});
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
            device.HSBColor[2] = device.HSBColor[2] > 0 ? 0 : 100;
            ev.action.setFeedback({ value: String(device.HSBColor[2]), indicator: device.HSBColor[2] });
            sendBrightness(device, device.HSBColor[2], () => {});
        }
    }

    private initAction(act: DialAction<EncoderSettings>, settings: EncoderSettings) {
        const device = deviceCache.getOrAddDevice(act.id, settings.url!, settings);
        if (!device) return;

        const updateFeedback = () => {
            getHSBColor(device, (_dev, success, result) => {
                if (!success) return;
                parseHSBResult(device, result);
                act.setFeedback({ value: String(device.HSBColor[2]), indicator: device.HSBColor[2] });
            });
        };

        updateFeedback();
        this.clearRefresh(act.id);

        const secs = Number(settings.autoRefresh);
        if (secs > 0) {
            this.refreshTimers.set(act.id, setInterval(updateFeedback, secs * 1000));
        }
    }

    private clearRefresh(contextId: string) {
        const t = this.refreshTimers.get(contextId);
        if (t !== undefined) { clearInterval(t); this.refreshTimers.delete(contextId); }
    }
}

type EncoderSettings = {
    url?: string;
    password?: string;
    autoRefresh?: number;
};
