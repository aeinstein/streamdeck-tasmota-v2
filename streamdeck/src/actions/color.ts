import { action, DialRotateEvent, DialUpEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { deviceCache } from "../cache";
import { getHSBColor, parseHSBResult, sendHue } from "../utils";

@action({ UUID: "de.itnox.streamdeck.tasmota.color" })
export class ColorControl extends SingletonAction<EncoderSettings> {
    override async onWillAppear(ev: WillAppearEvent<EncoderSettings>): Promise<void> {
        if (!ev.action.isDial()) return;
        const act = ev.action;
        const { settings } = ev.payload;
        if (!settings.url) return;

        const device = deviceCache.getOrAddDevice(act.id, settings.url, settings);
        if (!device) return;

        await act.setFeedbackLayout("layouts/rgb.json");

        getHSBColor(device, (_dev, success, result) => {
            if (!success) { act.showAlert(); return; }
            parseHSBResult(device, result);
            act.setFeedback({ value: String(device.HSBColor[0]), indicator: device.HSBColor[0] });
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

        device.HSBColor[0] = (device.HSBColor[0] + ev.payload.ticks + 361) % 361;

        sendHue(device, device.HSBColor[0], (_dev, success) => {
            if (success) {
                ev.action.setFeedback({ value: String(device.HSBColor[0]), indicator: device.HSBColor[0] });
            }
        });
    }

    override onDialUp(ev: DialUpEvent<EncoderSettings>): void {
        const { settings } = ev.payload;
        if (!settings.url) return;

        const device = deviceCache.getOrAddDevice(ev.action.id, settings.url, settings);
        if (!device) return;

        device.HSBColor[0] = device.HSBColor[0] > 0 ? 0 : 180;

        sendHue(device, device.HSBColor[0], (_dev, success) => {
            if (success) {
                ev.action.setFeedback({ value: String(device.HSBColor[0]), indicator: device.HSBColor[0] });
            }
        });
    }
}

type EncoderSettings = {
    url?: string;
    password?: string;
    autoRefresh?: number;
};
