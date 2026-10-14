import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PinState } from "avr8js";
import { HexError, parseIntelHex } from "../intelHex";
import { ArduinoUno, parsePin, pinName, pinPort } from "../uno";
import { HD44780, lcdI2C, lcdParallel } from "../lcd";

// Real firmware: each fixture was compiled from the sketch quoted in its test with arduino-cli
// 1.5.1 + arduino:avr 1.8.8 (the code runner's arduino/uno kind), so these run what students get.
const FIX = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const firmware = (name: string) => parseIntelHex(readFileSync(join(FIX, `${name}.hex`), "utf8")).bytes;
const boot = (name: string) => new ArduinoUno(firmware(name));
const serialOf = (uno: ArduinoUno) => {
  let out = "";
  uno.onSerial((t) => (out += t));
  return () => out;
};

describe("parseIntelHex", () => {
  it("reads arduino-cli's firmware and how much flash it uses", () => {
    const { bytes, used } = parseIntelHex(readFileSync(join(FIX, "blink.hex"), "utf8"));
    expect(bytes.length).toBe(32768);
    expect(used).toBeGreaterThan(500);
    expect(used).toBeLessThan(2000);
    expect(bytes[0]).toBe(0x0c); // jmp: the reset vector
    expect(bytes[used + 10]).toBe(0xff); // erased flash after it
  });
  it("refuses bad checksums, garbage and a cut-off file", () => {
    expect(() => parseIntelHex(":0300300002337A1F\n:00000001FF")).toThrow(HexError);
    expect(() => parseIntelHex("hello")).toThrow(/isn't Intel HEX/);
    expect(() => parseIntelHex(":0300300002337A1E\n")).toThrow(/incomplete/);
  });
});

describe("pins", () => {
  it("numbers pins like the board", () => {
    expect(pinPort(13)).toEqual({ port: "B", bit: 5 });
    expect(pinPort(2)).toEqual({ port: "D", bit: 2 });
    expect(pinPort(14)).toEqual({ port: "C", bit: 0 });
    expect(pinPort(20)).toBeNull();
    expect(parsePin("A0")).toBe(14);
    expect(parsePin("D9")).toBe(9);
    expect(parsePin("13")).toBe(13);
    expect(parsePin("A9")).toBeNull();
    expect(pinName(15)).toBe("A1");
  });
});

describe("ArduinoUno running real sketches", () => {
  it("Serial: println at 9600 baud, line after line, in simulated time", () => {
    // void setup(){Serial.begin(9600);Serial.println("Hello, Arduino!");}
    // void loop(){static int n=0; Serial.print("n=");Serial.println(n++);delay(100);}
    const uno = boot("serial");
    const out = serialOf(uno);
    uno.runMs(350);
    expect(out()).toBe("Hello, Arduino!\r\nn=0\r\nn=1\r\nn=2\r\nn=3\r\n");
    expect(uno.baud).toBe(9600);
    expect(uno.timeMs).toBeCloseTo(350, 0);
  });

  it("blink: pin 13 toggles every 250 ms", () => {
    // pinMode(13,OUTPUT); loop: HIGH, delay(250), LOW, delay(250)
    const uno = boot("blink");
    const changes: [number, boolean][] = [];
    uno.onPin((pin, high) => pin === 13 && changes.push([Math.round(uno.timeMs), high]));
    uno.runMs(1100);
    expect(uno.pinState(13)).toBe(uno.isHigh(13) ? PinState.High : PinState.Low);
    const highs = changes.filter(([, h]) => h).map(([t]) => t);
    expect(highs.length).toBeGreaterThanOrEqual(2);
    expect(highs[1] - highs[0]).toBeGreaterThanOrEqual(495);
    expect(highs[1] - highs[0]).toBeLessThanOrEqual(505);
  });

  it("an INPUT_PULLUP pin with nothing connected reads HIGH; a button to GND pulls it LOW", () => {
    // pinMode(2,INPUT_PULLUP); pinMode(8,OUTPUT); digitalWrite(8, digitalRead(2)==LOW); prints pressed/released
    const uno = boot("button");
    const out = serialOf(uno);
    uno.runMs(50);
    expect(uno.pinState(2)).toBe(PinState.InputPullUp);
    expect(uno.isHigh(8)).toBe(false);
    uno.setDigital(2, false); // pressed: pin pulled to GND
    uno.runMs(30);
    expect(uno.isHigh(8)).toBe(true);
    uno.setDigital(2, null); // released: the pull-up wins again
    uno.runMs(30);
    expect(uno.isHigh(8)).toBe(false);
    expect(out()).toBe("pressed\r\nreleased\r\n");
    expect(uno.baud).toBe(115200);
  });

  it("analogRead(A0) follows the voltage on A0 (0–5 V → 0–1023)", () => {
    const uno = boot("analog");
    const out = serialOf(uno);
    uno.setAnalog(0, 2.5);
    uno.runMs(30);
    uno.setAnalog(0, 5);
    uno.runMs(60);
    uno.setAnalog(0, 0);
    uno.runMs(60);
    const values = out().trim().split(/\r\n/).map(Number);
    expect(values[0]).toBeGreaterThanOrEqual(510);
    expect(values[0]).toBeLessThanOrEqual(513);
    expect(values).toContain(1023);
    expect(values[values.length - 1]).toBe(0);
  });

  it("analogWrite: PWM duty on pins 9 and 10 (64/255 and 191/255)", () => {
    const uno = boot("fade");
    uno.runMs(20);
    uno.takeDuty(9);
    uno.takeDuty(10);
    uno.runMs(40);
    expect(uno.takeDuty(9)).toBeCloseTo(64 / 255, 1);
    expect(uno.takeDuty(10)).toBeCloseTo(191 / 255, 1);
    expect(uno.frequency(9)).toBeGreaterThan(400); // Uno PWM ~490 Hz on 9/10
    expect(uno.frequency(9)).toBeLessThan(600);
  });

  it("Servo.write(45): a ~1000 µs pulse every 20 ms on pin 9", () => {
    const uno = boot("servo");
    uno.runMs(100);
    const us = uno.pulseMicros(9);
    const angle = ((us - 544) / (2400 - 544)) * 180;
    expect(angle).toBeGreaterThan(42);
    expect(angle).toBeLessThan(48);
    expect(uno.frequency(9)).toBeGreaterThan(45);
    expect(uno.frequency(9)).toBeLessThan(55);
  });

  it("tone(8, 440): pin 8 toggles at 440 Hz", () => {
    const uno = boot("tone");
    uno.runMs(50);
    expect(uno.frequency(8)).toBeGreaterThan(435);
    expect(uno.frequency(8)).toBeLessThan(445);
  });

  it("Serial input: what is typed reaches Serial.readStringUntil", () => {
    // prints "Type your name:", then "Hello, <name>!" for each line received
    const uno = boot("echo");
    const out = serialOf(uno);
    uno.runMs(50);
    uno.serialWrite("Aline\n");
    uno.runMs(1200); // readStringUntil may wait for its 1 s timeout after the last byte
    expect(out()).toBe("Type your name:\r\nHello, Aline!\r\n");
  });

  it("an I²C LCD (LiquidCrystal_I2C at 0x27) shows the text", () => {
    // lcd.init(); lcd.backlight(); lcd.print("Hello, NGA!"); lcd.setCursor(0,1); lcd.print("Temp: 25C");
    const uno = boot("lcd");
    const lcd = new HD44780();
    lcdI2C(uno, lcd, 0x27);
    // LiquidCrystal_I2C's begin() waits a whole second, as on a real board.
    uno.runMs(400);
    expect(lcd.text()).toEqual(["", ""]);
    uno.runMs(1200);
    expect(lcd.text()).toEqual(["Hello, NGA!", "Temp: 25C"]);
    expect(lcd.backlight).toBe(true);
    expect(lcd.display).toBe(true);
  });

  it("a parallel LCD (LiquidCrystal(12,11,5,4,3,2)) shows the text", () => {
    const uno = boot("lcdpar");
    const lcd = new HD44780();
    lcdParallel(uno, lcd, { rs: 12, en: 11, d4: 5, d5: 4, d6: 3, d7: 2 });
    uno.runMs(400);
    expect(lcd.text()[0]).toBe("Parallel LCD");
  });
});
