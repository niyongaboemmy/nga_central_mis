import {
  AVRADC,
  AVRClock,
  AVREEPROM,
  AVRIOPort,
  AVRTimer,
  AVRTWI,
  AVRUSART,
  CPU,
  EEPROMMemoryBackend,
  PinState,
  adcConfig,
  avrInstruction,
  clockConfig,
  eepromConfig,
  portBConfig,
  portCConfig,
  portDConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  twiConfig,
  usart0Config,
  type TWIEventHandler,
} from "avr8js";
import { PIN_COUNT, pinPort, type Port } from "./pins";

/**
 * An Arduino Uno (ATmega328P at 16 MHz) running real firmware, in the browser, with avr8js.
 * The pins are numbered as on the board: D0–D13, A0–A5 (= D14–D19). What it tracks per pin
 * gives parts what they need: the level (LEDs, logic), the share of time high (PWM brightness),
 * the frequency (a buzzer's pitch) and the last pulse width (a servo's angle).
 */
export const FREQ_HZ = 16_000_000;
export { PIN_COUNT, pinPort, pinName, parsePin } from "./pins";

/** An I²C device on the bus (e.g. an LCD's PCF8574 backpack at 0x27). */
export interface I2CDevice {
  /** A transfer to this device begins (write: master → device). */
  start?(write: boolean): void;
  /** One byte from the master; return false to NACK. */
  write?(byte: number): boolean | void;
  /** One byte to the master. */
  read?(): number;
  stop?(): void;
}

class I2CBus implements TWIEventHandler {
  readonly devices = new Map<number, I2CDevice>();
  private current: I2CDevice | null = null;
  constructor(private twi: AVRTWI) {}
  start() {
    this.twi.completeStart();
  }
  stop() {
    this.current?.stop?.();
    this.current = null;
    this.twi.completeStop();
  }
  connectToSlave(addr: number, write: boolean) {
    const d = this.devices.get(addr) ?? null;
    this.current = d;
    d?.start?.(write);
    this.twi.completeConnect(!!d);
  }
  writeByte(value: number) {
    this.twi.completeWrite(!!this.current && this.current.write?.(value) !== false);
  }
  readByte() {
    this.twi.completeRead(this.current?.read?.() ?? 0xff);
  }
}

interface PinTrack {
  high: boolean;
  /** What the pin is doing: driven high/low, an input, or an input with its pull-up. */
  state: PinState;
  lastChange: number;
  highCycles: number;
  windowStart: number;
  lastRise: number;
  period: number;
  pulse: number;
  edges: number;
}

export class ArduinoUno {
  readonly cpu: CPU;
  readonly ports: Record<Port, AVRIOPort>;
  readonly usart: AVRUSART;
  readonly adc: AVRADC;
  readonly twi: AVRTWI;
  readonly i2c: I2CBus;
  readonly timers: AVRTimer[];
  private readonly track: PinTrack[];
  private readonly pinListeners = new Set<(pin: number, high: boolean, state: PinState) => void>();
  private readonly serialListeners = new Set<(text: string) => void>();
  private readonly rx: number[] = [];
  /** What drives each pin from outside (a part): high, low, or nothing (null). */
  private readonly driven: (boolean | null)[] = Array(PIN_COUNT).fill(null);
  private txPending = "";
  /** Bytes sent by the program (Serial.print), for the TX light. */
  txCount = 0;
  rxCount = 0;

  constructor(program: Uint8Array) {
    const flash = new Uint16Array(0x8000 / 2);
    new Uint8Array(flash.buffer).set(program.subarray(0, 0x8000));
    this.cpu = new CPU(flash);
    this.timers = [new AVRTimer(this.cpu, timer0Config), new AVRTimer(this.cpu, timer1Config), new AVRTimer(this.cpu, timer2Config)];
    new AVRClock(this.cpu, FREQ_HZ, clockConfig);
    new AVREEPROM(this.cpu, new EEPROMMemoryBackend(1024), eepromConfig);
    this.usart = new AVRUSART(this.cpu, usart0Config, FREQ_HZ);
    this.usart.onByteTransmit = (b) => {
      this.txCount++;
      this.txPending += String.fromCharCode(b);
    };
    this.usart.onRxComplete = () => this.feedRx();
    this.ports = { B: new AVRIOPort(this.cpu, portBConfig), C: new AVRIOPort(this.cpu, portCConfig), D: new AVRIOPort(this.cpu, portDConfig) };
    this.adc = new AVRADC(this.cpu, adcConfig);
    this.twi = new AVRTWI(this.cpu, twiConfig, FREQ_HZ);
    this.i2c = new I2CBus(this.twi);
    this.twi.eventHandler = this.i2c;

    this.track = Array.from({ length: PIN_COUNT }, () => ({ high: false, state: PinState.Input, lastChange: 0, highCycles: 0, windowStart: 0, lastRise: -1, period: 0, pulse: 0, edges: 0 }));
    for (const port of ["B", "C", "D"] as Port[]) this.ports[port].addListener(() => this.portChanged(port));
  }

  /**
   * What an input pin reads. avr8js reads only what drives the pin from outside, so the pull-up
   * is modelled here: nothing connected reads HIGH with INPUT_PULLUP and LOW without (a floating
   * pin is undefined on real hardware; LOW is the predictable choice).
   */
  private settleInput(pin: number, state: PinState) {
    const p = pinPort(pin)!;
    const value = this.driven[pin] ?? state === PinState.InputPullUp;
    this.ports[p.port].setPin(p.bit, value);
  }

  private portChanged(port: Port) {
    const now = this.cpu.cycles;
    const io = this.ports[port];
    const first = port === "D" ? 0 : port === "B" ? 8 : 14;
    const count = port === "C" ? 6 : port === "B" ? 6 : 8;
    for (let bit = 0; bit < count; bit++) {
      const pin = first + bit;
      const t = this.track[pin];
      const state = io.pinState(bit);
      if (state === PinState.Input || state === PinState.InputPullUp) this.settleInput(pin, state);
      const high = state === PinState.High || state === PinState.InputPullUp;
      if (high === t.high && state === t.state) continue;
      if (high !== t.high) {
        if (t.high) {
          t.highCycles += now - t.lastChange;
          if (t.lastRise >= 0) t.pulse = now - t.lastRise;
        } else {
          if (t.lastRise >= 0) t.period = now - t.lastRise;
          t.lastRise = now;
        }
        t.edges++;
        t.lastChange = now;
        t.high = high;
      }
      t.state = state;
      for (const l of this.pinListeners) l(pin, high, state);
    }
  }

  // ------------------------------------------------------------------ running

  /** Runs `cycles` CPU cycles (16 000 per simulated millisecond). */
  run(cycles: number) {
    const cpu = this.cpu;
    const end = cpu.cycles + cycles;
    this.feedRx();
    while (cpu.cycles < end) {
      avrInstruction(cpu);
      cpu.tick();
    }
    this.flushSerial();
  }

  runMs(ms: number) {
    this.run(Math.round(ms * (FREQ_HZ / 1000)));
  }

  get timeMs() {
    return this.cpu.cycles / (FREQ_HZ / 1000);
  }

  // ------------------------------------------------------------------ serial

  onSerial(cb: (text: string) => void) {
    this.serialListeners.add(cb);
    return () => this.serialListeners.delete(cb);
  }
  private flushSerial() {
    if (!this.txPending) return;
    const text = this.txPending;
    this.txPending = "";
    for (const l of this.serialListeners) l(text);
  }
  /** Text typed in the Serial Monitor, delivered one byte at a time as the UART frees up. */
  serialWrite(text: string) {
    for (const b of new TextEncoder().encode(text)) this.rx.push(b);
    this.feedRx();
  }
  private feedRx() {
    if (!this.rx.length || this.usart.rxBusy) return;
    if (this.usart.writeByte(this.rx[0]) !== false) {
      this.rx.shift();
      this.rxCount++;
    }
  }
  /**
   * The baud rate the program set with Serial.begin, as written in the sketch (the UART's divider
   * gives 9615 for 9600, as on the chip); 0 before Serial.begin.
   */
  get baud() {
    if (!this.usart.rxEnable && !this.usart.txEnable) return 0;
    return nominalBaud(this.usart.baudRate);
  }

  // ------------------------------------------------------------------ pins

  onPin(cb: (pin: number, high: boolean, state: PinState) => void) {
    this.pinListeners.add(cb);
    return () => this.pinListeners.delete(cb);
  }
  isHigh(pin: number) {
    return this.track[pin]?.high ?? false;
  }
  /** The pin's mode as the program set it (OUTPUT driving high/low, INPUT, INPUT_PULLUP). */
  pinState(pin: number): PinState {
    const p = pinPort(pin);
    return p ? this.ports[p.port].pinState(p.bit) : PinState.Input;
  }
  /**
   * Something outside drives the pin high or low (a button pressed, a switch), or lets it go
   * (null: a released button to GND, so INPUT_PULLUP reads HIGH again).
   */
  setDigital(pin: number, value: boolean | null) {
    if (!pinPort(pin)) return;
    this.driven[pin] = value;
    this.settleInput(pin, this.pinState(pin));
  }
  /** A voltage on an analog pin A0–A5 (0–5 V; analogRead gives 0–1023). */
  setAnalog(channel: number, volts: number) {
    if (channel >= 0 && channel < 8) this.adc.channelValues[channel] = Math.max(0, Math.min(5, volts));
  }
  /**
   * Share of time the pin was high since the last call (PWM: analogWrite(pin, 64) ≈ 0.25), then
   * starts a new window. A pin that didn't change reads 0 or 1.
   */
  takeDuty(pin: number): number {
    const t = this.track[pin];
    if (!t) return 0;
    const now = this.cpu.cycles;
    const span = now - t.windowStart;
    const high = t.highCycles + (t.high ? now - Math.max(t.lastChange, t.windowStart) : 0);
    t.highCycles = 0;
    t.windowStart = now;
    if (t.high) t.lastChange = Math.max(t.lastChange, now);
    return span > 0 ? Math.max(0, Math.min(1, high / span)) : t.high ? 1 : 0;
  }
  /** The frequency of a toggling pin (tone(), PWM), or 0 when it stopped (no edge for 50 ms). */
  frequency(pin: number): number {
    const t = this.track[pin];
    if (!t || t.period <= 0 || this.cpu.cycles - t.lastChange > FREQ_HZ / 20) return 0;
    return FREQ_HZ / t.period;
  }
  /** The last high pulse in microseconds (a servo's 544–2400 µs), 0 when none lately. */
  pulseMicros(pin: number): number {
    const t = this.track[pin];
    if (!t || t.pulse <= 0 || this.cpu.cycles - t.lastChange > FREQ_HZ / 10) return 0;
    return t.pulse / (FREQ_HZ / 1_000_000);
  }
}

const STANDARD_BAUDS = [300, 600, 1200, 2400, 4800, 9600, 14400, 19200, 28800, 31250, 38400, 57600, 74880, 115200, 230400, 250000, 500000, 1000000, 2000000];
/** The standard rate within 3.5 % of the real one (the Uno's 16 MHz divider is never exact). */
export function nominalBaud(real: number): number {
  const near = STANDARD_BAUDS.find((b) => Math.abs(real - b) / b < 0.035);
  return near ?? Math.round(real);
}

