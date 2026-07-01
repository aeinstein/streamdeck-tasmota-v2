import { Device, Callback } from "./device";

export function hsl2rgb(h: number, s: number, l: number): [number, number, number] {
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    };
    return [f(0), f(8), f(4)];
}

export function rgb2hex(r: number, g: number, b: number): string {
    return "#" + [r, g, b].map(x => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
}

export function parseHSBResult(device: Device, result: any) {
    if (result.POWER !== undefined) device.POWER = result.POWER === "ON" ? 1 : 0;
    if (result.CT !== undefined) device.CT = result.CT;
    if (result.White !== undefined) device.White = result.White;
    if (result.Dimmer !== undefined) device.Dimmer = result.Dimmer;
    if (result.HSBColor) {
        const parts = String(result.HSBColor).split(",");
        device.HSBColor[0] = Number(parts[0]);
        device.HSBColor[1] = Number(parts[1]);
        device.HSBColor[2] = Number(parts[2]);
    }
}

export function sendColor(device: Device, color: string, callback: Callback) {
    const hex = color.replace("#", "");
    device.send(`/cm?cmnd=Color%20${hex}`, callback, true);
}

export function sendHue(device: Device, hue: number, callback: Callback) {
    device.send(`/cm?cmnd=HSBColor1%20${hue}`, callback);
}

export function sendSaturation(device: Device, sat: number, callback: Callback) {
    device.send(`/cm?cmnd=HSBColor2%20${sat}`, callback);
}

export function sendBrightness(device: Device, bri: number, callback: Callback) {
    device.send(`/cm?cmnd=HSBColor3%20${bri}`, callback);
}

export function sendHSBColor(device: Device, callback: Callback) {
    const [h, s, b] = device.HSBColor;
    device.send(`/cm?cmnd=HSBColor%20${h},${s},${b}`, callback);
}

export function sendCT(device: Device, ct: number, callback: Callback) {
    device.send(`/cm?cmnd=CT%20${ct}`, callback, true);
}

export function sendWhite(device: Device, white: number, callback: Callback) {
    device.send(`/cm?cmnd=White%20${white}`, callback, true);
}

export function togglePower(device: Device, callback: Callback) {
    device.send("/cm?cmnd=Power%20TOGGLE", callback, true);
}

export function getHSBColor(device: Device, callback: Callback) {
    device.send("/cm?cmnd=HSBColor", callback);
}

export function sendCommand(device: Device, command: string, callback: Callback) {
    device.send(`/cm?cmnd=${command}`, callback, true);
}
