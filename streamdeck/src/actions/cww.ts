import { action, DialRotateEvent, DialUpEvent, SingletonAction, TouchTapEvent, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import type { FeedbackPayload } from "@elgato/streamdeck";
import { deviceCache } from "../cache";
import { getHSBColor, parseHSBResult, sendCT, sendWhite, togglePower } from "../utils";

const LAYOUTS: [string, string][] = [
    ["layouts/colortemp.json", "imgs/actions/cww"],
    ["layouts/brightness.json", "imgs/actions/brightness"],
];

@action({ UUID: "de.itnox.streamdeck.tasmota.wwdevice" })
export class CwwControl extends SingletonAction<EncoderSettings> {
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
            act.setFeedback(buildFeedback(vs, device));
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
            sendCT(device, device.CT, (_dev, success) => {
                if (success) ev.action.setFeedback(buildFeedback(0, device));
            });
        } else {
            device.White = Math.max(0, Math.min(100, device.White + ticks));
            sendWhite(device, device.White, (_dev, success) => {
                if (success) ev.action.setFeedback(buildFeedback(1, device));
            });
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
