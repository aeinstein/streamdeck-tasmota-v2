import streamDeck, { LogLevel } from "@elgato/streamdeck";

import { Toggle } from "./actions/power";
import { FixedRgb } from "./actions/fixed-rgb";
import { FixedCww } from "./actions/fixed-cww";
import { CustomCommand } from "./actions/custom";
import { ColorControl } from "./actions/color";
import { BrightnessControl } from "./actions/brightness";
import { SaturationControl } from "./actions/saturation";
import { HsbControl } from "./actions/hsb";
import { CwwControl } from "./actions/cww";

streamDeck.logger.setLevel(LogLevel.TRACE);

streamDeck.actions.registerAction(new Toggle());
streamDeck.actions.registerAction(new FixedRgb());
streamDeck.actions.registerAction(new FixedCww());
streamDeck.actions.registerAction(new CustomCommand());
streamDeck.actions.registerAction(new ColorControl());
streamDeck.actions.registerAction(new BrightnessControl());
streamDeck.actions.registerAction(new SaturationControl());
streamDeck.actions.registerAction(new HsbControl());
streamDeck.actions.registerAction(new CwwControl());

streamDeck.connect();
