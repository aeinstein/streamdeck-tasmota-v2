import { action, DialRotateEvent, DialUpEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { deviceCache } from "../cache";
import { getHSBColor, parseHSBResult, sendBrightness } from "../utils";

@action({ UUID: "de.itnox.streamdeck.tasmota.brightness" })
export class BrightnessControl extends SingletonAction<EncoderSettings> {
    override async onWillAppear(ev: WillAppearEvent<EncoderSettings>): Promise<void> {
        if (!ev.action.isDial()) return;
        const act = ev.action;
        const { settings } = ev.payload;
        if (!settings.url) return;

        const device = deviceCache.getOrAddDevice(act.id, settings.url, settings);
        if (!device) return;

        await act.setFeedbackLayout("layouts/brightness.json");

        getHSBColor(device, (_dev, success, result) => {
            if (!success) { act.showAlert(); return; }
            parseHSBResult(device, result);
            act.setFeedback({ value: String(device.HSBColor[2]), indicator: device.HSBColor[2] });
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

        device.HSBColor[2] = Math.max(0, Math.min(100, device.HSBColor[2] + ev.payload.ticks));

        sendBrightness(device, device.HSBColor[2], (_dev, success) => {
            if (success) {
                ev.action.setFeedback({ value: String(device.HSBColor[2]), indicator: device.HSBColor[2] });
            }
        });
    }

    override onDialUp(ev: DialUpEvent<EncoderSettings>): void {
        const { settings } = ev.payload;
        if (!settings.url) return;

        const device = deviceCache.getOrAddDevice(ev.action.id, settings.url, settings);
        if (!device) return;

        device.HSBColor[2] = device.HSBColor[2] > 0 ? 0 : 100;

        sendBrightness(device, device.HSBColor[2], (_dev, success) => {
            if (success) {
                ev.action.setFeedback({ value: String(device.HSBColor[2]), indicator: device.HSBColor[2] });
            }
        });
    }
}

type EncoderSettings = {
    url?: string;
    password?: string;
    autoRefresh?: number;
};
