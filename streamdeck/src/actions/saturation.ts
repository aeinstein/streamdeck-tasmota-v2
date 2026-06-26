import { action, DialRotateEvent, DialUpEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { deviceCache } from "../cache";
import { getHSBColor, hsl2rgb, parseHSBResult, rgb2hex, sendSaturation } from "../utils";

@action({ UUID: "de.itnox.streamdeck.tasmota.saturation" })
export class SaturationControl extends SingletonAction<EncoderSettings> {
    override async onWillAppear(ev: WillAppearEvent<EncoderSettings>): Promise<void> {
        if (!ev.action.isDial()) return;
        const act = ev.action;
        const { settings } = ev.payload;
        if (!settings.url) return;

        const device = deviceCache.getOrAddDevice(act.id, settings.url, settings);
        if (!device) return;

        await act.setFeedbackLayout("layouts/saturation.json");

        getHSBColor(device, (_dev, success, result) => {
            if (!success) { act.showAlert(); return; }
            parseHSBResult(device, result);
            act.setFeedback(buildSatFeedback(device.HSBColor[0], device.HSBColor[1]));
        });
    }

    override onWillDisappear(ev: WillDisappearEvent<EncoderSettings>): void {
        const { settings } = ev.payload;
        if (!settings.url) return;
        deviceCache.removeContext(ev.action.id, settings.url);
    }

    override onDialRotate(ev: DialRotateEvent<EncoderSettings>): void {
        const { settings } = ev.payload;
        if (!settings.url) return;

        const device = deviceCache.getOrAddDevice(ev.action.id, settings.url, settings);
        if (!device) return;

        device.HSBColor[1] = Math.max(0, Math.min(100, device.HSBColor[1] + ev.payload.ticks));

        sendSaturation(device, device.HSBColor[1], (_dev, success) => {
            if (success) {
                ev.action.setFeedback(buildSatFeedback(device.HSBColor[0], device.HSBColor[1]));
            }
        });
    }

    override onDialUp(ev: DialUpEvent<EncoderSettings>): void {
        const { settings } = ev.payload;
        if (!settings.url) return;

        const device = deviceCache.getOrAddDevice(ev.action.id, settings.url, settings);
        if (!device) return;

        device.HSBColor[1] = device.HSBColor[1] > 0 ? 0 : 100;

        sendSaturation(device, device.HSBColor[1], (_dev, success) => {
            if (success) {
                ev.action.setFeedback(buildSatFeedback(device.HSBColor[0], device.HSBColor[1]));
            }
        });
    }
}

function buildSatFeedback(hue: number, sat: number) {
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
