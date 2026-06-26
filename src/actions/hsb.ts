import { action, DialRotateEvent, DialUpEvent, SingletonAction, TouchTapEvent, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { deviceCache } from "../cache";
import { getHSBColor, hsl2rgb, parseHSBResult, rgb2hex, sendBrightness, sendHue, sendSaturation, togglePower } from "../utils";

const LAYOUTS: [string, string][] = [
    ["layouts/rgb.json",        "imgs/actions/rgb"],
    ["layouts/saturation.json", "imgs/actions/saturation"],
    ["layouts/brightness.json", "imgs/actions/brightness"],
];

@action({ UUID: "de.itnox.streamdeck.tasmota.rgbdevice" })
export class HsbControl extends SingletonAction<EncoderSettings> {
    private readonly viewStates = new Map<string, number>();

    override async onWillAppear(ev: WillAppearEvent<EncoderSettings>): Promise<void> {
        if (!ev.action.isDial()) return;
        const act = ev.action;
        const { settings } = ev.payload;
        if (!settings.url) return;

        if (!this.viewStates.has(act.id)) this.viewStates.set(act.id, 0);
        const vs = this.viewStates.get(act.id)!;

        const device = deviceCache.getOrAddDevice(act.id, settings.url, settings);
        if (!device) return;

        await act.setFeedbackLayout(LAYOUTS[vs][0]);
        await act.setFeedback({ icon: LAYOUTS[vs][1] });

        getHSBColor(device, (_dev, success, result) => {
            if (!success) { act.showAlert(); return; }
            parseHSBResult(device, result);
            act.setFeedback(buildFeedback(vs, device.HSBColor));
        });
    }

    override onWillDisappear(ev: WillDisappearEvent<EncoderSettings>): void {
        const { settings } = ev.payload;
        if (!settings.url) return;
        this.viewStates.delete(ev.action.id);
        deviceCache.removeContext(ev.action.id, settings.url);
    }

    override async onDialUp(ev: DialUpEvent<EncoderSettings>): Promise<void> {
        const { settings } = ev.payload;
        if (!settings.url) return;

        const vs = ((this.viewStates.get(ev.action.id) ?? 0) + 1) % LAYOUTS.length;
        this.viewStates.set(ev.action.id, vs);

        const device = deviceCache.getOrAddDevice(ev.action.id, settings.url, settings);

        await ev.action.setFeedbackLayout(LAYOUTS[vs][0]);
        await ev.action.setFeedback({
            ...buildFeedback(vs, device?.HSBColor ?? [0, 0, 0]),
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
                sendHue(device, device.HSBColor[0], (_dev, success) => {
                    if (success) ev.action.setFeedback(buildFeedback(0, device.HSBColor));
                });
                break;
            case 1:
                device.HSBColor[1] = Math.max(0, Math.min(100, device.HSBColor[1] + ticks));
                sendSaturation(device, device.HSBColor[1], (_dev, success) => {
                    if (success) ev.action.setFeedback(buildFeedback(1, device.HSBColor));
                });
                break;
            case 2:
                device.HSBColor[2] = Math.max(0, Math.min(100, device.HSBColor[2] + ticks));
                sendBrightness(device, device.HSBColor[2], (_dev, success) => {
                    if (success) ev.action.setFeedback(buildFeedback(2, device.HSBColor));
                });
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
