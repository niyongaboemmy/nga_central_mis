import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCircuit, pinClashes, serializeCircuit, suggestParts, type Circuit } from "../parts";
import { runHeadless, Simulation } from "../sim";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const hex = (name: string) => readFileSync(join(FIX, `${name}.hex`), "utf8");
const circuit = (parts: Circuit["parts"]): Circuit => ({ version: 1, board: "uno", parts });
const kinds = (code: string) => suggestParts(code).map((p) => `${p.type}:${Object.entries(p.pins).map(([r, n]) => `${r}=${n}`).join(",")}${p.wiring ? `:${p.wiring}` : ""}`);

describe("suggestParts (what the sketch seems to use)", () => {
  it("LEDs from pinMode OUTPUT and analogWrite, by number or by name", () => {
    expect(kinds("const int ledPin = 9;\nvoid setup(){ pinMode(ledPin, OUTPUT); pinMode(13, OUTPUT); }\nvoid loop(){ analogWrite(10, 100); }")).toEqual(["led:pin=9", "led:pin=10"]);
  });
  it("buttons with their wiring, potentiometers from analogRead (A0 or 0)", () => {
    expect(kinds("#define BTN 2\nvoid setup(){ pinMode(BTN, INPUT_PULLUP); pinMode(4, INPUT); }\nvoid loop(){ analogRead(A1); analogRead(0); }")).toEqual([
      "button:pin=2:to-gnd",
      "button:pin=4:to-5v",
      "potentiometer:pin=15",
      "potentiometer:pin=14",
    ]);
  });
  it("buzzer from tone, servo from attach, LCDs (I²C and parallel), not their pins as LEDs", () => {
    const code =
      "#include <Servo.h>\n#include <LiquidCrystal.h>\nServo s; LiquidCrystal lcd(12, 11, 5, 4, 3, 2);\nvoid setup(){ s.attach(9); pinMode(8, OUTPUT); tone(8, 440); pinMode(12, OUTPUT); }\nvoid loop(){}";
    expect(kinds(code)).toEqual(["lcd:rs=12,en=11,d4=5,d5=4,d6=3,d7=2", "servo:pin=9", "buzzer:pin=8"]);
    expect(suggestParts("LiquidCrystal_I2C lcd(0x3F, 16, 2);")[0]).toMatchObject({ type: "lcd-i2c", address: 0x3f });
  });
  it("an RGB LED from three PWM pins named red/green/blue; comments ignored", () => {
    const code = "int redPin = 9; int greenPin = 10; int bluePin = 11;\n// pinMode(7, OUTPUT);\nvoid setup(){ pinMode(redPin, OUTPUT); pinMode(greenPin, OUTPUT); pinMode(bluePin, OUTPUT);}\nvoid loop(){ analogWrite(redPin, 255); }";
    expect(kinds(code)).toEqual(["rgb-led:r=9,g=10,b=11"]);
  });
});

describe("diagram.json", () => {
  it("round-trips, with pins as on the board", () => {
    const c = circuit([
      { id: "a", type: "led", color: "green", pins: { pin: 9 } },
      { id: "b", type: "potentiometer", pins: { pin: 14 } },
      { id: "c", type: "button", pins: { pin: 2 }, wiring: "to-gnd" },
      { id: "d", type: "lcd-i2c", pins: {}, address: 0x27 },
    ]);
    const text = serializeCircuit(c);
    expect(text).toContain('"pin": "A0"');
    expect(text).toContain('"address": "0x27"');
    expect(parseCircuit(text)).toEqual(c);
  });
  it("leaves out what it doesn't understand instead of failing", () => {
    expect(parseCircuit("{oops").parts).toEqual([]);
    expect(parseCircuit('{"parts":[{"type":"robot"},{"type":"led","pins":{"pin":"D99"}},{"type":"led","pins":{"pin":"D3"}}]}').parts).toMatchObject([{ type: "led", pins: { pin: 3 }, color: "red" }]);
  });
  it("points out a pin used twice (the I²C LCD takes A4/A5)", () => {
    const c = circuit([
      { id: "a", type: "led", pins: { pin: 9 } },
      { id: "b", type: "buzzer", pins: { pin: 9 } },
      { id: "c", type: "potentiometer", pins: { pin: 18 } },
      { id: "d", type: "lcd-i2c", pins: {} },
    ]);
    expect([...pinClashes(c).keys()].sort((a, b) => a - b)).toEqual([9, 18]);
  });
});

describe("Simulation with parts (real firmware)", () => {
  it("a button part drives the sketch, released and pressed (to GND)", () => {
    const sim = new Simulation(hex("button"), circuit([{ id: "btn", type: "button", pins: { pin: 2 }, wiring: "to-gnd" }, { id: "led", type: "led", pins: { pin: 8 } }]));
    sim.uno.runMs(30);
    sim.view();
    sim.uno.runMs(20);
    expect(sim.view().parts.led.brightness).toBe(0);
    sim.press("btn", true);
    sim.uno.runMs(20);
    sim.view();
    sim.uno.runMs(20);
    expect(sim.view().parts.led.brightness).toBe(1);
    sim.dispose();
  });
  it("PWM brightness, servo angle, buzzer pitch and the I²C LCD in the view", () => {
    const fade = new Simulation(hex("fade"), circuit([{ id: "l9", type: "led", pins: { pin: 9 } }]));
    fade.uno.runMs(20);
    fade.view();
    fade.uno.runMs(40);
    expect(fade.view().parts.l9.brightness).toBeCloseTo(0.25, 1);

    const servo = new Simulation(hex("servo"), circuit([{ id: "s", type: "servo", pins: { pin: 9 } }]));
    servo.uno.runMs(100);
    expect(servo.view().parts.s.angle).toBeCloseTo(45, -1);

    const tone = new Simulation(hex("tone"), circuit([{ id: "z", type: "buzzer", pins: { pin: 8 } }]));
    tone.uno.runMs(50);
    expect(tone.view().parts.z.frequency).toBeGreaterThan(435);

    const lcd = new Simulation(hex("lcd"), circuit([{ id: "d", type: "lcd-i2c", pins: {}, address: 0x27 }]));
    lcd.uno.runMs(1600);
    expect(lcd.lcdText("d")).toEqual(["Hello, NGA!", "Temp: 25C"]);
    expect(lcd.view().parts.d.lcd?.backlight).toBe(true);
  });
  it("a potentiometer part sets analogRead", () => {
    const sim = new Simulation(hex("analog"), circuit([{ id: "p", type: "potentiometer", pins: { pin: 14 } }]));
    let out = "";
    sim.uno.onSerial((t) => (out += t));
    sim.turn("p", 1023);
    sim.uno.runMs(60);
    expect(out.trim().split(/\r\n/).map(Number)).toContain(1023);
  });
});

describe("runHeadless (exercise checks)", () => {
  it("returns the Serial output of the first simulated seconds, with \\n line ends", async () => {
    const r = await runHeadless(hex("serial"), circuit([]), { ms: 250 });
    expect(r.serial).toBe("Hello, Arduino!\nn=0\nn=1\nn=2\n");
  });
  it("can send Serial input and stop once there is enough output", async () => {
    const r = await runHeadless(hex("echo"), circuit([]), { ms: 3000, input: "Jean\n", stopAfterChars: 40 });
    expect(r.serial).toBe("Type your name:\nHello, Jean!\n");
  });
});
