import { action, DialDownEvent, DialRotateEvent, DialUpEvent, DidReceiveSettingsEvent, SingletonAction, TouchTapEvent, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import type { DialAction } from "@elgato/streamdeck";
import { deviceCache } from "../cache";
import { Device } from "../device";
import { getHSBColor, hsl2rgb, parseHSBResult, rgb2hex, sendBrightness, sendHue, sendSaturation, togglePower } from "../utils";

const LAYOUTS: [string, string][] = [
    ["layouts/rgb.json",        "imgs/actions/rgb"],
    ["layouts/saturation.json", "imgs/actions/saturation"],
    ["layouts/brightness.json", "imgs/actions/brightness"],
];

@action({ UUID: "de.itnox.streamdeck.tasmota.rgbdevice" })
export class HsbControl extends SingletonAction<EncoderSettings> {
    private readonly viewStates = new Map<string, number>();
    private refreshTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
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
        this.clearRefresh(ev.action.id);
        this.actionInstances.delete(ev.action.id);
        this.viewStates.delete(ev.action.id);
        const { settings } = ev.payload;
        if (settings.url) deviceCache.removeContext(ev.action.id, settings.url);
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
            ...buildFeedback(vs, device.HSBColor),
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

        switch (vs) {
            case 0:
                device.HSBColor[0] = (device.HSBColor[0] + ticks + 361) % 361;
                ev.action.setFeedback(buildFeedback(0, device.HSBColor));
                sendHue(device, device.HSBColor[0], (dev, success) => { if (!success) this.showAlertAll(dev); });
                break;
            case 1:
                device.HSBColor[1] = Math.max(0, Math.min(100, device.HSBColor[1] + ticks));
                ev.action.setFeedback(buildFeedback(1, device.HSBColor));
                sendSaturation(device, device.HSBColor[1], (dev, success) => { if (!success) this.showAlertAll(dev); });
                break;
            case 2:
                device.HSBColor[2] = Math.max(0, Math.min(100, device.HSBColor[2] + ticks));
                ev.action.setFeedback(buildFeedback(2, device.HSBColor));
                sendBrightness(device, device.HSBColor[2], (dev, success) => { if (!success) this.showAlertAll(dev); });
                break;
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

        const updateFeedback = () => {
            getHSBColor(device, (_dev, success, result) => {
                if (!success) { this.showAlertAll(_dev); return; }
                parseHSBResult(device, result);
                const vs = this.viewStates.get(act.id) ?? 0;
                act.setFeedback(buildFeedback(vs, device.HSBColor));
            });
        };

        updateFeedback();
        this.clearRefresh(act.id);

        const secs = Number(settings.autoRefresh);
        if (secs > 0) {
            this.refreshTimers.set(act.id, setInterval(updateFeedback, secs * 1000));
        }
    }

    private showAlertAll(dev: Device): void {
        for (const ctx of dev.contexts) {
            this.actionInstances.get(ctx)?.showAlert();
        }
    }

    private clearRefresh(contextId: string) {
        const t = this.refreshTimers.get(contextId);
        if (t !== undefined) { clearInterval(t); this.refreshTimers.delete(contextId); }
    }
}

function buildFeedback(vs: number, hsb: [number, number, number]) {
    if (vs === 1) {
        const color = rgb2hex(...hsl2rgb(hsb[0], 1, 0.5));
        return {
            value: String(hsb[1]),
            indicator: { bar_bg_c: `0:#ffffff,1:${color}`, value: hsb[1] }
        };
    }
    const val = hsb[vs];
    return { value: String(val), indicator: val };
}

type EncoderSettings = {
    url?: string;
    password?: string;
    autoRefresh?: number;
};
