/**
 * What a full ring makes a writer do: wait for the reader, take the records
 * out and post them to the reader, or (the reader's own thread) take them out
 * and hand them on.
 */
type ConsoleFull = "wait" | "post" | "take";
/** One batch of console output taken out of the ring. */
interface ConsoleBatch {
  /** Batch number (BATCH, wraps as an int32): ConsoleOrder's order. */
  seq: number;
  bytes: Uint8Array;
}
/** Any thread's view of the ring: write records, take them out. */
declare class ConsoleRing {
  #private;
  readonly buffer: SharedArrayBuffer;
  readonly ctl: Int32Array;
  constructor(buffer: SharedArrayBuffer);
  get closed(): boolean;
  /** Bytes dropped so far (DROPPED). */
  get dropped(): number;
  /** Bytes in the ring (committed or not). Racy, for heuristics. */
  get used(): number;
  /** Nothing reserved and no batch on its way to the reader. */
  get quiet(): boolean;
  /** Anything reserved since the reader last took (a plain read: at worst stale, as the poll it serves). */
  get pending(): boolean;
  /**
   * Put src[p, p + len) in as one record (at most a quarter of the ring). False if it
   * does not fit (nothing written).
   */
  tryWrite(src: Uint8Array, p: number, len: number): boolean;
  /** Whether the record at TAIL is committed. */
  committedAtTail(): boolean;
  /** Wake a waiting reader (WAITING `w`, or whatever it is). */
  kick(w?: number): void;
  /**
   * Write src[p, p + len), splitting what is longer than a record; a full
   * ring does as `full` says (top of this file). `sink` gets the batches
   * taken out ("post", "take"). Returns the bytes dropped.
   */
  write(src: Uint8Array, p: number, len: number, full: ConsoleFull, sink?: (b: ConsoleBatch) => void): number;
  /** CPU 0's host took a posted batch. */
  batchTaken(): void;
  /**
   * Take every committed record, in order, as one chunk with a batch
   * number; null if there is none or another thread is taking (`spin`:
   * wait for it instead, briefly).
   */
  take(spin?: boolean): ConsoleBatch | null;
  /** The session ended: drop later writes, release waiting writers. */
  close(): void;
}
/**
 * The reader's loop (one thread): take what is committed, then wait on
 * WAITING with Atomics.waitAsync, eagerly (any commit wakes it) after an
 * empty take, lazily (a fuller ring, or LAZY_MS) after one that found
 * output. take() may also be called directly (CPU 0's host: its clock, its
 * own writes, idle and exit); the loop is on this thread too, so the two
 * never overlap.
 */
declare class ConsoleRingReader {
  #private;
  readonly ring: ConsoleRing;
  constructor(ring: ConsoleRing, deliver: (b: ConsoleBatch) => void);
  /** Take what is there now; true if there was something. */
  take(): boolean;
  /** Start the loop. */
  start(): void;
  /** Stop the loop (after a last take()). */
  stop(): void;
}
/** What CPU 0's host sends to start a CPU (structured-cloneable). */
interface CpuInit {
  /** The CPU number (1..). */
  cpu: number;
  /** The idle task (kw_secondary_entry's argument). */
  idle: bigint;
  module: WebAssembly.Module;
  /** The kernel's shared memory. */
  memory: WebAssembly.Memory;
  /** How many CPUs the kernel was offered (wasm_cpu_count). */
  cpus: number;
  /** Address of __wasm_init_memory_flag: it must read 2 (the data is initialised) before the start function runs. */
  initFlag: number;
  /**
   * Address of CPU 0's word of pending interrupts (wasm_host_irqs). When
   * this CPU ends the session (exit, trap), it raises the stop IPI there:
   * CPU 0 may be spinning for this one, and its host takes the exit only
   * once CPU 0 suspends.
   */
  irqWord0: number;
  /**
   * The guest's monotonic clock reads `performance.timeOrigin +
   * performance.now() - epochMs` (ms) on every thread: CPU 0's clock.
   */
  epochMs: number;
  /** Offer kwemu's JIT tier on this CPU (KernelConfig.jit). */
  jit: boolean;
  /** The memory is a memory64 one (the JIT's modules import it as such). */
  memory64: boolean;
  /** Where this CPU's JIT host mirrors its counters (JIT_MIRROR_WORDS on a SharedArrayBuffer), for CPU 0's stats(). */
  jitMirror?: Float64Array;
  /** The console ring every CPU writes its console output into (console-ring.ts). */
  console: SharedArrayBuffer;
  /** What a full ring makes this CPU do: wait for the reader, or post the records to CPU 0's host. */
  consoleFull: ConsoleFull;
}
/** Messages from a CPU to CPU 0's host. */
type CpuMessage = {
  t: "running";
} |
/** Console output taken out of a full ring ("post"), with its batch number (ConsoleOrder). */
{
  t: "out";
  seq: number;
  bytes: Uint8Array;
} | {
  t: "err";
  bytes: Uint8Array;
} |
/** A host log line (the JIT's warnings). */
{
  t: "log";
  msg: string;
} | {
  t: "exit";
  code: number;
} | {
  t: "fatal";
  msg: string;
} | {
  t: "trap";
  error: string;
};
/** CPU 0's handle on a started CPU (Platform.spawnCpu). */
interface CpuEndpoint {
  listen(h: {
    message: (msg: CpuMessage) => void;
    error: (e: unknown) => void;
  }): void;
  terminate(): void;
}
/**
 * Console batches by number, for CPU 0's host where it reads the console
 * ring itself (inline and the messages transport; console-ring.ts). It takes
 * batches out of the ring on its own thread, and another CPU that finds the
 * ring full takes one out and posts it, which CPU 0's host gets only once
 * CPU 0 suspends. Every take numbers its batch under the ring's lock, so
 * batches are written by number: one that comes early waits here for those
 * before it. At exit, what waits goes out in order without the numbers that
 * never came. Panic text (fd 2) is one CPU's (panic_cpu) and is not
 * ordered.
 */
declare class ConsoleOrder {
  /** The next number to write (wraps as an int32, as the ring's counter does). */
  private next;
  private held;
  private emit;
  constructor(emit: (bytes: Uint8Array) => void);
  /** Nothing waits for an earlier batch. */
  get empty(): boolean;
  /** Write batch `seq` once every earlier one is written. */
  put(seq: number, bytes: Uint8Array): void;
  /** At exit: write everything held, in order, skipping the numbers still on the way. */
  flush(): void;
}
/** DRM fourcc of XRGB8888 ("XR24"): 32-bit pixels, little endian B, G, R, X. */
export declare const FOURCC_XRGB8888 = 875713112;
export interface DisplayMode {
  width: number;
  height: number;
  /** Bytes per row. */
  stride: number;
  /** DRM fourcc; only FOURCC_XRGB8888 so far. */
  format: number;
}
/** A copy of the frame, RGBA (the layout of canvas ImageData). */
export interface DisplayFrame {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
/** A display size in pixels. */
export interface DisplaySize {
  width: number;
  height: number;
  /**
   * Pixels per inch of this size on the host's screen (a browser's CSS
   * pixels: 96). With it the guest learns the physical size of its picture
   * (fb_var_screeninfo width and height, in mm), scaled to fit this area
   * when the mode differs from it. Default: unknown.
   */
  dpi?: number;
}
/**
 * The display option: false (none), true (640x480), a size, or a function
 * that returns the size wanted each time a program first opens /dev/fb0.
 */
export type DisplayOption = boolean | DisplaySize | (() => DisplaySize);
export declare const DEFAULT_DISPLAY_SIZE: DisplaySize;
export interface DisplayHostOptions {
  /** Offer a display to the kernel, and the size wanted. Default false: no /dev/fb0. */
  enabled?: DisplayOption;
  /** The kernel's memory, read at call time. */
  memory: () => WebAssembly.Memory;
  /** A program opened the display (mode), or the last one closed it (null). */
  onChange?: (mode: DisplayMode | null) => void;
  log?: (msg: string) => void;
}
/** What a machine snapshot keeps of the display (DisplayHost.saveState()). */
interface DisplaySnapshot {
  /** Address of the pixels in kernel memory, 0 while detached. */
  addr: number;
  mode: DisplayMode | null;
  /** The size last offered to the kernel (for the physical size). */
  offered: DisplaySize | null;
}
export interface DisplayStats {
  /** wasm_driver_fb_attach() calls with pixels. */
  attaches: number;
  /** ... and without (the last close). */
  detaches: number;
}
export declare class DisplayHost {
  #private;
  readonly enabled: boolean;
  /** Address of the pixels in kernel memory; 0 while nothing has /dev/fb0 open. */
  addr: number;
  /** The mode while attached, else null. */
  mode: DisplayMode | null;
  /** Did the kernel ask (wasm_driver_fb_init)? False for a kernel without kwfb. */
  probed: boolean;
  stats: DisplayStats;
  constructor(opts: DisplayHostOptions);
  imports(): Record<string, unknown>;
  /** The state a snapshot keeps (the pixels are in the kernel's memory). */
  saveState(): DisplaySnapshot;
  /**
   * A restored snapshot: the kernel does not ask init or attach again, so
   * take the saved attachment and tell onChange, as an attach would.
   */
  restoreState(s: DisplaySnapshot): void;
  /**
   * The guest's pixels in place (no copy): `mode.height` rows of
   * `mode.stride` bytes, XRGB8888. Null while detached. Valid only until
   * the kernel runs again (the program may close the device and the
   * kernel reuse the memory), so read it at once and do not keep it.
   */
  pixels(): Uint8Array | null;
  /**
   * Copy the current frame as RGBA (alpha 255), e.g. for
   * `new ImageData(frame.data, frame.width)`. `out` is reused when it has
   * the right size. Null while detached.
   */
  readRGBA(out?: Uint8ClampedArray): DisplayFrame | null;
}
/**
 * Convert packed XRGB8888 rows (`width * 4` bytes each, as worker mode
 * sends frames) to RGBA with alpha 255. `out` is reused when it has the
 * right size.
 */
export declare function xrgbToRgba(src: Uint8Array, width: number, height: number, out?: Uint8ClampedArray): Uint8ClampedArray;
/** A frame as a binary PPM (P6) image. */
export declare function frameToPpm(frame: DisplayFrame): Uint8Array;
export declare const EV_SYN = 0;
export declare const EV_KEY = 1;
export declare const EV_REL = 2;
export declare const EV_ABS = 3;
export declare const REL_X = 0;
export declare const REL_Y = 1;
export declare const REL_WHEEL = 8;
export declare const ABS_X = 0;
export declare const ABS_Y = 1;
/** The tablet's ABS_X/ABS_Y range is 0..ABS_MAX. */
export declare const ABS_MAX = 32767;
export declare const BTN_LEFT = 272;
export declare const BTN_RIGHT = 273;
export declare const BTN_MIDDLE = 274;
/** kwinput device numbers (the bits of the open mask). */
export declare const INPUT_KEYBOARD = 0;
export declare const INPUT_MOUSE = 1;
export declare const INPUT_TABLET = 2;
/** Which kwinput devices some guest program has open. */
export interface InputState {
  keyboard: boolean;
  /** The relative mouse. */
  mouse: boolean;
  /** The absolute pointer (tablet). A kernel without it never sets this. */
  tablet: boolean;
}
/**
 * The evdev injection surface: InputHost inline, and in worker mode a
 * mirror on the owner's thread that forwards each call to the worker's
 * InputHost (worker-devices.ts). Return values say whether the guest gets
 * the event (in worker mode: as far as this thread knows the open state).
 */
export interface Evdev {
  /** Open mask: bit INPUT_KEYBOARD, INPUT_MOUSE, INPUT_TABLET. */
  readonly mask: number;
  readonly keyboardOpen: boolean;
  readonly mouseOpen: boolean;
  readonly tabletOpen: boolean;
  readonly state: InputState;
  key(code: number, down: boolean): boolean;
  button(code: number, down: boolean): boolean;
  move(dx: number, dy: number): boolean;
  wheel(clicks: number): boolean;
  moveTo(x: number, y: number): boolean;
  tabletButton(code: number, down: boolean): boolean;
  tabletWheel(clicks: number): boolean;
  releaseAll(): void;
}
export interface InputHostOptions {
  /** Offer the devices (the kernel registers them only then). Default false. */
  enabled?: boolean;
  /** The kernel's memory, read at call time. */
  memory: () => WebAssembly.Memory;
  /** Set IRQ_INPUT and wake the kernel. */
  raise: () => void;
  /** The open state changed. */
  onChange?: (state: InputState) => void;
}
/** What a machine snapshot keeps of kwinput (InputHost.saveState()). */
interface InputSnapshot {
  /** Open mask. */
  mask: number;
  /** Keys and buttons the guest saw pressed. */
  keys: number[];
  buttons: number[];
  tabletButtons: number[];
  /** Events the guest had not read yet, flat: device, type, code, value. */
  queue: number[];
}
export interface InputStats {
  /** Events the kernel took. */
  delivered: number;
  /** Presses and motion dropped because no program had the device open, or the queue was full. */
  dropped: number;
}
export declare class InputHost implements Evdev {
  #private;
  readonly enabled: boolean;
  /** Did the kernel ask (wasm_driver_input_init)? False for a kernel without kwinput. */
  probed: boolean;
  /** Open mask from the kernel: bit INPUT_KEYBOARD, INPUT_MOUSE, INPUT_TABLET. */
  mask: number;
  stats: InputStats;
  constructor(opts: InputHostOptions);
  /** Some program has the keyboard open. */
  get keyboardOpen(): boolean;
  /** Some program has the mouse open. */
  get mouseOpen(): boolean;
  /** Some program has the absolute pointer (tablet) open. */
  get tabletOpen(): boolean;
  get state(): InputState;
  /**
   * Press (down = true) or release a key, by Linux key code (see
   * domCodeToLinux()). Returns whether the guest gets it: a press only
   * while the keyboard is open, a release only of a key it saw pressed.
   * Repeats of a held key are ignored (the device has no EV_REP).
   */
  key(code: number, down: boolean): boolean;
  /** Press or release a mouse button (BTN_LEFT, BTN_RIGHT, BTN_MIDDLE); like key(). */
  button(code: number, down: boolean): boolean;
  /** Relative pointer motion in pixels (rounded); dropped while the mouse is closed. */
  move(dx: number, dy: number): boolean;
  /** Wheel clicks: positive = away from the user (up), as REL_WHEEL. */
  wheel(clicks: number): boolean;
  /**
   * Move the absolute pointer to (x, y), normalised: 0..1 from the left
   * and top edges of the picture (clamped). For a pixel px of a mode
   * `width` wide, x = (px + 0.5) / width lands on it. Dropped while the
   * tablet is closed.
   */
  moveTo(x: number, y: number): boolean;
  /** Press or release a button of the absolute pointer; like button(). */
  tabletButton(code: number, down: boolean): boolean;
  /** Wheel clicks on the absolute pointer; like wheel(). */
  tabletWheel(clicks: number): boolean;
  /** Release every key and button the guest saw pressed (e.g. when the page loses focus). */
  releaseAll(): void;
  /** The state a snapshot keeps. */
  saveState(): InputSnapshot;
  /**
   * A restored snapshot: the kernel does not call init or report the open
   * state again, so take them from the snapshot. The guest still gets the
   * events it had not read, then a release of every key and button it saw
   * pressed (the host's keys are not held in the new session).
   */
  restoreState(s: InputSnapshot): void;
  imports(): Record<string, unknown>;
}
/**
 * Linux key codes by DOM KeyboardEvent.code (the physical key, independent
 * of the layout), for a US-layout PC keyboard and the usual extra keys.
 */
export declare const DOM_CODE_TO_LINUX: Readonly<Record<string, number>>;
/** The Linux key code of a DOM KeyboardEvent.code, or undefined. */
export declare function domCodeToLinux(code: string): number | undefined;
/** The evdev button of a DOM MouseEvent.button (0 left, 1 middle, 2 right), or undefined. */
export declare function domButtonToLinux(button: number): number | undefined;
/** JIT counters of one kernel (Kernel.jit.stats). */
export interface JitStats {
  /** The host offers the JIT (KernelConfig.jit, and the engine can compile synchronously). */
  enabled: boolean;
  /** The kernel's kwemu asked for it (kw_host_jit_caps was called): false for a kernel without the tier. */
  requested: boolean;
  /** Blocks compiled and installed. */
  compiled: number;
  /** Compiled blocks currently installed (compiled - freed). */
  live: number;
  /** Most blocks installed at once (kwemu's pool has 1024 slots). */
  maxLive: number;
  /** Slots kwemu released (block overwritten, evicted or cache reset). */
  freed: number;
  /** Compiles that failed (kwemu interprets those blocks), plus rejected calls. */
  failed: number;
  /** Total time spent compiling and instantiating (with V8, also the first call's compile), in ms. */
  compileMs: number;
  /** Longest single compile, instantiation and first call, in ms (the longest the CPU could not answer an interrupt for one). */
  maxCompileMs: number;
  /** Total size of the compiled modules, in bytes. */
  bytes: number;
  /** Compiled modules the engine has garbage-collected (-1: no FinalizationRegistry, unknown). */
  collected: number;
  /** Freed modules not collected yet (freed - collected; -1 when unknown). */
  retained: number;
  /** Most freed modules uncollected at once (-1 when unknown). */
  maxRetained: number;
  /** ArrayBuffers allocated to prompt a collection (retained above RETAINED_NUDGE). */
  gcNudges: number;
  /** Compiles refused because retained reached RETAINED_LIMIT (kwemu interprets those blocks). */
  refused: number;
}
/**
 * kwemu's own counters, from a kernel built with -Dkwemu-stats
 * (`kernel/build.sh stats`) that has compiled at least one block.
 */
export interface KwemuStats {
  /** Guest instructions retired (struct kw_cpu icount). */
  icount: number;
  /**
   * kwemu.Stats as 64-bit words, in the layout of src/emu/kwemu.zig: 11
   * counters, op_hist[192], JIT insns, hand-backs, hb[192], hb_gen[40],
   * jx[64] (indices in src/emu/jit.zig Jx).
   */
  words: number[];
}
export interface JitHostOptions {
  /** Offer the JIT (default true); false: kw_host_jit_caps() returns 0. */
  enabled?: boolean;
  /** The kernel's memory, read at call time (boot may switch memory types). */
  memory: () => WebAssembly.Memory;
  /** Whether that memory is a memory64 one, read at call time. */
  memory64: () => boolean;
  log?: (msg: string) => void;
  /** Uncollected freed modules from which the host prompts a collection (default RETAINED_NUDGE; Infinity: never). */
  retainedNudge?: number;
  /** Uncollected freed modules at which compiles are refused (default RETAINED_LIMIT; Infinity: never). */
  retainedLimit?: number;
  /**
   * A secondary CPU's host (cpu.ts): copy the counters here after every
   * compile and free (JIT_MIRROR_WORDS, on a SharedArrayBuffer), where
   * CPU 0's host reads them (jitStatsFromMirror).
   */
  mirror?: Float64Array;
}
export declare class JitHost {
  #private;
  readonly stats: JitStats;
  constructor(opts: JitHostOptions);
  /** Bind to the kernel instance's function table; call after instantiation, before _start. */
  attach(exports: WebAssembly.Exports): void;
  /**
   * kwemu's counters, if the kernel exports them (-Dkwemu-stats) and has
   * compiled a block (that is how the cpu is found). It writes the emit
   * buffer, which is free outside kw_host_jit_compile, so any call from
   * JavaScript is safe.
   */
  kwemuStats(of?: number | undefined): KwemuStats | undefined;
  /** The three `unkernel` imports. */
  imports(): Record<string, unknown>;
  caps(): number;
  compile(ptr: bigint | number, len: bigint | number, slot: number, flags?: number): number;
  free(slot: number): void;
}
/** ALSA formats the kernel offers (SNDRV_PCM_FORMAT_*). */
export declare const SOUND_FORMAT_U8 = 1;
export declare const SOUND_FORMAT_S16_LE = 2;
/** The format of a playback stream. */
export interface SoundFormat {
  /** Frames per second. */
  rate: number;
  /** 1 or 2 (interleaved: left, right). */
  channels: number;
  /** SOUND_FORMAT_U8 (unsigned 8 bit) or SOUND_FORMAT_S16_LE (signed 16 bit). */
  format: number;
  /** Bytes per frame (channels * sample size). */
  frameBytes: number;
}
/** What a guest program is doing with the sound device. */
export interface SoundState {
  /** Some program has the PCM open. */
  open: boolean;
  /** The stream is running: chunks are coming. */
  playing: boolean;
  /** The format once the program set it (prepare), else null. */
  format: SoundFormat | null;
}
/** PCM the guest played, in the stream's format. */
export interface SoundChunk {
  format: SoundFormat;
  /** A copy, owned by the receiver. */
  data: Uint8Array;
  /** data.length / format.frameBytes. */
  frames: number;
}
export interface SoundSink {
  /**
   * The host's preferred rate (e.g. an AudioContext's), shown in the card's
   * long name; programs still choose any rate from 8000 to 48000 Hz.
   */
  rate?: number;
  /**
   * PCM played by the guest, in order. Return the frames (at the chunk's
   * rate) still queued for output after it, if known: programs see it as
   * part of their delay (snd_pcm_delay).
   */
  onChunk?: (chunk: SoundChunk) => number | void;
  /** The state changed (open, format, start, stop, close). */
  onState?: (state: SoundState, event: SoundEvent) => void;
}
/** A state change, as wasm_driver_sound_event() reports it. */
export type SoundEvent = "open" | "prepare" | "start" | "stop" | "drain" | "close";
/** The sound option: false (no device), true (a device whose output is dropped), or a sink. */
export type SoundOption = boolean | SoundSink;
export interface SoundStats {
  /** Opens of the PCM. */
  opens: number;
  /** Stream starts (one per start after prepare, including restarts after an underrun). */
  starts: number;
  /** Stops that were not the end of a drain: underruns, drops (snd_pcm_drop, close while running). */
  stops: number;
  chunks: number;
  frames: number;
  /**
   * The longest a player that started with the first chunk of a stream
   * would have waited for data, in ms: the largest shortfall of frames
   * received against frames due by the host clock since the stream
   * started. A sink needs at least this much queued to play without gaps.
   */
  maxLagMs: number;
}
/** What a machine snapshot keeps of kwsnd (SoundHost.saveState()). */
interface SoundSnapshot {
  state: SoundState;
}
export interface SoundHostOptions {
  /** Offer a sound device, and where its output goes. Default false: no sound card. */
  enabled?: SoundOption;
  /** The kernel's memory, read at call time. */
  memory: () => WebAssembly.Memory;
  log?: (msg: string) => void;
}
export declare class SoundHost {
  #private;
  readonly enabled: boolean;
  /** Did the kernel ask (wasm_driver_sound_init)? False for a kernel without kwsnd. */
  probed: boolean;
  state: SoundState;
  stats: SoundStats;
  constructor(opts: SoundHostOptions);
  /** A program is playing (the stream runs). */
  get playing(): boolean;
  /** The state a snapshot keeps. */
  saveState(): SoundSnapshot;
  /**
   * A restored snapshot: the kernel does not call init again and the
   * stream goes on where it was, so take the saved state and replay it to
   * the sink (open, prepare, start) as the guest's calls did. The kernel's
   * timer keeps handing over frames on the guest's clock, which a restore
   * continues.
   */
  restoreState(s: SoundSnapshot): void;
  imports(): Record<string, unknown>;
}
/** Samples of a chunk as floats in [-1, 1), interleaved like the input. */
export declare function pcmToFloat32(data: Uint8Array, format: SoundFormat, out?: Float32Array): Float32Array;
/**
 * A canonical 44-byte WAV (RIFF, PCM) header for `dataBytes` bytes of
 * samples in `format`.
 */
export declare function wavHeader(format: SoundFormat, dataBytes: number): Uint8Array;
/**
 * Convert PCM to another format: channels (mono to stereo duplicates,
 * stereo to mono averages), sample type, and rate (linear interpolation;
 * fine for checking and for occasional format changes, not for music).
 */
export declare function convertPcm(data: Uint8Array, from: SoundFormat, to: SoundFormat): Uint8Array;
/** kwshm's page size. */
export declare const SHM_PAGE_SIZE = 4096;
/** Why a shm operation failed: `code` is the errno name (ENOENT, EINVAL, ...). */
export declare class ShmError extends Error {
  readonly code: string;
  constructor(code: string, message: string);
}
/** An export, as the kernel last described it. */
export interface ShmInfo {
  id: number;
  /** Bytes exported. */
  size: number;
  /** Pages held (size rounded up to whole pages). */
  pages: number;
  /** Whether the host may write (the guest's fd was writable and not sealed against writes, or a file the host opened read-write). */
  writable: boolean;
  /** Made by the guest (KWSHM_IOC_EXPORT) rather than opened or created by the host. */
  guest: boolean;
  /** Counts the page lists the kernel announced for this export (1 at first; refresh() adds one when it changes). */
  generation: number;
}
/** What a machine snapshot keeps of kwshm (ShmDevice.saveState()): the exports and their pages. */
interface ShmSnapshot {
  exports: {
    info: ShmInfo;
    runOff: number[];
    runAddr: number[];
    runLen: number[];
  }[];
  nextTag: number;
}
/** One request the API runs: inline on ShmDevice, in worker mode in the worker. */
export type ShmCall = {
  op: "open";
  name: string;
  timeout?: number;
} | {
  op: "create";
  name: string;
  size: number;
  mode?: number;
  timeout?: number;
} | {
  op: "openId";
  id: number;
} | {
  op: "refresh";
  id: number;
  force?: boolean;
  timeout?: number;
} | {
  op: "check";
  id: number;
  timeout?: number;
} | {
  op: "close";
  id: number;
  timeout?: number;
} | {
  op: "read";
  id: number;
  offset: number;
  length: number;
} | {
  op: "write";
  id: number;
  offset: number;
  data: Uint8Array;
};
/** What a ShmCall gives: an export's info (open, create, openId, refresh), a flag (check), bytes (read) or nothing. */
export type ShmCallResult = ShmInfo | boolean | Uint8Array | undefined;
export interface ShmDeviceOptions {
  /** Offer the device (the kernel registers kwshm only then). Default false. */
  enabled?: boolean;
  /** False when the kernel has no kwshm (no wasm_driver_shm_init import): requests fail with ENODEV at once. */
  driver?: boolean;
  /** The kernel's memory, read at call time. */
  memory: () => WebAssembly.Memory;
  /** Set IRQ_SHM and wake the kernel. */
  raise: () => void;
}
export interface ShmDeviceStats {
  /** Requests sent to the kernel, and how many it refused. */
  requests: number;
  failed: number;
  /** Page lists announced (exports and refreshes) and exports withdrawn. */
  attaches: number;
  detaches: number;
  /** Exports alive now. */
  exports: number;
  /** Bytes copied out of and into exported pages. */
  bytesRead: number;
  bytesWritten: number;
}
/**
 * The kernel's end of kwshm, on the kernel's thread: the imports, the
 * request queue and the page lists of every live export.
 */
export declare class ShmDevice {
  #private;
  readonly enabled: boolean;
  readonly driver: boolean;
  /** Did the kernel ask (wasm_driver_shm_init)? */
  probed: boolean;
  /** An export's page list arrived or changed (inside the import: do not call into the kernel). */
  onAttach: ((info: ShmInfo) => void) | undefined;
  /** An export is gone (inside the import). */
  onDetach: ((id: number) => void) | undefined;
  stats: ShmDeviceStats;
  constructor(opts: ShmDeviceOptions);
  imports(): Record<string, unknown>;
  /** Requests queued or waiting for the kernel's answer (a snapshot refuses then). */
  get busy(): number;
  /** The state a snapshot keeps (the pages stay held by the kernel). */
  saveState(): ShmSnapshot;
  /**
   * A restored snapshot: the kernel does not announce its exports again,
   * so take their page lists from the snapshot. Guest exports can be
   * opened by id again (openId()); exports the old host opened stay held
   * in the kernel until closed by id.
   */
  restoreState(s: ShmSnapshot): void;
  /** The export's current description, or undefined if there is no such export. */
  info(id: number): ShmInfo | undefined;
  /** Send a request to the kernel; resolves with its answer (>= 0) or rejects with a ShmError. */
  request(op: number, what: string, f: {
    id?: number;
    flags?: number;
    size?: number;
    name?: string;
    timeout?: number;
  }): Promise<number>;
  /** Copy bytes out of export `id` (into `out` at 0 if given). Synchronous: call it on the kernel's thread. */
  read(id: number, offset: number, length: number, out?: Uint8Array): Uint8Array;
  /** Copy `data` into export `id` at `offset`. Synchronous: call it on the kernel's thread. */
  write(id: number, offset: number, data: Uint8Array): void;
  /**
   * Views of the kernel's memory covering [offset, offset + length) of
   * export `id`, one per run of consecutive pages, in order. No copy. They
   * are valid only until the kernel runs again (the guest may release or
   * refresh the export then): use them synchronously and ask again later.
   */
  views(id: number, offset: number, length: number): Uint8Array[];
  /** Run one API call (the inline backend, and the worker's side of worker mode). */
  run(call: ShmCall): Promise<ShmCallResult>;
  /** The kernel exited: fail what is pending and forget every export (the memory stays readable, but nothing in it is held any more). */
  close(): void;
}
/** Why a ShmFile handle ended: close() on it, the export went away (the guest released it, or another handle closed it), or the kernel exited. */
export type ShmCloseReason = "closed" | "released" | "exit";
export interface ShmStats {
  /** Handles open now. */
  open: number;
  /** read() and write() calls, and their bytes. */
  reads: number;
  bytesRead: number;
  writes: number;
  bytesWritten: number;
}
/** One export, seen from the host. Calls on a closed handle reject with ShmError EBADF. */
export interface ShmFile {
  /** The export's id: the kernel's (for a guest export, the one KWSHM_IOC_EXPORT returned). */
  readonly id: number;
  /** The name in /dev/shm, for files the host opened or created. */
  readonly name: string | undefined;
  /** "host" (open(), create()) or "guest" (openId()). */
  readonly origin: "host" | "guest";
  /** Bytes exported, as of the latest page list (refresh() updates it). */
  readonly size: number;
  readonly pages: number;
  readonly writable: boolean;
  /** Counts the page lists; refresh() bumps it when the kernel took the file's pages again. */
  readonly generation: number;
  /**
   * Copy `length` bytes from `offset` (default: everything from offset).
   * Inline the copy happens at once; in worker mode the worker copies (when
   * the kernel next yields or idles) and transfers the bytes here.
   */
  read(offset?: number, length?: number): Promise<Uint8Array>;
  /** Copy `data` into the file at `offset` (it must fit within size; the export must be writable). */
  write(offset: number, data: Uint8Array): Promise<void>;
  /**
   * Take the file's current pages if the view is stale (another size, or a
   * held page no longer in the file); `force` takes them anyway. Resolves
   * true when a new page list came (size and generation updated).
   */
  refresh(opts?: {
    force?: boolean;
    timeout?: number;
  }): Promise<boolean>;
  /** Ask the kernel whether the view is stale: the file changed size, or a held page left the file (truncated or punched). */
  isStale(opts?: {
    timeout?: number;
  }): Promise<boolean>;
  /**
   * End this handle. For a file the host opened or created this releases
   * the export (other handles to it end with "released"); a guest export
   * stays until the guest releases it.
   */
  close(): Promise<void>;
  /** Settles once the handle has ended. */
  readonly closed: Promise<ShmCloseReason>;
}
/** Inline handles add zero-copy access. */
export interface InlineShmFile extends ShmFile {
  /**
   * Views of the kernel's memory for [offset, offset + length), one per run
   * of consecutive pages (a shmem file's pages are scattered). No copy.
   * Valid only until the kernel runs again: use them synchronously.
   */
  views(offset?: number, length?: number): Uint8Array[];
}
/** The surface both inline and worker mode give as `vm.shm`. */
export interface Shm<F extends ShmFile = ShmFile> {
  /**
   * Open /dev/shm/`name` in the guest (one path component; resolved in
   * the init mount namespace). The kernel refuses names with "/" or "..",
   * directories (EISDIR), anything that is not a regular file (EINVAL) and
   * files that are not shmem (EOPNOTSUPP), e.g. a bind mount. Holes are
   * allocated. Rejects with a ShmError (ENOENT, ...; ENODEV without kwshm,
   * ETIMEDOUT after `timeout` ms, default 10000).
   */
  open(name: string, opts?: {
    timeout?: number;
  }): Promise<F>;
  /**
   * Create /dev/shm/`name` with `size` bytes (zeros, all allocated) and
   * open it, for data from the host to the guest. Fails with EEXIST if it
   * exists. `mode` defaults to 0o600 (root's).
   */
  create(name: string, size: number, opts?: {
    mode?: number;
    timeout?: number;
  }): Promise<F>;
  /** A guest export, by the id KWSHM_IOC_EXPORT gave the guest. Rejects with ENOENT if there is none. */
  openId(id: number): Promise<F>;
  readonly stats: ShmStats;
}
/** How a ShmClient runs calls: on ShmDevice (inline) or across to the worker. */
export interface ShmBackend {
  run(call: ShmCall): Promise<ShmCallResult>;
  /** Inline only. */
  views?: (id: number, offset: number, length: number) => Uint8Array[];
}
declare class Handle implements InlineShmFile {
  #private;
  readonly id: number;
  readonly name: string | undefined;
  readonly origin: "host" | "guest";
  readonly closed: Promise<ShmCloseReason>;
  info: ShmInfo;
  done: ShmCloseReason | undefined;
  /** close() asked the kernel to release it: its detach ends this handle as "closed". */
  closing: boolean;
  constructor(client: ShmClient<ShmFile>, info: ShmInfo, name: string | undefined);
  get size(): number;
  get pages(): number;
  get writable(): boolean;
  get generation(): number;
  end(reason: ShmCloseReason): void;
  read(offset?: number, length?: number): Promise<Uint8Array>;
  write(offset: number, data: Uint8Array): Promise<void>;
  refresh(opts?: {
    force?: boolean;
    timeout?: number;
  }): Promise<boolean>;
  isStale(opts?: {
    timeout?: number;
  }): Promise<boolean>;
  close(): Promise<void>;
  views(offset?: number, length?: number): Uint8Array[];
}
/**
 * `vm.shm`: handles to exports, on a backend (ShmDevice inline, messages
 * in worker mode). Feed it the kernel's announcements with attached(),
 * detached() and shutdown().
 */
export declare class ShmClient<F extends ShmFile = ShmFile> implements Shm<F> {
  #private;
  readonly backend: ShmBackend;
  constructor(backend: ShmBackend);
  get stats(): ShmStats;
  open(name: string, opts?: {
    timeout?: number;
  }): Promise<F>;
  create(name: string, size: number, opts?: {
    mode?: number;
    timeout?: number;
  }): Promise<F>;
  openId(id: number): Promise<F>;
  /** @internal */
  forget(h: Handle): void;
  /** @internal */
  count(read: boolean, bytes: number): void;
  /** An export's page list changed (or arrived): handles to it take the new size and generation. */
  update(info: ShmInfo): void;
  /** The export is gone: its handles end with "released". */
  detached(id: number): void;
  /** The kernel exited: every handle ends with "exit". */
  shutdown(): void;
}
/** The inline `vm.shm`: ShmClient straight on the kernel's ShmDevice. */
export declare function inlineShm(dev: ShmDevice): ShmClient<InlineShmFile>;
/** Throw one from a handler to answer the guest with that errno: `code` is its name ("ENOENT"). */
export declare class FsError extends Error {
  readonly code: string;
  readonly errno: number;
  constructor(code: string, message?: string);
}
export type FsFileType = "file" | "dir" | "symlink";
export interface FsAttr {
  type: FsFileType;
  /** Permission bits (default 0o644 files, 0o755 directories, 0o777 links). */
  mode?: number;
  size?: number;
  uid?: number;
  gid?: number;
  nlink?: number;
  atimeMs?: number;
  mtimeMs?: number;
  ctimeMs?: number;
  /** Inode number (with `dev`). Without it one is derived from the path. */
  ino?: number | bigint;
  /** Device number, combined with `ino` (only needed when one tree spans devices). */
  dev?: number | bigint;
  /**
   * A change counter: changes when the data changes. Default: derived
   * from mtimeMs and size. 0 means the guest never caches this file's
   * data, so each of its reads reaches the file (for computed files,
   * whose size may change).
   */
  version?: number;
}
export interface FsDirEntry {
  name: string;
  type: FsFileType;
  /** The inode number and device, as getattr gives them (else one is derived from the path). */
  ino?: number | bigint;
  dev?: number | bigint;
}
export interface FsSetAttr {
  mode?: number;
  uid?: number;
  gid?: number;
  size?: number;
  atimeMs?: number;
  mtimeMs?: number;
}
export interface FsStatFs {
  /** Block size (default 4096). */
  bsize?: number;
  blocks?: number;
  bfree?: number;
  /** Default: bfree. */
  bavail?: number;
  files?: number;
  ffree?: number;
  /** Longest name (default 255). */
  namelen?: number;
}
/** How the guest opens a file. */
export interface FsOpenFlags {
  read: boolean;
  write: boolean;
  /** O_TRUNC: truncate to 0 first. */
  truncate: boolean;
  append: boolean;
}
/**
 * An open file (Fs.open/create), used for the guest's reads, writes,
 * getattr, truncation and fsync until it closes it. It must keep working
 * after the path is renamed or removed. Without `write` the file cannot be
 * opened for writing (EACCES).
 */
export interface FsFile {
  read(offset: number, length: number): MaybePromise<Uint8Array>;
  /** Returns the bytes written. */
  write?(offset: number, data: Uint8Array): MaybePromise<number>;
  getattr?(): MaybePromise<FsAttr>;
  setattr?(attr: FsSetAttr): MaybePromise<void>;
  fsync?(): MaybePromise<void>;
  close?(): MaybePromise<void>;
}
/**
 * A file system by path: every path absolute and normalised ("/" the
 * root, no "." or ".." parts, names never contain "/"). getattr, readdir
 * and open are required. A missing change method answers EROFS (symlink
 * EOPNOTSUPP); hard links are not supported (EPERM). Handlers may be async
 * and throw an FsError, or any Error with an errno `code` as Node's fs
 * errors have, to answer with that errno; anything else is EIO and logged.
 */
export interface Fs {
  getattr(path: string): MaybePromise<FsAttr>;
  readdir(path: string): MaybePromise<FsDirEntry[]>;
  /** Open a regular file. */
  open(path: string, flags: FsOpenFlags): MaybePromise<FsFile>;
  /** Create a regular file (EEXIST if the name exists) and return it open for reading and writing. */
  create?(path: string, mode: number): MaybePromise<FsFile>;
  mkdir?(path: string, mode: number): MaybePromise<void>;
  symlink?(path: string, target: string): MaybePromise<void>;
  readlink?(path: string): MaybePromise<string>;
  /** `dir`: rmdir (ENOTEMPTY unless empty), else unlink. */
  remove?(path: string, dir: boolean): MaybePromise<void>;
  /** Replaces `to` if it exists (an empty directory, or a non-directory over a non-directory). */
  rename?(from: string, to: string): MaybePromise<void>;
  /** Change a path that is not open (chmod, utimes, truncate by name). */
  setattr?(path: string, attr: FsSetAttr): MaybePromise<void>;
  statfs?(): MaybePromise<FsStatFs>;
  /** Called once the last mount of this file system is gone (unmounted, or the VM exited). */
  close?(): MaybePromise<void>;
}
/** @internal A fid as a snapshot keeps it (JSON: inode numbers are decimal strings). */
interface P9FidSnapshot {
  fid: number;
  path: string;
  type: FsFileType;
  /** An open regular file: how it was opened, and its qid.path then. */
  open?: {
    read: boolean;
    write: boolean;
    append: boolean;
    ino: string;
  };
  /** The guest unlinked or replaced it while open: ESTALE after a restore. */
  orphan?: true;
  /** A directory listing being read (readdir past offset 0). */
  dir?: Array<{
    name: string;
    type: FsFileType;
    ino?: string;
    dev?: string;
  }>;
}
/** @internal An export's session as a snapshot keeps it (P9Server.saveExport()). */
interface P9ExportSnapshot {
  name: string;
  /** The guest connection (vsock ports and credit counters). */
  conn: VsockConnSnapshot;
  msize: number;
  fids: P9FidSnapshot[];
}
/** A file's content in a tree: text (UTF-8), bytes, or a function evaluated once per open. */
export type FsTreeFile = string | Uint8Array | (() => string | Uint8Array);
/** A directory as a plain object: names to files or subdirectories. */
export interface FsTree {
  [name: string]: FsTreeFile | FsTree;
}
/** What the guest changed (MemoryFs.onChange). */
export interface MemoryFsChange {
  type: "create" | "write" | "truncate" | "setattr" | "mkdir" | "symlink" | "remove" | "rename";
  path: string;
  /** rename: the new path; symlink: the target. */
  to?: string;
}
/** An in-memory Fs: a tree the host fills and reads, and the guest reads and writes. */
export declare class MemoryFs implements Fs {
  #private;
  /** A file system with `tree`'s files (see FsTree), or empty. */
  constructor(tree?: FsTree);
  /** Call `listener` for every change the guest makes. Returns the unsubscribe function. */
  onChange(listener: (change: MemoryFsChange) => void): () => void;
  /** Create or replace a file (parent directories are created). A function is evaluated once per open (and by readFile). */
  writeFile(path: string, content: FsTreeFile, opts?: {
    mode?: number;
  }): void;
  /** A file's bytes (a copy). */
  readFile(path: string): Uint8Array;
  /** A file's text (UTF-8). */
  readText(path: string): string;
  /** Create a directory and its parents (no error if it exists). */
  mkdirp(path: string, opts?: {
    mode?: number;
  }): void;
  /** Create a symbolic link at `path` to `target` (parents are created). */
  writeLink(path: string, target: string): void;
  /** Remove a file, link or directory (a non-empty directory only with `recursive`; a missing path only with `force`). */
  rm(path: string, opts?: {
    recursive?: boolean;
    force?: boolean;
  }): void;
  /** Move (rename) a file or directory, replacing a file at `to`. */
  move(from: string, to: string): void;
  /** The names in a directory. */
  list(path?: string): string[];
  /** Attributes of a path (getattr), or undefined if it does not exist. */
  stat(path: string): FsAttr | undefined;
  exists(path: string): boolean;
  getattr(path: string): FsAttr;
  readdir(path: string): FsDirEntry[];
  readlink(path: string): string;
  open(path: string, flags: FsOpenFlags): FsFile;
  create(path: string, mode: number): FsFile;
  mkdir(path: string, mode: number): void;
  symlink(path: string, target: string): void;
  remove(path: string, dir: boolean): void;
  rename(from: string, to: string): void;
  setattr(path: string, attr: FsSetAttr): void;
  statfs(): FsStatFs;
}
/** A file system to mount: an Fs (MemoryFs, nodeFs(), your own) or a plain object tree (made a MemoryFs). */
export type FsSource = Fs | FsTree;
export interface MountOptions {
  /** The host answers every change with EROFS, and the guest mounts it read-only. Default false. */
  readOnly?: boolean;
  /** How long mounting (or unmounting) may take, in ms, kwtty's start included. Default 30000; 120000 for createKernel's mounts. */
  timeout?: number;
  /** How long a handler may take before the guest's request fails with ETIMEDOUT (and a log line), in ms; 0 for never. Default 30000. */
  requestTimeout?: number;
}
export interface MountSpec extends MountOptions {
  fs: FsSource;
}
/** createKernel's `mounts`: guest paths to a file system, or to { fs, ...MountOptions }. */
export type MountsOption = Record<string, FsSource | MountSpec>;
export type MountErrorCode =
/** The instance has no vsock device, or the guest's kernel has no 9p (CONFIG_9P_FS). */
"ENODEV" |
/** The guest has no kw9p (an image from before host file systems). */
"ENOENT" |
/** The path is already a mount point (in the guest, or by this SDK), or busy at unmount. */
"EBUSY" |
/** The guest path exists and is not a directory. */
"ENOTDIR" |
/** A bad path or file system. */
"EINVAL" |
/** The guest did not finish within the timeout (no kwtty answered, or a handler hung). */
"ETIMEDOUT" |
/** The kernel exited. */
"ECONNABORTED" |
/** The guest failed otherwise (the message has its words). */
"EREMOTE";
export declare class MountError extends Error {
  readonly code: MountErrorCode;
  constructor(code: MountErrorCode, message: string, cause?: unknown);
}
/** What the guest asked of a mount (Mount.stats). */
export interface MountStats {
  requests: number;
  /** Requests answered with an error. */
  errors: number;
  /** Payload bytes the guest read and wrote. */
  bytesRead: number;
  bytesWritten: number;
}
/** A host file system mounted in the guest (vm.mount(), createKernel({ mounts })). */
export interface Mount {
  /** The guest path. */
  readonly path: string;
  /** True while the guest has it mounted (false once unmounted, by unmount() or in the guest, or at exit). */
  readonly mounted: boolean;
  /** Requests, errors, and payload bytes the guest read and wrote. */
  readonly stats: MountStats;
  /** Unmount it in the guest and stop serving it. Rejects with a MountError EBUSY while a guest process uses it. */
  unmount(opts?: {
    timeout?: number;
  }): Promise<void>;
}
/** @internal Host file systems as a snapshot keeps them (in VsockSnapshot.mounts). */
interface MountsSnapshot {
  /** The 9p server's next export number. */
  next: number;
  mounts: Array<{
    path: string;
    readOnly: boolean;
    export: P9ExportSnapshot;
  }>;
}
/** @internal */
type Parsed = {
  path: string;
  fs: FsSource;
  opts: MountOptions;
};
/** @internal createKernel's `mounts`, checked before boot. */
declare function parseMounts(mounts: MountsOption | undefined, vsock: boolean): Parsed[];
/** The host's CID (VMADDR_CID_HOST). */
export declare const VSOCK_HOST_CID = 2;
/** The guest's CID with kwvsock (KWVSOCK_GUEST_CID). */
export declare const VSOCK_GUEST_CID = 3;
/** Size of the packet header (struct virtio_vsock_hdr). */
export declare const VSOCK_HEADER_SIZE = 44;
/** A packet header, decoded. CIDs fit a double (they are 32-bit in practice). */
export interface VsockHeader {
  srcCid: number;
  dstCid: number;
  srcPort: number;
  dstPort: number;
  len: number;
  type: number;
  op: number;
  flags: number;
  bufAlloc: number;
  fwdCnt: number;
}
/** Decode the header at the start of a packet (at least VSOCK_HEADER_SIZE bytes). */
export declare function decodeVsockHeader(pkt: Uint8Array): VsockHeader;
/** A packet: the header (its len is the payload's) and the payload. */
export declare function encodeVsockPacket(h: Omit<VsockHeader, "len">, payload?: Uint8Array): Uint8Array;
export interface VsockDeviceOptions {
  /** Offer the device (the kernel registers its transport only then). Default false. */
  enabled?: boolean;
  /** The kernel's memory, read at call time. */
  memory: () => WebAssembly.Memory;
  /** Set IRQ_VSOCK and wake the kernel. */
  raise: () => void;
  /** A packet from the guest (a copy; header and payload). */
  onPacket?: (pkt: Uint8Array) => void;
  /** The kernel's driver started: the guest's CID and the largest packet it takes (header and payload). */
  onInit?: (guestCid: number, rxMax: number) => void;
}
/** What a machine snapshot keeps of kwvsock (VsockDevice.saveState()). */
interface VsockSnapshot {
  guestCid: number;
  rxMax: number;
  /**
   * Host file systems (inline mode): each mount's 9p session and the
   * vsock connection it runs on, which a restore takes over; the kernel
   * keeps exactly these connections and resets every other.
   */
  mounts?: MountsSnapshot;
}
/** @internal A connection a snapshot keeps: its ports and credit counters (Connection.saveState()). */
interface VsockConnSnapshot {
  localPort: number;
  remotePort: number;
  rxCnt: number;
  fwdCnt: number;
  sentFwd: number;
  peerBufAlloc: number;
  peerFwdCnt: number;
  txCnt: number;
}
export interface VsockDeviceStats {
  /** Packets and bytes (headers included) from the guest. */
  fromGuest: number;
  fromGuestBytes: number;
  /** Packets and bytes taken by the guest. */
  toGuest: number;
  toGuestBytes: number;
  /** Guest packets the host refused for now (the kernel sends them again). */
  refused: number;
}
/**
 * The host side of kwvsock's imports. The guest's packets go to
 * `onPacket`, packets for the guest are queued with deliver(). The queue
 * for the guest has no limit of its own: VsockHost keeps it to the guest's
 * credit for data, and control packets are small.
 */
export declare class VsockDevice {
  #private;
  readonly enabled: boolean;
  /** Did the kernel ask (wasm_driver_vsock_init)? False for a kernel without kwvsock. */
  probed: boolean;
  /** The guest's CID and largest packet it takes, from the kernel's init (0 before). */
  guestCid: number;
  rxMax: number;
  onPacket: ((pkt: Uint8Array) => void) | undefined;
  onInit: ((guestCid: number, rxMax: number) => void) | undefined;
  /**
   * Test hook: return true to refuse the guest's packet for now. The
   * kernel keeps it, with everything after it, and sends it again after
   * the next IRQ, which is raised from a timer.
   */
  refuse: (() => boolean) | undefined;
  /**
   * Connections (`guestPort:hostPort`) the kernel keeps after a restore;
   * it resets every other connected socket (wasm_driver_vsock_keep, asked
   * by kwvsock's park restore notifier). Set by the host's restore of
   * its mounts before the kernel runs; undefined resets them all.
   */
  keep: Set<string> | undefined;
  /** Saved with the device at the snapshot point: the host file systems (inline mode). */
  onSave: (() => MountsSnapshot | undefined) | undefined;
  /** Why the host's end cannot be saved at the snapshot point (a 9p request in flight), or "". */
  hostBusy: (() => string) | undefined;
  stats: VsockDeviceStats;
  constructor(opts: VsockDeviceOptions);
  /** Packets queued for the guest. */
  get queued(): number;
  /** At the snapshot point: what keeps it from being saved now ("vsock packets", a mount's request), or "". */
  blocker(): string;
  /** Queue a packet (header and payload, at most rxMax bytes once known) for the guest and raise the IRQ. */
  deliver(pkt: Uint8Array): void;
  imports(): Record<string, unknown>;
  /**
   * The state a snapshot keeps. Connections do not survive, except those
   * of host file systems (`mounts`, inline mode): after a restore the
   * kernel resets every connected socket that `keep` does not name.
   */
  saveState(): VsockSnapshot;
  /**
   * A restored snapshot: the kernel does not call init again, so take the
   * saved values and tell onInit, as init would. The kernel resets every
   * connected socket after the restore that `keep` does not name
   * (kwvsock's restore notifier), and any packet for an old connection
   * gets an RST from VsockHost.
   */
  restoreState(s: VsockSnapshot): void;
  /** Drop what is queued (the kernel exited). */
  close(): void;
}
/** Why a vsock operation failed: `code` is the errno name. */
export declare class VsockError extends Error {
  readonly code: string;
  constructor(code: string, message: string);
}
export interface VsockStats {
  /** Connections open now (connecting, established or closing). */
  open: number;
  /** Connections established, in either direction. */
  accepted: number;
  connected: number;
  /** Connection requests refused (by the guest: connect(); by the host: no listener, or a full backlog). */
  refused: number;
  /** Connections reset (RST sent or received while established). */
  resets: number;
  /** Payload bytes received from and sent to the guest. */
  bytesIn: number;
  bytesOut: number;
  /** Packets the guest sent that broke the protocol (beyond the credit, unknown types). */
  violations: number;
}
/** The surface both inline and worker mode give as `vm.vsock`. */
export interface Vsock {
  /** The guest's CID (3). Connections from the host's side go to this CID. */
  readonly guestCid: number;
  /**
   * Accept guest connections to host port `port` (a guest program
   * connects to CID 2, `port`). Connections go to `onConnection` if given,
   * else they wait for accept() (or the listener's async iterator).
   * Throws a VsockError EADDRINUSE if the port is taken.
   */
  listen(port: number, onConnection?: (conn: VsockConnection) => void): VsockListener;
  /**
   * Connect to a guest program listening on `port` (bound to any CID or
   * to 3). Rejects with a VsockError: ECONNREFUSED (nothing listens),
   * ETIMEDOUT (no answer within `timeout` ms, default 10000) or
   * ECONNABORTED (the kernel exited).
   */
  connect(port: number, opts?: {
    timeout?: number;
  }): Promise<VsockConnection>;
  readonly stats: VsockStats;
}
export interface VsockListener extends AsyncIterable<VsockConnection> {
  readonly port: number;
  /** The next connection, or null once the listener is closed (or the kernel exited). */
  accept(): Promise<VsockConnection | null>;
  /** Stop listening: connections not accepted yet are reset, and new requests are refused. */
  close(): void;
}
/**
 * One stream connection. `readable` gives what the guest sends and ends
 * when the guest shuts down its sending side (or closes); `writable`
 * sends, and closing it shuts down the host's sending side (a half-close:
 * the guest reads EOF and may still send). Data is acknowledged to the
 * guest (credit) only as `readable` is read.
 */
export interface VsockConnection {
  /** The host side's port (the listener's, or the one connect() picked). */
  readonly localPort: number;
  /** The guest side's port. */
  readonly remotePort: number;
  readonly readable: ReadableStream<Uint8Array>;
  /** Strings are sent as UTF-8. A write resolves once its bytes are sent (the guest gave credit for them). */
  readonly writable: WritableStream<Uint8Array | string>;
  /**
   * Close both directions: what was written is still sent, then the
   * guest is told that the host neither sends nor receives (its reads
   * get EOF, its writes EPIPE). Data not read yet is dropped.
   */
  close(): void;
  /** Reset now (RST): pending data is dropped, the guest's writes fail with EPIPE and its reads end. */
  reset(): void;
  /** Settles once the connection is gone: "closed" (both sides shut down) or "reset" (by either side, or the kernel exited). */
  readonly closed: Promise<"closed" | "reset">;
}
export interface VsockHostOptions {
  /** Send a packet to the guest (VsockDevice.deliver, or across to the worker). */
  send: (pkt: Uint8Array) => void;
  /** The host's receive buffer per connection, the credit the guest gets (default 256 KiB). */
  bufferSize?: number;
  log?: (msg: string) => void;
}
type ConnState = "connecting" | "established" | "closing" | "closed";
declare class Connection implements VsockConnection {
  #private;
  readonly localPort: number;
  readonly remotePort: number;
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array | string>;
  readonly closed: Promise<"closed" | "reset">;
  state: ConnState;
  /** connect(): settled by RESPONSE or RST. */
  onEstablished: ((err?: VsockError) => void) | undefined;
  constructor(host: VsockHost, localPort: number, remotePort: number, state: ConnState);
  get key(): string;
  /**
   * A snapshot keeps this connection: its credit counters, or why it
   * cannot be kept now (data or a shutdown on the way, which the guest's
   * memory and these counters would not agree on).
   */
  saveState(): VsockConnSnapshot | string;
  /** A restore: take the saved counters (the connection is established, nothing on the way). */
  loadState(s: VsockConnSnapshot): void;
  /** The fields every packet on this connection carries. */
  header(op: number, flags?: number): Omit<VsockHeader, "len">;
  /** A packet from the guest on this connection. */
  receive(h: VsockHeader, pkt: Uint8Array): void;
  close(): void;
  reset(): void;
  /** The kernel exited. */
  abort(): void;
}
declare class Listener implements VsockListener {
  #private;
  readonly port: number;
  closed: boolean;
  constructor(host: VsockHost, port: number, handler?: (conn: VsockConnection) => void);
  /** Room for one more connection? */
  get full(): boolean;
  offer(conn: Connection): void;
  accept(): Promise<VsockConnection | null>;
  [Symbol.asyncIterator](): AsyncIterator<VsockConnection>;
  close(): void;
}
/**
 * The host's end of the vsock protocol (CID 2): see the top of this file.
 * Give it the guest's packets with receive(); it sends through `send`.
 */
export declare class VsockHost implements Vsock {
  #private;
  /** The guest's CID (from the kernel's init; 3 until then). */
  guestCid: number;
  /** The credit each connection gives the guest. */
  readonly bufferSize: number;
  /** Payload per packet to the guest (the kernel's limit, once known, less the header). */
  maxPayload: number;
  stats: VsockStats;
  readonly log: (msg: string) => void;
  constructor(opts: VsockHostOptions);
  /** The kernel's driver started (VsockDevice onInit). */
  deviceReady(guestCid: number, rxMax: number): void;
  /** @internal */
  sendPacket(pkt: Uint8Array): void;
  /** @internal */
  forget(conn: Connection): void;
  /** @internal */
  unlisten(l: Listener): void;
  listen(port: number, onConnection?: (conn: VsockConnection) => void): VsockListener;
  connect(port: number, opts?: {
    timeout?: number;
  }): Promise<VsockConnection>;
  /**
   * @internal A restore (before the kernel runs): take over a connection
   * the snapshot kept, with its counters. The restored kernel keeps it
   * (VsockDevice.keep) and resets every other.
   */
  adopt(s: VsockConnSnapshot): VsockConnection;
  /** A packet from the guest. */
  receive(pkt: Uint8Array): void;
  /** The kernel exited: every connection ends (ECONNABORTED), listeners return null. */
  shutdown(reason?: string): void;
}
/**
 * The host side of each device the machine had. A key is present when the
 * device was configured; its value is null if the kernel had not started
 * its driver yet (it then starts it after the restore, as at boot).
 */
export interface DeviceSnapshots {
  display?: DisplaySnapshot | null;
  input?: InputSnapshot | null;
  sound?: SoundSnapshot | null;
  vsock?: VsockSnapshot | null;
  shm?: ShmSnapshot | null;
  /** The MAC the guest's kwnet got. */
  network?: {
    mac: number[];
  } | null;
}
/** The devices of DeviceSnapshots that a restore must find configured, or not, as saved. */
export type DeviceKind = "display" | "sound" | "vsock" | "shm" | "network";
/** A saved machine (Kernel.snapshot()). */
export interface KernelSnapshot {
  version: 1;
  /** The kernel build it came from (Kernel.fingerprint); restore refuses another. */
  fingerprint: string;
  memory64: boolean;
  /** All of the kernel's memory; the pages it reported free are zero. */
  memory: Uint8Array;
  /** Bytes of free pages left out of `memory` (0 if the kernel reported none). */
  freeBytes?: number;
  /** The guest's monotonic clock at the snapshot, in ms; a restore continues from it. */
  monotonicMs: number;
  /** rows << 16 | cols, 0 = unknown. */
  consoleSize: number;
  /** Console input the guest had not read yet. */
  input: Uint8Array;
  /** The disks, in order (/dev/wda, wdb, ...); a restore needs the same ones, unchanged. */
  disks: DiskSnapshotState[];
  /** The other devices (empty in snapshots from before devices were saved). */
  devices: DeviceSnapshots;
}
/**
 * Why a machine with the devices `present` (and the network MAC `mac`, if
 * set) cannot resume `saved`, or null if it can: the restored kernel has
 * exactly the drivers it had, so each device must be configured, or not,
 * as it was.
 */
export declare function snapshotDeviceMismatch(saved: DeviceSnapshots, present: Record<DeviceKind, boolean>, mac?: Uint8Array): string | null;
/**
 * Why `disks` cannot resume `saved` (a snapshot's disks), or null if they
 * can: the same number of disks, each with the same identity, write
 * generation and stamp. A disk that changed after the snapshot would not match the
 * restored kernel's caches (its file systems would be corrupted).
 */
export declare function snapshotDiskMismatch(saved: DiskSnapshotState[], disks: BlockDevice[]): string | null;
/**
 * Encode a snapshot: MAGIC, a u32 header length, the JSON header (everything
 * but the memory and the input), the input, then each non-zero 64 KiB chunk
 * of the memory as a u32 chunk index and its bytes. Little-endian.
 */
export declare function encodeSnapshot(s: KernelSnapshot): Uint8Array;
export declare function decodeSnapshot(bytes: Uint8Array): KernelSnapshot;
type Fd = {
  type: "stdin" | "stdout" | "stderr";
} | {
  type: "dir";
  name: Uint8Array;
  files: Map<string, Uint8Array>;
} | {
  type: "file";
  data: Uint8Array;
  pos: number;
};
interface Subscription {
  userdata: bigint;
  tag: number;
  clock?: number;
  deadline?: bigint;
  fd?: number;
}
interface PollEvent {
  userdata: bigint;
  type: number;
  error: number;
  nbytes: bigint;
}
interface WasiHostOptions {
  /** Program arguments (argv[0] first). */
  args: string[];
  /** Read-only files of the preopened "/". */
  files?: Record<string, Uint8Array>;
}
declare class WasiHost {
  k: Kernel;
  args: Uint8Array[];
  /** The last 4 KiB written to stderr (the panic message). */
  stderr: string;
  fds: Map<number, Fd>;
  buf: ArrayBuffer | null;
  dvCache: DataView | null;
  u8Cache: Uint8Array<ArrayBuffer> | null;
  /**
   * Added to performance.now() for the guest's monotonic clock (ms): a
   * restored snapshot continues from the value it was saved at.
   */
  monoOffset: number;
  /**
   * @param k  console input/output, idle wake-ups, exit
   */
  constructor(k: Kernel, { args, files }: WasiHostOptions);
  /** The guest's monotonic clock (ms). */
  monotonicMs(): number;
  clockNs(id: number): bigint;
  /** Views of the kernel's memory, rebuilt only if it grew (the old buffer is then detached). */
  views(): void;
  dv(): DataView;
  u8(): Uint8Array<ArrayBuffer>;
  /** [ptr, len] pairs of an iovec array. */
  iovecs(iovs: number, n: number): Array<[number, number]>;
  /** Bytes of console input queued in the kernel object. */
  stdinQueued(): number;
  readStdin(dst: number, want: number): number;
  /** The poll_oneoff subscriptions at `inp`. */
  subscriptions(inp: number, n: number): Subscription[];
  /** Events for the subscriptions that are ready now. */
  ready(subs: Subscription[]): PollEvent[];
  writeEvents(out: number, nevents: number, events: PollEvent[]): void;
  exit(code: number): void;
  imports(): Record<string, unknown>;
}
/**
 * The host asks the kernel to sync (ksys_sync(): write back and flush every
 * file system; WASM_IRQ_SYNC). The kernel clears the bit when it takes the
 * request.
 */
export declare const IRQ_SYNC = 4;
/**
 * How a kernel run ended: "halt" (orderly power-off/reboot: code 0 power
 * off, 1 halt, 2 restart), "panic" (code 253), "trap" (a wasm trap or JS
 * exception inside the kernel, code 254, `error` holds it), "fatal" (a host
 * runtime invariant broke, code 255) or "stopped" (Kernel.stop()).
 */
export type ExitKind = "halt" | "panic" | "trap" | "fatal" | "stopped";
export interface ExitResult {
  code: number;
  reason: string;
  kind: ExitKind;
  error?: unknown;
}
/**
 * The host side of the kwnet device, e.g. a NetStack (net.ts). Frames for
 * the guest go through Kernel.receiveFrame().
 */
export interface NetDevice {
  /** The guest's MAC address (6 bytes). */
  mac?: Uint8Array;
  /** Called once when the guest's driver initialises. */
  attach?(kernel: Kernel): void;
  /** An Ethernet frame from the guest. */
  send(frame: Uint8Array): void;
  /** Release host resources (connections, sockets). */
  close?(): void;
}
/** Detail of the "memory" boot stage. */
export interface MemoryStage {
  mib: number;
  requestedMiB: number;
  failures: string[];
  memory64: boolean;
}
export type BootStage = "memory" | "instantiate" | "start" | "exit";
export interface KernelStats {
  switches: number;
  idles: number;
  yields: number;
}
export interface KernelConfig {
  /** Compiled vmlinux (wasm64) or vmlinux32.wasm (lowered), or a bundle of either. */
  module: WebAssembly.Module;
  /** Memory type to import; default: moduleIsMemory64(module). */
  memory64?: boolean;
  /** Default 512. */
  memoryMiB?: number;
  /** Default: the module's bundled one (bundledBoot), else "". */
  cmdline?: string;
  /** Default (undefined): the module's bundled initramfs, if any; null boots without one. */
  initrd?: Uint8Array | null;
  /** Smaller sizes to try, in order, if allocating memoryMiB fails (e.g. a phone without the address space). */
  memoryFallbackMiB?: number[];
  /** Console output. */
  write: (bytes: Uint8Array) => void;
  /** Host diagnostics; default console.error. */
  log?: (msg: string) => void;
  /**
   * Boot progress: "memory" (MemoryStage), "instantiate", "start" (kernel
   * entry), "exit" (ExitResult).
   */
  onStage?: (stage: BootStage, detail?: MemoryStage | ExitResult) => void;
  /** kwblk disks: /dev/wda, wdb, ... */
  disks?: BlockDevice[];
  /** kwnet device; without one the guest has no network interface. */
  net?: NetDevice;
  /**
   * Offer a display (kwfb, /dev/fb0; display.ts): true (640x480), a size,
   * or a function returning the size wanted when a program first opens
   * it. Default false: the guest has no framebuffer device.
   */
  display?: DisplayOption;
  /** A guest program opened the display (its mode), or the last one closed it (null). */
  onDisplay?: (mode: DisplayMode | null) => void;
  /**
   * With a display, the guest also gets a keyboard and a mouse (kwinput,
   * evdev). Called when some program opens or the last one closes them.
   */
  onInput?: (state: InputState) => void;
  /** Offer a sound card (kwsnd: ALSA playback, sound.ts) and where its PCM goes. Default false: none. */
  sound?: SoundOption;
  /**
   * Offer a vsock device (kwvsock: AF_VSOCK, guest CID 3, host CID 2;
   * vsock.ts). Default false: the kernel registers no transport. The
   * guest's packets go to onVsockPacket; Kernel.vsock.deliver() sends.
   */
  vsock?: boolean;
  /** A packet from the guest's kwvsock (header and payload; a copy). */
  onVsockPacket?: (pkt: Uint8Array) => void;
  /** kwvsock started: the guest's CID and the largest packet it takes (header and payload). */
  onVsockInit?: (guestCid: number, rxMax: number) => void;
  /**
   * Offer kwshm (shm.ts): the host reads and writes guest shmem files in
   * place. Default false: the kernel registers nothing.
   */
  shm?: boolean;
  /**
   * Offer kwemu's JIT tier (hot guest code compiled to WebAssembly; see
   * jit.ts). Default true; false makes kwemu interpret everything. A
   * kernel built without the tier ignores it.
   */
  jit?: boolean;
  /**
   * Resume this snapshot (snapshot()) instead of booting: same kernel
   * build, memory size and type. initrd and cmdline are ignored. `disks`
   * must be the snapshot's, unchanged (snapshotDiskMismatch); boot()
   * rejects otherwise.
   */
  restore?: KernelSnapshot;
  /**
   * CPUs to offer an SMP kernel (CONFIG_SMP), each one more instance of
   * the module in its own thread (spawnCpu). Default 1. A UP kernel
   * ignores it (with a log line). Each CPU's kwemu has its own JIT
   * tier (jit applies to all).
   */
  cpus?: number;
  /** Start a secondary CPU's thread (Platform.spawnCpu); without it an SMP kernel gets one CPU. */
  spawnCpu?: (init: CpuInit) => CpuEndpoint;
  /** Why spawnCpu cannot work on this thread (Platform.whyNoCpus), checked once; a reason gives an SMP kernel one CPU. */
  whyNoCpus?: () => string | undefined;
  /**
   * With more than one CPU: the console ring (console-ring.ts) another
   * thread reads (worker mode's owner), so `write` is not called for
   * console output. Without it this host reads a ring of its own and
   * calls `write`.
   */
  consoleRing?: SharedArrayBuffer;
  /**
   * When this host reads the ring: called after console output was
   * written from inside the kernel's clock import (the kernel runs on), so
   * that a host which batches `write` until the kernel suspends can send it
   * now (worker mode with the messages transport).
   */
  flushOutput?: () => void;
}
/**
 * Does this kernel module import a 64-bit (memory64) memory?
 *
 * The kernel comes in two builds of the same code: vmlinux (wasm64:
 * memory64 + table64) and vmlinux32.wasm, the same module after Binaryen's
 * --memory64-lowering. The lowered one keeps i64 pointers in code and at the
 * JS boundary but has a 32-bit memory and table, so it runs on engines
 * without memory64 (WebKit). The JS API does not reflect an import's memory
 * type, so this reads the linker's "target_features" section (Binaryen drops
 * "memory64" from it when lowering). Without that section it guesses wasm64;
 * boot() retries with the other memory type if instantiation fails.
 */
export declare function moduleIsMemory64(module: WebAssembly.Module): boolean;
/**
 * The root file system, command line and data disk template bundled into
 * the module by kernel/tools/bundle.mjs (custom sections "unkernel.initrd",
 * "unkernel.cmdline" and "unkernel.datadisk"), or undefined for each that
 * is absent. datadisk is a gzipped kwsparse image (kwsparse.ts).
 */
export declare function bundledBoot(module: WebAssembly.Module): {
  initrd?: Uint8Array;
  cmdline?: string;
  datadisk?: Uint8Array;
};
type Resolver = (task: bigint) => void;
/**
 * A host side that cannot get the event loop while the kernel runs (worker
 * mode's shared transport, worker-shared.ts) and looks for its events in
 * the WASI clock instead, which the kernel reads at the end of every slice
 * and before it reads wasm_host_irqs. None of these may suspend.
 */
interface KernelPoller {
  /** Every monotonic clock_time_get: cheap when nothing is new. */
  poll(): void;
  /** poll_oneoff is about to wait: true if events arrived (handled; do not wait). */
  idle(): boolean;
  /** That wait ended. */
  awake(): void;
}
/**
 * One kernel instance. boot() resolves with an ExitResult when the kernel
 * halts, panics, traps, hits a host invariant or is stopped.
 */
export declare class Kernel {
  opts: KernelConfig;
  log: (msg: string) => void;
  /** Pending console input chunks. */
  input: Uint8Array[];
  inputOffset: number;
  /** rows << 16 | cols, 0 = unknown (setConsoleSize). */
  consoleSize: number;
  /** resolve() of the current wasm_idle promise. */
  idleWake: (() => void) | null;
  /** task -> resolve(lastTask) */
  resumers: Map<bigint, Resolver>;
  onStage: (stage: BootStage, detail?: MemoryStage | ExitResult) => void;
  /** Settles with the first exit (halt, panic, trap, fatal, stop). */
  exited: Promise<ExitResult>;
  /** Record the exit (the first one wins). */
  exit: (res: ExitResult) => void;
  /** The exit, once there is one. */
  result: ExitResult | undefined;
  stats: KernelStats;
  block: BlockHost;
  /** kwemu's JIT host (kw_host_jit_* imports); counters in jit.stats. */
  jit: JitHost;
  netRx: Uint8Array[];
  /** kwfb's host side: where the guest's pixels are, if anywhere. */
  display: DisplayHost;
  /** kwinput's host side (evdev keyboard and mouse): the event queue and whether a program reads it. */
  evdev: InputHost;
  /** kwsnd's host side (sound.ts): the playback state and the sink. */
  sound: SoundHost;
  /** kwvsock's host side (vsock.ts): the packet queues; the protocol is VsockHost's. */
  vsock: VsockDevice;
  /** kwshm's host side (shm.ts): requests, page lists and copies; the API is ShmClient's. */
  shm: ShmDevice;
  memory: WebAssembly.Memory;
  memory64: boolean;
  /** The module imports a shared memory (a kernel linked with --shared-memory). */
  sharedMemory: boolean;
  wasi: WasiHost;
  exports: WebAssembly.Exports | undefined;
  /** Address of wasm_host_irqs, once instantiated. */
  irqAddr: number | undefined;
  retFromFork: (prev: bigint, next: bigint) => Promise<unknown>;
  /** performance.now() at kernel entry. */
  bootTime: number;
  /** Polled from the clock import, if set (KernelPoller). */
  poller: KernelPoller | null;
  /** The kernel build: its linux_banner (compile time and build number), once instantiated. */
  fingerprint: string;
  /** The MAC kwnet got (wasm_driver_net_init), once the guest's driver started; null before or without a network. */
  netMac: Uint8Array | null;
  /** The snapshot() in progress. */
  snapshotWaiter: {
    resolve: (s: KernelSnapshot) => void;
    reject: (e: Error) => void;
    stop: boolean;
  } | null;
  /** CPUs offered to the kernel (1 unless an SMP kernel and KernelConfig.cpus > 1). */
  cpus: number;
  /** The other CPUs' threads, once started. */
  secondaries: CpuEndpoint[];
  /** Their JIT hosts' counters (CpuInit.jitMirror), in the order they started. */
  jitMirrors: Float64Array[];
  /** With more than one CPU: the console ring every CPU writes (console-ring.ts). */
  conRing: ConsoleRing | null;
  /** What a full ring makes a CPU do: "wait" when another thread reads it, else this host reads it. */
  conFull: ConsoleFull;
  /** This host reads the ring (no KernelConfig.consoleRing): batches in order (cpu.ts). */
  conReader: ConsoleRingReader | null;
  consoleOrder: ConsoleOrder | null;
  /** Ring bytes dropped that were reported. */
  conDropped: number;
  constructor(opts: KernelConfig);
  /** Queue an Ethernet frame for the guest's kwnet device. */
  receiveFrame(frame: Uint8Array): void;
  /** Set a host IRQ bit in wasm_host_irqs (once instantiated) and wake the kernel. */
  raiseIrq(bit: number): void;
  /**
   * OR `bits` into wasm_host_irqs (once instantiated); with a shared
   * memory atomically, since other CPUs set IPI bits there too.
   */
  setIrqBits(bits: number): void;
  /** Clear `bits` in wasm_host_irqs, as setIrqBits() sets them. */
  clearIrqBits(bits: number): void;
  /**
   * With other CPUs running, an idle wait also ends when wasm_host_irqs
   * changes from 0 (an IPI: the sender notifies). Calls `done` once that
   * happens, at once if it already did, or after `timeoutMs`.
   */
  watchIrqWord(done: () => void, timeoutMs: number): void;
  /** JIT counters per CPU (CPU 0 first; the others as their hosts last mirrored them). */
  jitStatsPerCpu(): JitStats[];
  /** All CPUs' JIT counters together. */
  jitStatsAll(): JitStats;
  /** kwemu's counters per CPU (-Dkwemu-stats kernels; undefined for a CPU that has compiled nothing). */
  kwemuStatsPerCpu(): (KwemuStats | undefined)[];
  /** wasm_cpu_start(cpu, idle): start a secondary CPU's thread. */
  startCpu(cpu: number, idle: bigint): number;
  /**
   * Console output of CPU 0 (fd_write 1): mem[p, p + len). With other
   * CPUs, into the ring, behind what they wrote before. Where this host
   * reads the ring, its write goes out at once as on one CPU: directly
   * when nothing another CPU wrote waits (the ring is empty and no batch
   * is on its way: a write that reserves after this look overlaps this
   * one), else through the ring, which it then empties.
   */
  consoleWrite(mem: Uint8Array, p: number, len: number): void;
  /**
   * More than one CPU: set up the console ring. Read by another thread
   * (KernelConfig.consoleRing): CPU 0 waits like the others when it is
   * full. Read here: a reader loop for the idle times, a take after each
   * of CPU 0's writes, and one in every clock read (the poller) at most
   * every POLL_MS unless the ring fills; CPU 0 also takes the records out
   * itself when it is full.
   */
  initConsoleRing(): void;
  /** A batch this host took out of the ring (or one another CPU posted, "out"): in order. */
  conDeliver: (b: {
    seq: number;
    bytes: Uint8Array;
  }) => void;
  /** At exit (`end`) or before a suspension: take what the ring holds (when this host reads it). */
  consoleFlush(end?: boolean): void;
  onCpuMessage(m: CpuMessage): void;
  netImports(): Record<string, unknown>;
  u8(): Uint8Array;
  dv(): DataView;
  cstr(ptr: number | bigint, max?: number): string;
  fatal(msg: string): void;
  /**
   * Stop the kernel for good. The exit is recorded at once (exited
   * settles with it); the kernel itself parks at its next suspension
   * point (an idle wait, a periodic yield or a task switch, at most about
   * 20 ms of guest work away) and never runs again. There is no clean
   * shutdown: the guest is not told, so unflushed disk writes are lost.
   */
  stop(res?: Partial<ExitResult>): void;
  /** Feed console input (bytes or string). */
  sendInput(data: Uint8Array | string): void;
  /**
   * Set the console window size (the guest tty's rows and columns). hvc_wasm
   * picks it up on its next input poll, which the console IRQ triggers;
   * the foreground process gets SIGWINCH.
   */
  setConsoleSize(cols: number, rows: number): void;
  /**
   * Ask the kernel to sync (IRQ_SYNC) and wait until every persistent disk
   * (BlockDevice.persistent, with flushSeq and whenFlushed) has completed a
   * flush issued after this call, i.e. one whose save started after it.
   * Resolves true then, or false after `timeout` ms; on a timeout the bit
   * is cleared here, since a kernel without IRQ_SYNC support never clears
   * it. Resolves true at once when no disk is persistent.
   */
  requestSync({ timeout }?: {
    timeout?: number;
  }): Promise<boolean>;
  /**
   * Save the machine: the kernel parks every task (arch/wasm/kernel/
   * park.c) and, at the point where all its state is in memory, the host
   * copies the memory and seals the disks (BlockDevice.snapshotSeal: their
   * content becomes durable and the snapshot records their identity and
   * write generation; disks are not copied). Resolves once the disks are
   * durable. Without `stop` the guest keeps running, and its next write
   * to a disk makes the snapshot unrestorable with that disk (a restore
   * refuses it); with `stop: true` the kernel never runs again after the
   * copy (exit kind "stopped"), so the disks stay as saved. Rejects if a
   * task does not park within 2 s (the error names it), if I/O is in
   * flight, if a disk cannot be part of a snapshot (one without
   * snapshotSeal, or an overlay kept only in memory that was written), or
   * if shm requests are waiting for the kernel. The other devices keep
   * their host side's state (DeviceSnapshots); vsock connections and the
   * network's TCP connections do not survive a restore (the guest's get
   * reset), except the 9p sessions of host file systems, which the vsock
   * device saves (VsockDevice.onSave; a request in flight on one makes
   * the snapshot point busy, VsockDevice.blocker()).
   */
  snapshot({ stop }?: {
    stop?: boolean;
  }): Promise<KernelSnapshot>;
  /** Put a snapshot into the fresh instance's memory (boot(), KernelConfig.restore). */
  loadSnapshot(s: KernelSnapshot): void;
  /** Which devices this machine has, as a snapshot records them (DeviceSnapshots keys). */
  devicesPresent(): Record<"display" | "sound" | "vsock" | "shm" | "network", boolean>;
  /** The host side of each configured device, at the snapshot point (null: its driver had not started). */
  saveDevices(): DeviceSnapshots;
  /**
   * Give each device's host side the state the kernel told the old one
   * (loadSnapshot, after the memory is in and the IRQ bits are cleared);
   * the restored kernel does not tell it again.
   */
  restoreDevices(d: DeviceSnapshots): void;
  /** wasm_snapshot_point: the end of a snapshot cycle (see snapshot()). */
  snapshotPoint(result: number, blocker: bigint, freeMap?: bigint, freeBits?: bigint): number;
  wake(): void;
  imports(): WebAssembly.Imports;
  onTrap(e: unknown): void;
  /** A fixed-size memory of `pages` 64 KiB pages, 64-bit (BigInt sizes) or 32-bit, shared or not. */
  static newMemory(pages: number, memory64: boolean, shared?: boolean): WebAssembly.Memory;
  /**
   * Allocate the kernel's memory (fixed size: the kernel sizes RAM from it
   * once at boot). Tries memoryMiB, then each of opts.memoryFallbackMiB.
   * The maximum equals the initial size so engines reserve no more address
   * space than needed.
   */
  allocateMemory(memoryMiB: number, initrdBytes: number): WebAssembly.Memory;
  /**
   * Instantiate and boot. Resolves with the ExitResult when the kernel
   * halts; rejects if it cannot start (memory, instantiation, initrd size).
   */
  boot(): Promise<ExitResult>;
}
export declare const KWSPARSE_MAGIC = "KWSPARS1";
/** A decoded kwsparse image: indices[i] is the disk block whose content is block(i). */
export interface KwsparseImage {
  size: number;
  blockSize: number;
  indices: number[];
  /** The block data, all blocks back to back. */
  data: Uint8Array;
  block(i: number): Uint8Array;
  /** Block index -> data (views into `data`). */
  map(): Map<number, Uint8Array>;
}
/** All bytes zero? */
export declare function isZeroBlock(b: Uint8Array): boolean;
/** The header of a kwsparse image holding the given block indices (ascending). */
export declare function kwsparseHeader(size: number, blockSize: number, indices: readonly number[]): Uint8Array;
/**
 * Encode blocks into one (uncompressed) kwsparse image. `blocks` are
 * [index, data] pairs in any order; all-zero blocks are dropped.
 */
export declare function encodeKwsparse({ size, blockSize, blocks }: {
  size: number;
  blockSize?: number;
  blocks: Iterable<[number, Uint8Array]>;
}): Uint8Array;
/** Parse an uncompressed kwsparse image (see gunzipIfNeeded). The result views `bytes`. */
export declare function decodeKwsparse(bytes: Uint8Array | ArrayBuffer): KwsparseImage;
/** Gunzip (DecompressionStream: browsers and Node) if the bytes are gzip. */
export declare function gunzipIfNeeded(bytes: Uint8Array | ArrayBuffer): Promise<Uint8Array>;
/** Decode a kwsparse image, gzipped or not. */
export declare function readKwsparse(bytes: Uint8Array | ArrayBuffer): Promise<KwsparseImage>;
/**
 * gzip parts (e.g. CowDisk.exportParts()) with CompressionStream into a
 * Blob. The output is not byte-for-byte reproducible across engines; the
 * build tool uses zlib for that.
 */
export declare function gzipBlob(parts: BlobPart[]): Promise<Blob>;
export declare const F_RO = 1, F_FLUSH = 2, F_DISCARD = 4, F_WRITE_ZEROES = 8;
/** A result that is either ready now or arrives later. */
export type MaybePromise<T> = T | Promise<T>;
/**
 * A kwblk disk (/dev/wda, wdb, ... in the order given). Byte offsets and
 * sizes; `views` are subarrays of the kernel's memory to fill (read) or
 * take the data from (write). A method either completes synchronously or
 * returns a promise. It must not touch the views after that promise
 * settles.
 */
export interface BlockDevice {
  /** Size in bytes (a multiple of 512). */
  size: number;
  /** F_FLUSH | F_DISCARD | F_WRITE_ZEROES | F_RO. */
  flags?: number;
  readOnly?: boolean;
  /** Logical block size, default 512. */
  blockSize?: number;
  read(off: number, views: Uint8Array[]): MaybePromise<void>;
  write(off: number, views: Uint8Array[]): MaybePromise<unknown>;
  flush?(): MaybePromise<unknown>;
  discard?(off: number, len: number): MaybePromise<unknown>;
  writeZeroes?(off: number, len: number): MaybePromise<unknown>;
  /**
   * Flushes reach storage that outlives the host process or page (a file,
   * IndexedDB). Kernel.requestSync() waits only for such disks, which must
   * also provide flushSeq and whenFlushed.
   */
  readonly persistent?: boolean;
  /** Number of flushes issued so far (see FlushTracker). */
  readonly flushSeq?: number;
  /** Resolves once a flush issued after the `after`-th one has completed successfully. */
  whenFlushed?(after: number): Promise<void>;
  /** A save in flight, if any (CowDisk): requestSync() waits for it when the kernel is not running. */
  readonly saving?: Promise<void> | null;
  /**
   * Snapshot support: which disk this is and its write generation now.
   * Throws if the disk cannot be part of a snapshot (its writes live only
   * in this process's memory). A disk without it cannot be in a snapshot.
   */
  snapshotState?(): DiskSnapshotState;
  /**
   * At a snapshot's consistent point (the kernel parked, no request in
   * flight; synchronous): make the current content durable and return
   * its state. `done` settles when it is durable (a failure fails the
   * snapshot). The next write starts a new generation.
   */
  snapshotSeal?(): {
    state: DiskSnapshotState;
    done: Promise<void>;
  };
}
/** What a snapshot records about a disk (BlockDevice.snapshotState). */
export interface DiskSnapshotState {
  /** For messages: a path or a store name. */
  name: string;
  /** Which disk: stays the same across processes for the same content source. */
  identity: string;
  /** Write generation: differs whenever the content may differ. */
  gen: number;
  /** What changes when another program writes the disk (a file's size and mtime), if known. */
  stamp?: string;
}
/** Block I/O counters of one kernel (Kernel.block.stats). */
export interface BlockStats {
  reads: number;
  writes: number;
  flushes: number;
  discards: number;
  async: number;
  bytesRead: number;
  bytesWritten: number;
}
declare class BlockHost {
  k: Kernel;
  disks: BlockDevice[];
  /** Completed async requests (BigInt pointers). */
  done: bigint[];
  inflight: number;
  stats: BlockStats;
  /**
   * @param kernel  the Kernel (needs dv(), u8(), irqAddr, wake(), log)
   * @param disks  backends; index i becomes /dev/wd('a'+i)
   */
  constructor(kernel: Kernel, disks?: BlockDevice[]);
  imports(): Record<string, unknown>;
  submit(reqPtr: bigint): number;
  raise(): void;
}
/**
 * Counts flushes: flushSeq is the number of flushes issued, and
 * whenFlushed(n) resolves once a flush issued after the n-th one has
 * completed successfully. Flushes of one disk complete in order.
 */
export declare class FlushTracker {
  flushSeq: number;
  flushedSeq: number;
  waiters: Array<{
    after: number;
    resolve: () => void;
  }>;
  /** A flush starts: its sequence number. */
  begin(): number;
  /** Flush `seq` completed successfully. */
  done(seq: number): void;
  whenFlushed(after: number): Promise<void>;
}
/** Overlay value of a block that reads as zeros (stored as an empty record). */
export declare const ZERO_BLOCK: Uint8Array;
/** A read-only disk image: the base of a CowDisk. */
export interface DiskBase {
  size: number;
  /** Identifies the image's content (e.g. URL + size + ETag); a store refuses or drops an overlay saved for another one. */
  identity?: string;
  /** The base reads as all zeros (ZeroBase): discarding a block deletes its record instead of storing zeros. */
  zero?: boolean;
  /** Block indices with content, ascending (SparseBase; used by exportParts). */
  keys?(): number[];
  read(off: number, len: number): MaybePromise<Uint8Array>;
}
/** What OverlayStore.open() found. */
export interface StoreIndex {
  /** Block numbers that have a record. */
  keys: Set<number>;
  /** The store was seeded (a data disk, see web/disk.ts). */
  initialized: boolean;
  /** The store belongs to this other identity and was left alone ("refuse", or a read-only open). */
  mismatch?: string;
  /** The store belonged to this other identity and was cleared ("clear"). */
  cleared?: string;
  /** The write generation saved with the blocks (save()'s `meta`), if the store keeps one. */
  gen?: number;
  /** A random id the store chose when it was created, seeded or cleared, if it keeps one. */
  uid?: string;
}
/**
 * Persistence for a CowDisk overlay: records of 4 KiB blocks by index, an
 * empty record for a block that reads as zeros. IdbStore (web/disk.ts) is
 * the IndexedDB one. Every save must be atomic (one transaction), so the
 * stored state is always the state after some complete flush.
 */
export interface OverlayStore {
  /** e.g. "kwdisk:alpine", for messages. */
  readonly name?: string;
  /** Read the index (block numbers, not data). onMismatch: what to do with a store of another identity (default "refuse"). */
  open(identity: string, opts?: {
    onMismatch?: "clear" | "refuse";
    write?: boolean;
  }): Promise<StoreIndex>;
  /** The records of these blocks (absent ones are missing from the map). */
  getBlocks(blocks: number[]): Promise<Map<number, Uint8Array>>;
  /** One atomic transaction: put these records, delete those, and record `meta.gen` (the disk's write generation) if given. */
  save(puts: Array<[number, Uint8Array]>, dels: number[], meta?: {
    gen: number;
  }): Promise<void>;
  /** Delete everything. */
  clear(): Promise<void>;
  close?(): Promise<void>;
}
/** A base that reads as zeros (the data disk: its content is all in the store). */
export declare class ZeroBase implements DiskBase {
  size: number;
  readonly zero = true;
  identity: string;
  constructor(size: number);
  read(_off: number, len: number): Uint8Array;
}
/** A base made of a few non-zero 4 KiB blocks (a decoded kwsparse image, or a Map). */
export declare class SparseBase implements DiskBase {
  size: number;
  blocks: Map<number, Uint8Array>;
  identity: string;
  constructor(size: number, blocks: Map<number, Uint8Array>);
  static fromKwsparse(img: KwsparseImage): SparseBase;
  read(off: number, len: number): Uint8Array;
  keys(): number[];
}
export interface CowDiskOptions {
  /** Persistence for the overlay (loaded lazily after open()). */
  store?: OverlayStore | null;
  /** Host diagnostics; default console.warn. */
  log?: (msg: string) => void;
  /** A save failed (e.g. QuotaExceededError); the flush fails with EIO too. */
  onError?: (err: unknown) => void;
}
export interface CowDiskStats {
  /** Store read requests and the blocks they asked for (readahead included). */
  storeReads: number;
  storeBlocksRead: number;
  /** Blocks fetched ahead of a read, and reads served from them. */
  aheadBlocks: number;
  aheadHits: number;
  /** Committed saves, blocks put and records deleted by them. */
  saves: number;
  blocksSaved: number;
  blocksDeleted: number;
  /** Partial writes of blocks not in memory (read-modify-write). */
  rmw: number;
  saveErrors: number;
}
/**
 * Copy-on-write overlay over a read-only base, optionally persisted.
 *
 * Invariants, per block b:
 *   mem.has(b)     the newest content is in memory (always so without a
 *                  store; with one: written since the last committed save of b)
 *   stored.has(b)  the store has a record for b (used when !mem.has(b))
 *   otherwise      the base has the content.
 * A buffer handed to an in-flight save is frozen: a write copies it first,
 * so the save sees exactly what it was given. A block leaves memory only
 * when the save transaction that contains it has committed and it was not
 * written again meanwhile.
 */
export declare class CowDisk implements BlockDevice {
  #private;
  base: DiskBase;
  size: number;
  flags: number;
  store: OverlayStore | null;
  log: (msg: string) => void;
  onError: ((err: unknown) => void) | null;
  /** Block -> Uint8Array(4096) | ZERO_BLOCK. */
  mem: Map<number, Uint8Array>;
  /** Blocks with a record in the store. */
  stored: Set<number>;
  /** Blocks in mem not yet handed to a save. */
  dirty: Set<number>;
  /** Buffers an in-flight save holds. */
  frozen: WeakSet<Uint8Array>;
  /** Block -> store read in flight. */
  loading: Map<number, Promise<Uint8Array>>;
  /**
   * Readahead: store records fetched with a read that missed, for the
   * blocks after it. A read of one consumes it, a write drops it (so it
   * always equals the store's record). Each store read is one transaction,
   * and the guest often reads metadata one block at a time (ext4 reads its
   * orphan file, 256 blocks, that way at every mount); in WebKit every
   * IndexedDB transaction is a round trip to another process.
   */
  ahead: Map<number, Uint8Array>;
  /** Blocks being fetched ahead; a write removes them, so a stale fetch is not kept. */
  aheadPending: Set<number>;
  /** Block -> tail of the asynchronous writes on it. */
  busy: Map<number, Promise<void>>;
  /** The last flush in flight (flushes are chained). */
  saving: Promise<void> | null;
  /** detach(): flushes no longer reach the store. */
  saveDisabled: boolean;
  flushes: FlushTracker;
  stats: CowDiskStats;
  /** Set by openDataDisk: why this disk is not the persistent one (another tab, a format mismatch). */
  notice?: string;
  /** Set by openDataDisk: the store was created from the template in this session. */
  seeded: boolean;
  /** Set by openDataDisk: the store's identity. */
  identity?: string;
  /** Write generation (snapshotState): bumped by the first write after open() and after each snapshotSeal(). */
  gen: number;
  /** The generation the store has (StoreIndex.gen, then each committed save). */
  storedGen: number;
  /** From the store: its id (StoreIndex.uid) and identity. */
  storeUid?: string;
  storeIdentity?: string;
  constructor(base: DiskBase, { store, log, onError }?: CowDiskOptions);
  /**
   * Load the store's index (block numbers only, not the data). A store
   * saved for another base identity is cleared with onMismatch "clear"
   * (the store logs it), or makes this throw a StoreMismatchError.
   */
  open({ onMismatch }?: {
    onMismatch?: "clear" | "refuse";
  }): Promise<this>;
  /** Take what the store's open() found (openDataDisk opens the store itself). */
  adoptStore(st: StoreIndex, identity: string): void;
  /** Is every flush saved somewhere that outlives the page (a store that is attached)? */
  get persistent(): boolean;
  get flushSeq(): number;
  whenFlushed(after: number): Promise<void>;
  /** Number of blocks that differ from the base (stored or in memory). */
  get overlayBlocks(): number;
  /** Bytes of block data held in memory. */
  get memBytes(): number;
  read(off: number, views: Uint8Array[]): MaybePromise<void>;
  static readonly RA_MIN = 8;
  static readonly RA_MAX = 128;
  /** Most blocks kept ahead (4 MiB); the oldest go first. */
  static readonly AHEAD_MAX = 1024;
  write(off: number, views: Uint8Array[]): MaybePromise<unknown>;
  discard(off: number, len: number): MaybePromise<unknown>;
  writeZeroes(off: number, len: number): MaybePromise<unknown>;
  /**
   * Save every block written so far in one store transaction; the flush
   * completes when it has committed. Flushes are chained: one issued while
   * a save is in flight waits for it (even with nothing new to save). On a
   * failed save the blocks are dirty again (the next flush retries them)
   * and the flush fails (EIO in the guest).
   */
  flush(): MaybePromise<unknown>;
  snapshotState(): DiskSnapshotState;
  /**
   * Take the dirty blocks now (no request is in flight, so no flush is
   * queued) and save them with the current generation; later writes go
   * to the next generation and later saves.
   */
  snapshotSeal(): {
    state: DiskSnapshotState;
    done: Promise<void>;
  };
  /** Stop saving to the store (before replacing or clearing it); the running kernel's further writes stay in memory. */
  detach(): void;
  /** Drop all local changes (memory and persisted). Only while the kernel is not running. */
  reset(): Promise<void>;
  /**
   * The disk's current content as a kwsparse image (uncompressed), in
   * parts (Blobs, so a browser can keep large exports out of the JS heap;
   * gzipBlob() compresses them). Reads the store in batches. The base must
   * be a ZeroBase or a SparseBase.
   */
  exportParts({ batch }?: {
    batch?: number;
  }): Promise<{
    size: number;
    blocks: number;
    parts: BlobPart[];
  }>;
}
export interface HttpBaseOptions {
  /** Fetch granularity (power of two), default 256 KiB. */
  chunkSize?: number;
  /** Largest single Range request, default 4 MiB. */
  maxRequest?: number;
}
export declare class HttpBase implements DiskBase {
  #private;
  url: string;
  size: number;
  identity: string;
  chunkSize: number;
  maxChunks: number;
  /** Chunk index -> data. */
  chunks: Map<number, Uint8Array>;
  /** Chunk index -> fetch in flight. */
  pending: Map<number, Promise<void>>;
  stats: {
    requests: number;
    bytes: number;
  };
  static open(url: string, { chunkSize, maxRequest }?: HttpBaseOptions): Promise<HttpBase>;
  read(off: number, len: number): MaybePromise<Uint8Array>;
}
/** The guest server's vsock port (kernel/guest/kwtty.c KWTTY_PORT). Privileged, so no unprivileged guest program can take it. */
export declare const TTY_PORT = 1022;
/** The protocol version this client speaks (OPEN's max_version). */
export declare const TTY_VERSION = 1;
/** OPENED feature bit: the guest has PIPES, EOF and STDERR. */
export declare const TTY_FEATURE_PIPES = 1;
/** OPENED feature bit: the guest has CONNECT (connectGuest()). */
export declare const TTY_FEATURE_CONNECT = 2;
/** The signals kill() can send (kwtty.c has the same list). */
export declare const TTY_SIGNALS: readonly ["HUP", "INT", "QUIT", "ILL", "TRAP", "ABRT", "BUS", "FPE", "KILL", "USR1", "SEGV", "USR2", "PIPE", "ALRM", "TERM", "CHLD", "CONT", "STOP", "TSTP", "TTIN", "TTOU", "URG", "XCPU", "XFSZ", "VTALRM", "PROF", "WINCH", "IO", "PWR", "SYS"];
export type PtyErrorCode =
/** No guest server answered within the timeout (or no OPENED came). */
"ETIMEDOUT" |
/** A malformed frame, an unknown critical frame, or a version the client does not speak. */
"EPROTO" |
/** The guest sent ERROR; the message is the guest's (a failed exec or chdir; a guest without PIPES refuses `pty: false`, one without CONNECT refuses connectGuest()). */
"EREMOTE" |
/** connectGuest(): nothing listens on that TCP port on the guest's 127.0.0.1. */
"ECONNREFUSED" |
/** The signal was aborted while opening (or, for exec(), while the program ran: it is killed). */
"ABORTED" |
/** The connection ended before OPENED (or, for exec(), before EXIT). */
"ECONNRESET" |
/** The kernel exited. */
"ECONNABORTED" |
/** write() after the session ended, or the connection failed under it. */
"EPIPE" |
/** spawn(), exec() or connect() on an instance created with `vsock: false`. */
"ENODEV" |
/** exec(): stdout or stderr went over `maxBuffer` (the program is killed). */
"ENOBUFS";
/** Why a pty could not be spawned, or failed. */
export declare class PtyError extends Error {
  readonly code: PtyErrorCode;
  constructor(code: PtyErrorCode, message: string, cause?: unknown);
}
/** A window size; pixels are 0 when unknown. */
export interface PtySize {
  cols: number;
  rows: number;
  xpixel?: number;
  ypixel?: number;
}
/** What spawn() on a pty, spawn() on pipes and exec() take. */
export interface SpawnOptions {
  /** The program's working directory. Default root's home. */
  cwd?: string;
  /** Extra environment, applied after the defaults (HOME, USER, LOGNAME, SHELL, PATH, and TERM on a pty), so it may override them. */
  env?: Record<string, string>;
  /** The guest server's port. Default TTY_PORT (1022). */
  port?: number;
  /** How long to wait for the guest server, in ms: connect retries (it may not be up yet) and the handshake together. Default 30000. */
  timeout?: number;
  /** Aborts spawning (PtyError ABORTED). It has no effect once the program runs, except in exec(). */
  signal?: AbortSignal;
}
export interface PtyOptions extends SpawnOptions, Partial<PtySize> {
  /** On a pty (the default). */
  pty?: true;
  /** Default 80 columns by 24 rows. */
  cols?: number;
  rows?: number;
  /** TERM for the program (printable ASCII, at most 64 bytes). Default "xterm-256color". */
  term?: string;
}
/** spawn() on pipes: stdin, stdout and stderr are pipes, with no pty (and no TERM unless `env` sets it). */
export interface PipeOptions extends SpawnOptions {
  pty: false;
}
export interface ExecOptions extends SpawnOptions {
  /** Bytes for stdin (strings are UTF-8), then EOF. Default: EOF at once. */
  input?: Uint8Array | string;
  /** "utf8" (the default): stdout and stderr as strings; "buffer": as bytes. */
  encoding?: "utf8" | "buffer";
  /** The most bytes stdout and stderr may hold, each; beyond it the program gets SIGKILL and exec() rejects with ENOBUFS. Default 64 MiB. */
  maxBuffer?: number;
  /** Also aborts the run: the program gets SIGKILL and exec() rejects with ABORTED. */
  signal?: AbortSignal;
}
/** How exec()'s program ended, and what it printed. */
export interface ExecResult<T extends string | Uint8Array = string> {
  stdout: T;
  stderr: T;
  /** The exit status, or null when a signal ended the program. */
  exitCode: number | null;
  /** The signal's number in the guest, or null when the program exited. */
  signal: number | null;
}
export type PtyEnd =
/** The program exited with `code`. */
{
  type: "exit";
  code: number;
} |
/** The program was killed by `signal` (its number in the guest). */
{
  type: "signal";
  signal: number;
  coreDumped: boolean;
} |
/** The host called close(). */
{
  type: "closed";
} |
/** EOF or a reset without EXIT, or the kernel exited. */
{
  type: "lost";
};
export interface Pty extends AsyncDisposable {
  /** The program's pid in the guest. */
  readonly pid: number;
  /** The pty's number: the program's terminal is /dev/pts/<pts>. */
  readonly pts: number;
  /** The size last set (spawn options, then resize()). */
  readonly cols: number;
  readonly rows: number;
  /** The exit status once `ended` settled with an exit, else null. */
  readonly exitCode: number | null;
  /** The protocol version both sides agreed on. */
  readonly version: number;
  /** The guest's feature bits (TTY_FEATURE_PIPES). */
  readonly features: number;
  /**
   * What the pty prints. A pull stream: vsock credit follows what is read,
   * so keep reading, or the guest program blocks once the window is full.
   * It ends after EXIT, close() or a lost connection, and errors with the
   * PtyError that `ended` rejects with. Cancelling it discards the
   * rest, so `ended` still settles.
   */
  readonly output: ReadableStream<Uint8Array>;
  /** Type into the pty. Strings are UTF-8. Split into DATA frames of at most 4096 bytes; resolves once they are sent. */
  write(data: Uint8Array | string): Promise<void>;
  /** Set the window size (the foreground process gets SIGWINCH). Ordered with write(). */
  resize(cols: number, rows: number, xpixel?: number, ypixel?: number): void;
  /**
   * Send a signal to the program ("SIGTERM" or "TERM"; default SIGHUP).
   * `ended` then reports how it ended. Ordered with write(); a no-op once
   * the pty has ended. Throws a RangeError for an unknown name.
   */
  kill(signal?: string): void;
  /** Hang up (the session gets SIGHUP): closes the connection both ways. Resolves once the connection is gone. */
  close(): Promise<void>;
  /**
   * How the session ended. Settles once `output` has been read up to the
   * end (EXIT comes behind the shell's last output), or at close().
   * Rejects with a PtyError (EREMOTE, EPROTO) if the session failed.
   */
  readonly ended: Promise<PtyEnd>;
  /** `await using`: close(). */
  [Symbol.asyncDispose](): Promise<void>;
}
/** A program on pipes: spawn(file, args, { pty: false }). */
export interface Subprocess extends AsyncDisposable {
  /** The program's pid in the guest, the leader of its own session. */
  readonly pid: number;
  /** The exit status once `ended` settled with an exit, else null. */
  readonly exitCode: number | null;
  /** The protocol version both sides agreed on. */
  readonly version: number;
  /** The guest's feature bits (TTY_FEATURE_PIPES). */
  readonly features: number;
  /**
   * The program's stdin. Strings are UTF-8, sent in DATA frames of at most
   * 4096 bytes. close() sends EOF (the program reads end of file); a write
   * after the session ended rejects with EPIPE.
   */
  readonly stdin: WritableStream<Uint8Array | string>;
  /**
   * What the program writes to stdout and stderr, byte for byte. Pull
   * streams on one connection: the connection is read while either is
   * read, and output for the other is held until it is read, so read both,
   * or cancel the one you do not want (that discards it). They end after
   * EXIT, close() or a lost connection.
   */
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  /** Send a signal to the program ("SIGINT" or "INT"; default SIGTERM). As Pty.kill(). */
  kill(signal?: string): void;
  /** Hang up: the program's process group gets SIGHUP, and the connection closes both ways. */
  close(): Promise<void>;
  /** How the session ended. Settles once stdout and stderr have been read (or cancelled) up to EXIT, or at close(). */
  readonly ended: Promise<PtyEnd>;
  /** `await using`: close(). */
  [Symbol.asyncDispose](): Promise<void>;
}
/** One frame as received. */
export interface TtyFrame {
  type: number;
  flags: number;
  payload: Uint8Array;
}
/** A frame: header and payload (copied). */
export declare function encodeTtyFrame(type: number, payload?: Uint8Array, flags?: number): Uint8Array;
/** RESIZE's payload (on the wire rows come first, as in struct winsize). */
export declare function encodeTtyResize(s: PtySize): Uint8Array;
/**
 * OPEN's payload: max_version, the size, then TERM, one ENV option per
 * entry, ARG options (`file`, then `args`), CWD, PIPES and CONNECT. With
 * `pipes` or `connect`, TERM goes only when `term` is given. Throws a RangeError for values the
 * guest would refuse.
 */
export declare function encodeTtyOpen(opts: PtySize & {
  term?: string;
  env?: Record<string, string>;
  cwd?: string;
  file?: string;
  args?: readonly string[];
  pipes?: boolean;
  connect?: number;
}): Uint8Array;
/**
 * Splits a byte stream into frames, however it is chunked. push() what
 * arrives, then take whole frames with next(). A payload within one chunk
 * is a view of it, else a copy.
 */
export declare class TtyFrameParser {
  #private;
  /** Bytes held that do not make a whole frame yet. */
  get buffered(): number;
  push(chunk: Uint8Array): void;
  /** The next whole frame, without taking it. */
  peek(): TtyFrame | undefined;
  /** Take the next whole frame. */
  next(): TtyFrame | undefined;
  /** Take every byte held, frames not taken yet included, as they arrived (for a switch to raw bytes). */
  rest(): Uint8Array;
}
/**
 * Run `file` with `args` on a new pty in the guest (no file: root's login
 * shell; a file without "/" is looked up in PATH): connect to the guest's
 * kwtty server (retrying while it is not up yet), send OPEN, and wait for
 * OPENED. Rejects with a PtyError (ETIMEDOUT, EREMOTE with the guest's
 * message, e.g. a failed exec or chdir, EPROTO, ABORTED, ECONNRESET,
 * ECONNABORTED), or a RangeError for bad options.
 */
export declare function spawnPty(vsock: Vsock, file?: string, args?: readonly string[], opts?: PtyOptions): Promise<Pty>;
/**
 * Run `file` with `args` in the guest on pipes (stdin, stdout and stderr;
 * no file: root's login shell, reading stdin), as spawnPty() otherwise. A
 * guest without PIPES (a kernel from before them) refuses it: EREMOTE.
 */
export declare function spawnSubprocess(vsock: Vsock, file?: string, args?: readonly string[], opts?: SpawnOptions): Promise<Subprocess>;
/**
 * Run `file` with `args` on pipes, feed it `input`, and resolve with what
 * it printed on stdout and stderr and how it ended, once it ended. A
 * non-zero exit or a signal resolves too. Rejects with a PtyError as
 * spawnSubprocess(), or ENOBUFS (output over `maxBuffer`), ABORTED (the
 * signal; the program gets SIGKILL), ECONNRESET (the session was lost:
 * the kernel exited).
 */
export declare function execSubprocess(vsock: Vsock, file: string, args?: readonly string[], opts?: ExecOptions & {
  encoding?: "utf8";
}): Promise<ExecResult<string>>;
export declare function execSubprocess(vsock: Vsock, file: string, args: readonly string[] | undefined, opts: ExecOptions & {
  encoding: "buffer";
}): Promise<ExecResult<Uint8Array>>;
export declare function execSubprocess(vsock: Vsock, file: string, args?: readonly string[], opts?: ExecOptions): Promise<ExecResult<string | Uint8Array>>;
/** What connectGuest() takes. */
export interface ConnectOptions {
  /** How long to wait, in ms: for the guest server (connect retries), its TCP connect and the handshake together. Default 30000. */
  timeout?: number;
  /** Aborts connecting (PtyError ABORTED). It has no effect once connected: cancel `readable` or call close(). */
  signal?: AbortSignal;
  /** The guest server's (kwtty's) vsock port. Default TTY_PORT (1022). */
  ttyPort?: number;
}
/**
 * A raw byte stream to a TCP server in the guest (connectGuest()). It has
 * the shape of a ByteDuplex (http.ts), so fetchOver() can use it.
 */
export interface GuestSocket extends AsyncDisposable {
  /** The guest's TCP port. */
  readonly port: number;
  /**
   * What the server sends. A pull stream: vsock credit follows what is
   * read. It ends when the server shuts down its sending side (or
   * closes), and errors with a VsockError on a reset. Cancelling it tells
   * the guest the host no longer reads, which ends the connection.
   */
  readonly readable: ReadableStream<Uint8Array>;
  /**
   * Bytes for the server; a write resolves once its bytes are sent.
   * close() is a half-close: the server reads EOF and may still send.
   * abort() resets the connection.
   */
  readonly writable: WritableStream<Uint8Array>;
  /** Close both ways (what was written is still sent; what was not read is dropped). Resolves once the connection is gone. */
  close(): Promise<void>;
  /** Settles once the connection is gone: "closed" (both sides shut down) or "reset". */
  readonly closed: Promise<"closed" | "reset">;
  /** `await using`: close(). */
  [Symbol.asyncDispose](): Promise<void>;
}
/**
 * Connect to TCP `port` on the guest's 127.0.0.1 through the guest's kwtty
 * server (CONNECT; retrying while kwtty is not up yet). The guest connects
 * before it answers, so the promise resolves with a connected GuestSocket,
 * or rejects with a PtyError: ECONNREFUSED (nothing listens on the port),
 * EREMOTE (another connect error, with the guest's message, or a guest
 * without CONNECT), ETIMEDOUT, ABORTED, ECONNRESET, ECONNABORTED, EPROTO;
 * a RangeError for a port outside 1 to 65535.
 */
export declare function connectGuest(vsock: Vsock, port: number, opts?: ConnectOptions): Promise<GuestSocket>;
/** A kernel: a compiled module, its bytes, a Response, or a URL to fetch (a file path or file: URL on Node). */
export type KernelSource = WebAssembly.Module | BytesSource;
/** Bytes, a Response, or a URL to fetch (a file path or file: URL on Node). */
export type BytesSource = Uint8Array | ArrayBuffer | ArrayBufferView | Response | URL | string;
/** Download progress of the kernel or the initramfs. */
export interface DownloadProgress {
  stage: "download";
  what: "kernel" | "initrd";
  url: string;
  /** Bytes so far. */
  loaded: number;
  /** Expected bytes, 0 if unknown. */
  total: number;
  done: boolean;
}
export interface LoadOptions {
  what?: "kernel" | "initrd";
  onProgress?: (p: DownloadProgress) => void;
  signal?: AbortSignal;
  /**
   * Read a URL or path without fetch, or return undefined to fetch it (the
   * Node entry reads file: URLs and plain paths from disk).
   */
  readFile?: (src: URL | string) => Promise<Uint8Array> | undefined;
  /**
   * Want the SMP kernel: if the kernel is a bundle with an SMP patch
   * (kernel/tools/bundle.mjs --smp), load its bytes (no streaming
   * compile), patch them (kpatch.ts) and compile the result. A bundle
   * without one, or a compiled Module, is used as it is.
   */
  smp?: boolean;
}
/** Why loading or booting failed: the step that failed. */
export type BootFailStage = "support" | "download" | "compile" | "memory" | "boot";
/** An error from createKernel() or the loaders, tagged with the step that failed. */
export declare class BootError extends Error {
  stage: BootFailStage;
  constructor(stage: BootFailStage, message: string, options?: {
    cause?: unknown;
  });
}
/**
 * Download into memory, reporting progress (`onProgress`). With
 * content-encoding, content-length counts compressed bytes but the reader
 * yields decoded ones: x-decoded-length (if the server sends it) is used, else the total
 * is unknown (0).
 */
export declare function download(url: URL | string, opts?: LoadOptions): Promise<Uint8Array>;
/** Bytes of an initramfs (or any file) from any BytesSource. */
export declare function loadBytes(src: BytesSource, opts?: LoadOptions): Promise<Uint8Array>;
/**
 * Compile a kernel from any KernelSource. URLs and Responses are compiled
 * while they download (WebAssembly.compileStreaming) when the engine has it.
 */
export declare function loadKernelModule(src: KernelSource, opts?: LoadOptions): Promise<WebAssembly.Module>;
/** Events a backend reports for one TCP connection. */
export interface NetConnectionEvents {
  onConnect(): void;
  onData(data: Uint8Array): void;
  /** The remote side half-closed (no more data). */
  onEnd(): void;
  /** Data written earlier has been sent; `buffered` went down. */
  onDrain(): void;
  /** Called once, last; null for a clean close. */
  onClose(error: Error | null): void;
}
/** The host side of one TCP connection. */
export interface NetConnection {
  write(data: Uint8Array): void;
  /** Half-close (the guest sent FIN). */
  end(): void;
  /** Abort; no events follow. */
  destroy(): void;
  /** Stop delivering onData until resume(). */
  pause(): void;
  resume(): void;
  /** Bytes written but not yet sent. */
  readonly buffered: number;
}
/**
 * Transport for the guest's TCP connections and DNS lookups.
 *
 *   connect({ host, port }, events) -> NetConnection
 *   lookup(name) -> IPv4 dotted quads; reject with { code: "ENOTFOUND" }
 *     for NXDOMAIN, anything else becomes SERVFAIL
 *   close() (optional) drops every connection and the transport
 */
export interface NetBackend {
  connect(addr: {
    host: string;
    port: number;
  }, ev: NetConnectionEvents): NetConnection;
  lookup(name: string): Promise<string[]>;
  close?(): void;
}
export interface NetStackOptions {
  backend: NetBackend;
  log?: (msg: string) => void;
  /** TCP to the gateway (10.0.2.2) goes to 127.0.0.1. Default false. */
  hostLoopback?: boolean;
  /** MTU advertised by DHCP (option 26). */
  mtu?: number;
  /** The guest's MAC address, default 52:54:00:12:34:56. */
  mac?: string;
}
export interface NetStats {
  rx: number;
  tx: number;
  tcpOpened: number;
  dns: number;
}
export declare const ip4: (s: string) => number;
export declare const ip4str: (n: number) => string;
/** FIFO of bytes with random-access reads from the front. */
declare class ByteQueue {
  chunks: Uint8Array[];
  /** Offset into chunks[0]. */
  head: number;
  length: number;
  push(u8: Uint8Array): void;
  drop(n: number): void;
  copyTo(dst: Uint8Array, dstOff: number, offset: number, len: number): void;
}
interface Segment {
  sport: number;
  dport: number;
  seq: number;
  ack: number;
  flags: number;
  win: number;
  mss?: number;
  wscale?: number;
}
/** What sendTcp needs of a connection (a TcpConn, or a stand-in for a reset). */
interface TcpEndpoint {
  ip: number;
  port: number;
  gport: number;
  rcvNxt: number;
  sndUna: number;
  sendq: ByteQueue | null;
}
declare class TcpConn implements TcpEndpoint {
  stack: NetStack;
  key: string;
  gport: number;
  ip: number;
  port: number;
  irs: number;
  rcvNxt: number;
  iss: number;
  sndUna: number;
  sndNxt: number;
  mss: number;
  sndWscale: number;
  rcvWscale: number;
  sndWl: number;
  sendq: ByteQueue;
  state: "connecting" | "synrcvd" | "established" | "closed";
  remoteEof: boolean;
  finSent: boolean;
  guestFin: boolean;
  paused: boolean;
  rto: number;
  retries: number;
  timer: ReturnType<typeof setTimeout> | null;
  lastWnd: number;
  handle: NetConnection | undefined;
  constructor(stack: NetStack, key: string, gport: number, ip: number, port: number, seg: Segment);
  inFlight(): number;
  rcvWnd(): number;
  send(flags: number, seq: number, payloadLen?: number, opts?: Uint8Array | null): void;
  ack(): void;
  synAck(): void;
  /** Send whatever the guest's window allows, then FIN if due. */
  flush(): void;
  armTimer(): void;
  clearTimer(): void;
  onTimer(): void;
  connect(): void;
  refuse(err?: Error | null): void;
  close(): void;
  maybeDone(): void;
  /** A segment from the guest for this connection. */
  input(seg: Segment, payload: Uint8Array): void;
}
/**
 * The host end of the guest's network: pass it as the kernel's `net`
 * (kwnet) device. Terminates the guest's frames and bridges TCP and DNS to
 * `opts.backend`.
 */
export declare class NetStack implements NetDevice {
  backend: NetBackend;
  log: ((msg: string) => void) | undefined;
  hostLoopback: boolean;
  mtu: number | undefined;
  /** The guest's MAC. */
  mac: Uint8Array;
  gwMac: Uint8Array;
  guestMac: Uint8Array;
  net: number;
  mask: number;
  gw: number;
  dns: number;
  guest: number;
  tcp: Map<string, TcpConn>;
  ipId: number;
  /** Where frames for the guest go (set by attach()). */
  output: (frame: Uint8Array) => void;
  stats: NetStats;
  constructor(opts: NetStackOptions);
  /** Hook up to a Kernel (core/kernel.ts); called when the guest's driver initialises. */
  attach(kernel: Kernel): void;
  /** Frame from the guest. */
  send(frame: Uint8Array): void;
  /** Reset every TCP connection (the backend stays usable). */
  close(): void;
  emit(frame: Uint8Array): void;
  backendHost(ip: number): string | null;
  input(f: Uint8Array): void;
  arp(f: Uint8Array): void;
  ipv4(f: Uint8Array): void;
  /** Ethernet + IPv4 header for a reply to the guest; returns [frame, view]. */
  ipFrame(src: number, dst: number, proto: number, l4len: number, dstMac?: Uint8Array): [Uint8Array, DataView];
  l4csum(f: Uint8Array, src: number, dst: number, proto: number, off: number, len: number): number;
  sendUdp(src: number, sport: number, dst: number, dport: number, payload: Uint8Array, dstMac?: Uint8Array): void;
  sendTcp(c: TcpEndpoint, flags: number, seq: number, payloadLen: number, opts: Uint8Array | null, wnd: number): void;
  icmpInput(f: Uint8Array, _dv: DataView, src: number, dst: number, l4: number, end: number): void;
  icmpUnreachable(f: Uint8Array, l4: number, src: number, dst: number, code: number): void;
  udpInput(f: Uint8Array, dv: DataView, src: number, dst: number, l4: number, end: number): void;
  dhcp(p: Uint8Array): void;
  bytes4(n: number): number[];
  dnsQuery(q: Uint8Array, src: number, sport: number, dst: number): Promise<void>;
  tcpInput(f: Uint8Array, dv: DataView, _src: number, dst: number, l4: number, end: number): void;
}
/** The spec format. A spec may carry `v`; a factory refuses other versions. */
export declare const DEVICE_SPEC_VERSION = 1;
interface SpecCommon {
  /** Format version, default DEVICE_SPEC_VERSION. */
  v?: number;
  /** If it cannot be built, leave it out (and say why) instead of failing the boot. Later disks move up a letter. */
  optional?: boolean;
}
/** A disk image file on the host (Node). */
export interface FileDiskSpec extends SpecCommon {
  kind: "file";
  /** A path (relative paths are relative to the process's working directory). */
  path: string;
  /** Refuse writes. */
  readOnly?: boolean;
  /** Writes go to an in-memory overlay and are lost at exit (the CLI's --snapshot). */
  snapshot?: boolean;
}
/** An image served over HTTP with Range support, read lazily, under a copy-on-write overlay. */
export interface HttpDiskSpec extends SpecCommon {
  kind: "http";
  /** An absolute URL (a relative one is resolved against the page before it crosses to a worker). */
  url: string;
  chunkSize?: number;
  /** Browsers: keep the overlay in IndexedDB under this name (openHttpDisk's `name`); else it is in memory. */
  persist?: string;
}
/** The persistent data disk (browsers: IndexedDB; see js/web/disk.ts openDataDisk()). */
export interface DataDiskSpec extends SpecCommon {
  kind: "data";
  /** A kwsparse image (gzipped or not), or "bundled": the kernel module's unkernel.datadisk section. */
  template: Uint8Array | "bundled";
  /** "persistent" (default; the caller holds the one-tab lock) or "snapshot" (memory only, e.g. another tab owns it). */
  mode?: "persistent" | "snapshot";
  /** Store name and format version (default "kwdata", "v1"). */
  name?: string;
  version?: string;
  snapshotLimit?: number;
}
export type DiskSpec = FileDiskSpec | HttpDiskSpec | DataDiskSpec;
/** The network device: a NetStack over a backend. */
export interface NetSpec extends SpecCommon {
  kind: "net";
  backend: {
    kind: "direct";
  } | {
    kind: "wisp";
    servers: string | string[];
    headers?: Record<string, string>;
  };
  /** TCP to the gateway (10.0.2.2) goes to the host's 127.0.0.1 (direct only). */
  hostLoopback?: boolean;
  mtu?: number;
  mac?: string;
}
export type NetBackendSpec = NetSpec["backend"];
/** A disk spec (plain data), not a BlockDevice object. */
export declare function isDiskSpec(x: unknown): x is DiskSpec;
/** A network spec, not a NetDevice or NetBackend object. */
export declare function isNetSpec(x: unknown): x is NetSpec;
/** A disk that a spec marked optional could not be built: why. */
export interface SkippedDisk {
  index: number;
  kind: string;
  reason: string;
}
/**
 * What can be read off a disk from another thread (a WorkerKernel's
 * disks): the BlockDevice's flags and flush count, and for a CowDisk its
 * overlay, store and counters.
 */
export interface DiskState {
  /** Its index in the `disks` option (/dev/wda is the first disk that was built; skipped ones take no letter). */
  index: number;
  kind: string;
  size: number;
  readOnly: boolean;
  /** Flushes reach storage that outlives the host (a file, IndexedDB). */
  persistent: boolean;
  flushSeq: number;
  /** A save is in flight. */
  saving: boolean;
  /** CowDisk: blocks that differ from the base (stored or in memory). */
  overlayBlocks?: number;
  /** CowDisk: bytes of block data held in memory. */
  memBytes?: number;
  /** CowDisk with a store: blocks the store holds, its name, whether it was seeded now, and its identity. */
  storedBlocks?: number;
  store?: string;
  seeded?: boolean;
  identity?: string;
  /** CowDisk: why it is not the persistent disk (e.g. "in memory only, started from the template"). */
  notice?: string;
  /** CowDisk: saves no longer reach the store (detached before an import or reset). */
  detached?: boolean;
  cow?: CowDiskStats;
}
/**
 * A kernel or initrd source that crosses a thread: an absolute URL (the
 * worker fetches it, or reads it from disk on Node: file: URLs), bytes
 * (transferred), or, for the kernel, a WebAssembly.Module (it survives
 * postMessage within one process).
 */
type WorkerSource = string | Uint8Array;
/** Everything the worker needs to boot. It loads and compiles the kernel itself. */
interface WorkerBootSpec {
  kernel: WorkerSource | WebAssembly.Module;
  /** undefined = the module's bundled initramfs (if any), null = none. */
  initrd: WorkerSource | null | undefined;
  cmdline?: string;
  memoryMiB: number;
  memoryFallbackMiB?: number[];
  memory64?: boolean;
  jit?: boolean;
  /** CPUs for an SMP kernel (CreateKernelOptions.cpus); the worker starts their threads itself. */
  cpus?: number;
  consoleSize?: {
    cols: number;
    rows: number;
  };
  /** Disk and network specs (devices.ts), built by the worker's registry. */
  disks?: DiskSpec[];
  net?: NetSpec;
  /** Milliseconds between stats snapshots while running. */
  statsIntervalMs: number;
  /** Milliseconds the owner took to load and compile the kernel, when it did (the worker's stats report it). */
  compileMs?: number;
  /**
   * The display: true (640x480) or the size wanted. For a `display`
   * function the owner calls it and sends the result here and in
   * "display-size" messages; the worker answers the kernel from the latest.
   */
  display?: boolean | DisplaySize;
  /** A sound card: the sink's preferred rate, and whether the owner wants the PCM ("sound-chunk"). */
  sound?: false | {
    rate?: number;
    chunks: boolean;
  };
  /** A vsock device: the worker's kernel passes packets ("vsock" both ways); the protocol runs on the owner. */
  vsock?: boolean;
  /** kwshm: the worker's kernel offers it and runs the owner's "shm" calls (the copies happen there). */
  shm?: boolean;
  /**
   * The shared transport's control block (worker-shared.ts): console and
   * evdev input and frame requests go through it instead of "input",
   * "evdev" and "frame-want" messages. Absent: messages only.
   */
  shared?: SharedArrayBuffer;
  /**
   * With the shared transport and more than one CPU: the console ring
   * (console-ring.ts) the owner reads; every CPU writes its console output
   * there instead of "output" messages.
   */
  console?: SharedArrayBuffer;
  /**
   * Resume this snapshot instead of booting (CreateKernelOptions.restore);
   * its memory is transferred. The worker builds the disks and devices from
   * the spec and checks them against it, as inline.
   */
  restore?: KernelSnapshot;
}
/** An ExitResult with `error` reduced to something structured clone accepts. */
interface WorkerExit {
  code: number;
  reason: string;
  kind: ExitKind;
  error?: unknown;
}
/** Owner -> worker. */
type ToWorker = {
  t: "boot";
  spec: WorkerBootSpec;
} | {
  t: "input";
  data: Uint8Array | string;
} | {
  t: "resize";
  cols: number;
  rows: number;
} | {
  t: "sync";
  id: number;
  timeout?: number;
} | {
  t: "stop";
  code?: number;
  reason?: string;
} |
/** The owner's AbortSignal fired: abort the downloads, or stop the kernel once booted. */
{
  t: "abort";
} |
/**
 * An operation on disk `index` (built order), answered by "disk-result":
 * "detach" stops its saves, waits for the one in flight and closes its
 * store (before the owner replaces the store); "export" returns its
 * content as kwsparse parts (CowDisk.exportParts(): Blobs).
 */
{
  t: "disk";
  id: number;
  index: number;
  op: "detach" | "export";
} |
/** Evdev calls, in order (EVDEV_OP triples). */
{
  t: "evdev";
  ops: number[];
} |
/** The display size the owner's `display` function returns now (asked at the next first open). */
{
  t: "display-size";
  size: DisplaySize;
} |
/**
 * A frame credit: send one "frame" (id = this id) once the picture may
 * have changed (at once with `now`, even if unchanged). `buf` is a
 * returned frame buffer for the worker to reuse.
 */
{
  t: "frame-want";
  id: number;
  buf?: ArrayBuffer;
  now?: boolean;
} |
/**
 * The sink's answer to "sound-chunk" `seq`: frames queued after it, at
 * `at` (performance.timeOrigin + performance.now() on the owner).
 */
{
  t: "sound-queued";
  seq: number;
  frames: number;
  at: number;
} |
/** Shared transport: the owner wrote into the control block while the kernel waited idle. */
{
  t: "kick";
} |
/** vsock packets for the guest (header and payload each; transferred), in order. */
{
  t: "vsock";
  packets: Uint8Array[];
} |
/** A kwshm call (shm.ts) for the worker's ShmDevice; answered by "shm-result" with the same rid. */
{
  t: "shm";
  rid: number;
  call: ShmCall;
} |
/** Save the machine (KernelInstance.snapshot()); answered by "snapshot-result" with the same id. */
{
  t: "snapshot";
  id: number;
  stop?: boolean;
};
/** Worker -> owner. Output, log and progress keep their order relative to "started" and "exit". */
type FromWorker =
/** First message: the worker runs (a web binding revokes its Blob URL then), and whether it has JSPI. */
{
  t: "ready";
  jspi: boolean;
} | {
  t: "output";
  bytes: Uint8Array;
} | {
  t: "log";
  msg: string;
} | {
  t: "progress";
  p: BootProgress;
} | {
  t: "started";
  cmdline: string;
  memoryMiB: number;
  memory64: boolean;
  stats: InstanceStats;
  disks: DiskState[];
  skipped: SkippedDisk[];
} | {
  t: "boot-error";
  stage: string;
  message: string;
} | {
  t: "stats";
  stats: InstanceStats;
  disks: DiskState[];
} | {
  t: "synced";
  id: number;
  ok: boolean;
} |
/** A disk failed to save a flush (CowDisk onError). */
{
  t: "disk-error";
  index: number;
  error: {
    name: string;
    message: string;
    stack?: string;
  };
} | {
  t: "disk-result";
  id: number;
  ok: true;
  value?: unknown;
} | {
  t: "disk-result";
  id: number;
  ok: false;
  error: string;
} |
/** A program opened the display or changed its mode, or the last one closed it (null). */
{
  t: "display";
  mode: DisplayMode | null;
} |
/** The evdev open mask changed (InputHost.mask). */
{
  t: "input-state";
  mask: number;
} |
/**
 * The answer to "frame-want" `id`: the mode, and the pixels as packed
 * XRGB8888 rows (width * 4 bytes; transferred), or null when the picture
 * did not change since the last frame sent or no program has the display.
 */
{
  t: "frame";
  id: number;
  mode: DisplayMode | null;
  data: Uint8Array | null;
} |
/**
 * Shared transport: the frame triple buffer for the mode in the next
 * "display" message (`cap` bytes per slot), or null when none could be
 * made (frames then go by "frame-want" and "frame").
 */
{
  t: "frame-buffer";
  buffer: SharedArrayBuffer | null;
  cap: number;
} |
/** Shared transport: the answer to FRAME_NOW `id` (and earlier ones); the frame is in the buffer. */
{
  t: "frame-ready";
  id: number;
  mode: DisplayMode | null;
} | {
  t: "sound-state";
  state: SoundState;
  event: SoundEvent;
} |
/** PCM the guest played (transferred); answered by "sound-queued" (throttled). */
{
  t: "sound-chunk";
  seq: number;
  format: SoundFormat;
  data: Uint8Array;
} |
/** vsock packets from the guest (transferred), in order; posted from inside the import once 64 KiB or 64 packets are waiting, else per microtask. */
{
  t: "vsock";
  packets: Uint8Array[];
} |
/** The kernel's kwvsock started (VsockDevice onInit). */
{
  t: "vsock-ready";
  guestCid: number;
  rxMax: number;
} |
/** The answer to "shm": the result (read's bytes transferred), or the ShmError's code and message. */
{
  t: "shm-result";
  rid: number;
  ok: true;
  value: ShmCallResult;
} | {
  t: "shm-result";
  rid: number;
  ok: false;
  code: string;
  message: string;
} |
/** kwshm announced an export's page list (new, or refreshed). */
{
  t: "shm-attach";
  info: ShmInfo;
} |
/** kwshm withdrew an export. */
{
  t: "shm-detach";
  id: number;
} |
/**
 * The answer to "snapshot": the snapshot (its memory transferred), or why
 * it failed. Always posted before "exit" (a snapshot with stop ends the kernel).
 */
{
  t: "snapshot-result";
  id: number;
  ok: true;
  snapshot: KernelSnapshot;
} | {
  t: "snapshot-result";
  id: number;
  ok: false;
  error: string;
} |
/** Sent after every save in flight has settled, so the worker can be ended at once. */
{
  t: "exit";
  result: WorkerExit;
  stats: InstanceStats;
  disks: DiskState[];
};
/** The owner's end: a started worker running serveKernel(). */
interface WorkerEndpoint {
  post(msg: ToWorker, transfer?: ArrayBuffer[]): void;
  listen(handlers: {
    message(msg: FromWorker): void;
    /** An uncaught error in the worker. */
    error(err: unknown): void;
    /** The worker thread ended (also after terminate()). */
    exit(): void;
  }): void;
  terminate(): void;
}
/** Which way the owner and the kernel talk: on one thread, or worker mode by messages or with shared memory. */
export type KernelTransport = "inline" | "messages" | "shared";
/**
 * Can this thread use the shared transport: SharedArrayBuffer exists, the
 * context is not a non-isolated browser page, and one survives a post.
 */
export declare function sharedMemoryAvailable(): boolean;
/** The options WorkerKernel takes over from createKernel(). */
export interface WorkerKernelOptions {
  onOutput?: (bytes: Uint8Array) => void;
  onProgress: (p: BootProgress) => void;
  log: (msg: string) => void;
  onDiskError?: (index: number, error: unknown) => void;
  display?: DisplayOption;
  onDisplay?: (mode: DisplayMode | null) => void;
  onInput?: (state: InputState) => void;
  sound?: SoundOption;
  /** The vsock protocol runs here (VsockHost); the worker's kernel only passes packets. */
  vsock?: boolean | VsockOption;
  /** kwshm: the API (ShmClient) runs here, the calls run in the worker. */
  shm?: boolean;
  /** The shared transport's control block (worker-shared.ts), also sent in the boot spec; absent: messages. */
  shared?: SharedArrayBuffer;
  /** The console ring (console-ring.ts), also sent in the boot spec: read here. */
  console?: SharedArrayBuffer;
}
/**
 * A kernel running in a worker: the surface of KernelInstance, proxied over
 * messages. There is no low-level `kernel` object (it lives in the worker).
 * stats() returns the latest snapshot the worker sent (every 500 ms while
 * running, and a final one at exit) with uptimeMs brought up to date. The
 * display, evdev and sound work as inline, with the differences that a
 * thread boundary makes (worker-devices.ts): frame() returns the latest
 * frame the worker sent (readFrame() waits for a fresh one), evdev's open
 * state and return values are this thread's mirror, and a `display`
 * function is asked here, at boot, on resize() and on updateDisplaySize().
 */
export declare class WorkerKernel implements KernelHandle {
  #private;
  /** The command line it booted with. */
  cmdline: string;
  /** Memory actually allocated, in MiB. */
  memoryMiB: number;
  memory64: boolean;
  /** Settles when the kernel exits (see KernelInstance.exited), or 255 "fatal" if the worker dies. */
  readonly exited: Promise<ExitResult>;
  /** @internal Resolves once the kernel has started; rejects with a BootError. */
  readonly started: Promise<void>;
  /** @internal Use createKernel({ worker: true }). */
  constructor(endpoint: WorkerEndpoint, opts: WorkerKernelOptions);
  /** @internal Loading the kernel failed before the boot message was sent: end the worker. */
  abandon(reason: string): void;
  /** Console output as a stream (see KernelInstance.output). */
  get output(): ReadableStream<Uint8Array>;
  /** Call `listener` with console output from now on. Returns the unsubscribe function. */
  onOutput(listener: (bytes: Uint8Array) => void): () => void;
  /** Type into the console (bytes, or text encoded as UTF-8); "\n" or "\r" is Enter. */
  write(data: Uint8Array | string): void;
  /**
   * How console and evdev input and frames reach the worker: "shared"
   * (SharedArrayBuffers, read by the worker while the kernel runs, within
   * about a millisecond) or "messages" (handled when the kernel yields, up
   * to 20 ms while the guest is busy). Everything else is messages either way.
   */
  get transport(): KernelTransport;
  /** Console input as a stream. */
  get input(): WritableStream<Uint8Array | string>;
  /** Set the console window size; the guest's foreground process gets SIGWINCH. */
  resize(cols: number, rows: number): void;
  /**
   * Ask a `display` function for the size again and send it to the worker
   * if it changed, so that the next program to open /dev/fb0 gets it
   * (inline, the kernel calls the function itself at that moment; the
   * worker cannot). resize() does this too. A no-op for other options.
   */
  updateDisplaySize(): void;
  /** @internal The display option as it goes in the boot message. */
  get bootDisplay(): boolean | DisplaySize;
  /**
   * The keyboard, mouse and tablet (with the display option): InputHost's
   * methods, forwarded to the worker in order. The open state is a mirror
   * of the worker's (reported with onInput), so it may lag by a yield.
   */
  get evdev(): Evdev | undefined;
  /** With the display option: the mode while a program has /dev/fb0 open (as last reported), else null. */
  get display(): {
    readonly mode: DisplayMode | null;
  } | undefined;
  /**
   * The latest frame the worker sent, as RGBA (see KernelInstance.frame()),
   * or null with no display, while no program has it open, or before the
   * first frame arrived. Each call also asks for a newer one (at most two
   * requests are outstanding; the worker answers once the picture may have
   * changed). Compare frameSeq to skip repainting an unchanged frame.
   */
  frame(out?: Uint8ClampedArray): DisplayFrame | null;
  /** Ask for a newer frame without converting the current one (see frame()). */
  requestFrame(): void;
  /** Counts frames received with new pixels: frame() has something new when it changed. */
  get frameSeq(): number;
  /** A fresh frame: a round trip to the worker (with messages at most about 20 ms while the guest is busy; shared, about a millisecond). */
  readFrame(out?: Uint8ClampedArray): Promise<DisplayFrame | null>;
  /**
   * With the vsock option: listen() and connect() as inline (VsockHost).
   * The protocol runs on this thread; the packets cross to the worker as
   * messages, which it takes while the kernel is suspended (up to 20 ms
   * while the guest is busy, with either transport).
   */
  get vsock(): VsockHost | undefined;
  /** A program on its own pty or on pipes, and exec(), as inline (tty.ts; the protocol runs on this thread). */
  spawn(file: string | undefined, args: readonly string[] | undefined, opts: PipeOptions): Promise<Subprocess>;
  spawn(file?: string, args?: readonly string[], opts?: PtyOptions): Promise<Pty>;
  exec(file: string, args?: readonly string[], opts?: ExecOptions & {
    encoding?: "utf8";
  }): Promise<ExecResult<string>>;
  exec(file: string, args: readonly string[] | undefined, opts: ExecOptions & {
    encoding: "buffer";
  }): Promise<ExecResult<Uint8Array>>;
  /** A raw byte stream to a TCP server on the guest's loopback, as inline (kwtty's CONNECT; the protocol runs on this thread). */
  connect(port: number, opts?: ConnectOptions): Promise<GuestSocket>;
  /** HTTP/1.1 to a server on the guest's loopback, as inline (http.ts over connect()). */
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
  /** Host file systems in the guest, as inline (mounts.ts): the 9p server and the handlers run on this thread. */
  mount(path: string, fs: FsSource, opts?: MountOptions): Promise<Mount>;
  get mounts(): ReadonlyMap<string, Mount>;
  /** @internal createKernel's `mounts`, once the kernel runs. */
  startMounts(list: ReturnType<typeof parseMounts>): void;
  /**
   * With the shm option: open(), create() and openId() as inline. Each call
   * is a round trip to the worker, which runs it when the kernel next
   * suspends (up to 20 ms while the guest is busy); read() copies there and
   * transfers the bytes. No views(): the kernel's memory is the worker's.
   */
  get shm(): ShmClient | undefined;
  /** With the sound option: the playback state, as the worker last reported it. */
  get sound(): {
    readonly state: SoundState;
    readonly playing: boolean;
  } | undefined;
  /**
   * See KernelInstance.sync(): a round trip to the worker, which raises
   * the sync IRQ and waits for every persistent disk to complete a flush
   * issued after it (true), or `timeout` ms (false). A request still
   * open when the kernel exits or the worker dies resolves false if a
   * persistent disk was attached (nothing confirmed it), else true. After
   * the exit it resolves true at once: the worker reported the exit only
   * after the saves in flight had settled.
   */
  sync(opts?: {
    timeout?: number;
  }): Promise<boolean>;
  /**
   * Save the machine, as KernelInstance.snapshot(): the worker takes the
   * snapshot and transfers it here (its memory is not copied again).
   * Resume it with createKernel({ restore }), in worker mode or inline.
   * Rejects while host file systems are mounted, as inline.
   */
  snapshot(opts?: {
    stop?: boolean;
  }): Promise<KernelSnapshot>;
  /**
   * Stop the kernel now (see KernelInstance.stop()). The worker confirms
   * and is then ended; if it does not answer within 2 s it is ended anyway.
   */
  stop(res?: {
    code?: number;
    reason?: string;
  }): Promise<ExitResult>;
  /**
   * The disks' state as of the latest snapshot (every 500 ms, and final at
   * exit): flags, flush count, and for a CowDisk its overlay, store and
   * counters. Indexed as the `disks` option; see skippedDisks for the
   * optional ones left out.
   */
  get disks(): readonly DiskState[];
  /** Disks whose spec was optional and could not be built, and why. */
  get skippedDisks(): readonly SkippedDisk[];
  /**
   * Stop disk `index` (a CowDisk with a store) saving: the worker detaches
   * it, waits for the save in flight and closes its store, so this thread
   * may then replace or clear the store (the guest's later writes stay in
   * the worker's memory). Rejects if the kernel has exited.
   */
  detachDisk(index: number): Promise<void>;
  /** Disk `index`'s current content as a kwsparse image in parts (CowDisk.exportParts(); gzipBlob() compresses them). */
  exportDisk(index: number): Promise<{
    size: number;
    blocks: number;
    parts: BlobPart[];
  }>;
  /** The latest snapshot from the worker, with uptimeMs brought up to date while it runs. */
  stats(): InstanceStats;
}
/**
 * Boot progress, in order: downloads (with compile overlapping them when
 * streaming), memory, instantiate, start. Worker mode adds "worker" (the
 * worker runs, and whether it has JSPI) before "memory": it may come
 * before, during or after the download and compile, which run on the
 * owner's thread while the worker starts (unless compileInWorker).
 */
export type BootProgress = {
  stage: "worker";
  jspi: boolean;
} | DownloadProgress | {
  stage: "compile";
} | {
  stage: "compiled";
  ms: number;
  memory64: boolean;
} | ({
  stage: "memory";
} & MemoryStage) | {
  stage: "instantiate";
} | {
  stage: "start";
  cmdline: string;
};
export interface CreateKernelOptions {
  /**
   * Resume a snapshot (KernelInstance.snapshot()) instead of booting: the
   * same kernel build; initrd, cmdline and memoryMiB are ignored. In
   * worker mode the memory is copied to the worker (see
   * WorkerOption.transferRestore). `disks` must be the snapshot's disks,
   * unchanged since it was taken (same identity and write generation); otherwise createKernel
   * rejects, naming the disk, and the caller can boot normally instead.
   * The devices must be the snapshot's too: display, sound, vsock, shm
   * and network each given, or not, as when it was taken (a network with
   * the same MAC), or createKernel rejects. vsock sessions (spawn(),
   * exec(), connect(), fetch(), listeners' connections) and the guest's
   * TCP connections do not survive: the guest's ends are reset. Host file
   * systems do (inline only): `mounts` must give one for each mount path
   * in the snapshot, read-only as it was, and the guest's open files on
   * it are opened again by path (a file gone meanwhile answers ESTALE);
   * nothing of their files is in the snapshot. Other `mounts` are
   * mounted as at boot.
   */
  restore?: KernelSnapshot;
  /**
   * The kernel: a URL (a path or file: URL on Node), bytes, a Response or
   * a compiled WebAssembly.Module. Default: the bundled Alpine kernel
   * (unkernel-alpine.wasm next to the entry).
   */
  kernel?: KernelSource;
  /**
   * The initramfs (a cpio, optionally gzipped). Default (undefined): the
   * one bundled into the kernel, if any; null boots without one.
   */
  initrd?: BytesSource | null;
  /**
   * Kernel command line. Default: the kernel's bundled one if its bundled
   * initramfs is used; else "console=hvc0 root=/dev/wda rw" with disks and
   * no initramfs; else "console=hvc0 rdinit=/init".
   */
  cmdline?: string;
  /** Kernel memory (fixed for the run). Default 512 on Node; on the web, autoMemoryMiB(). */
  memoryMiB?: number;
  /** Smaller sizes to try in order if memoryMiB cannot be allocated. Default none on Node; DEFAULT_MEMORY_FALLBACK_MIB on the web. */
  memoryFallbackMiB?: number[];
  /** Memory type; default: detected from the module. */
  memory64?: boolean;
  /**
   * kwblk disks: /dev/wda, wdb, ... (CowDisk, HttpBase-backed disks,
   * FileDisk on Node, or your own BlockDevice), or specs (devices.ts:
   * plain data such as { kind: "file", path } on Node or { kind: "data",
   * template: "bundled" } in browsers), which the instance builds, owns
   * and closes at exit. Worker mode takes specs only.
   */
  disks?: Array<BlockDevice | DiskSpec>;
  /**
   * Network: a NetBackend (wrapped in a NetStack), a NetStack, any
   * NetDevice, or a spec ({ kind: "net", backend: { kind: "direct" } } on
   * Node, or { kind: "wisp", servers }). Default: none (the guest has no
   * eth0). The instance closes it (and its backend) when the kernel exits.
   * Worker mode takes a spec only.
   */
  net?: NetDevice | NetBackend | NetSpec;
  /** A disk built from a spec failed to save a flush (e.g. QuotaExceededError; the guest gets EIO for it). */
  onDiskError?: (index: number, error: unknown) => void;
  /**
   * kwemu's JIT tier: hot guest code is compiled to WebAssembly modules at
   * run time (synchronously, a few KiB each). Default true; false runs the
   * interpreter only.
   */
  jit?: boolean;
  /**
   * CPUs to give an SMP kernel (a kernel built with CONFIG_SMP; kernel.md,
   * SMP): each runs in its own thread on a shared memory, so it needs a
   * platform that starts CPU threads (Platform.spawnCpu: Node, and browsers
   * where the kernel runs in a worker of a cross-origin isolated page, as
   * `worker: true` does). Default 1. A UP kernel ignores it, and so does a
   * thread that cannot start CPUs (both with a log line); stats().cpus
   * says how many it got.
   */
  cpus?: number;
  /**
   * A display: the guest gets /dev/fb0 (kwfb, XRGB8888), and frame() /
   * display read what it draws. true = 640x480; or a size; or a function
   * returning the size wanted each time a program first opens the device
   * (e.g. the window's size; the kernel caps it at 1M pixels by dividing
   * by an integer; in worker mode it is asked ahead of time instead, see
   * WorkerOption). A program may set its own size; onDisplay reports
   * every change. Default false (no device).
   */
  display?: DisplayOption;
  /** A guest program opened the display or changed its mode (the mode), or the last one closed it (null). */
  onDisplay?: (mode: DisplayMode | null) => void;
  /**
   * With a display the guest also gets a keyboard and a mouse (evdev,
   * /dev/input/event0 and event1). Called when a program opens or the
   * last one closes them; send keys and motion through `evdev` only
   * while they are open, and to the console otherwise.
   */
  onInput?: (state: InputState) => void;
  /**
   * A sound card (kwsnd: ALSA hw:0,0 and OSS /dev/dsp, playback only):
   * true (output dropped) or a sink that receives the PCM chunks with
   * their format and the playback state (sound.ts). Default false (no card).
   */
  sound?: SoundOption;
  /**
   * A vsock device (kwvsock: AF_VSOCK, guest CID 3, host CID 2): `vsock`
   * on the instance listens for guest connections and connects to guest
   * listeners, each a byte stream (vsock.ts), and spawn() and exec() run
   * programs through it (tty.ts). true, or options. Default true; false:
   * the guest has no vsock transport.
   */
  vsock?: boolean | VsockOption;
  /**
   * kwshm: `shm` on the instance opens guest shmem files (by name in
   * /dev/shm, or by the id a guest program got from /dev/kwshm) and reads
   * and writes their pages in place (shm.ts). Default false: no device.
   */
  shm?: boolean;
  /**
   * Host file systems to mount in the guest (mounts.ts): guest paths to a
   * file system (an Fs such as MemoryFs or nodeFs(), or a plain object
   * tree of files: strings, bytes, functions, subdirectory objects), or to
   * { fs, readOnly, timeout, requestTimeout }. Each is served over 9p on
   * vsock and mounted by the guest's kw9p, through kwtty, once it answers.
   * spawn() and exec() wait for them; if one failed, the calls that waited
   * reject with its MountError (it is logged too). Needs vsock (the default).
   */
  mounts?: MountsOption;
  /** Initial console size (cols x rows); resize() changes it later. */
  consoleSize?: {
    cols: number;
    rows: number;
  };
  /** Console output, from the first byte. */
  onOutput?: (bytes: Uint8Array) => void;
  /** Host diagnostics ("[host] ...", "[net] ..."). Default console.error. */
  log?: (msg: string) => void;
  /** Download, compile and boot progress. */
  onProgress?: (p: BootProgress) => void;
  /** Aborts the downloads; once booted, stops the kernel (stop()). */
  signal?: AbortSignal;
  /**
   * @internal Worker mode with the shared transport: the console ring the
   * owner reads (KernelConfig.consoleRing; console-ring.ts).
   */
  consoleRing?: SharedArrayBuffer;
  /** @internal KernelConfig.flushOutput (the worker's batched "output" messages). */
  flushOutput?: () => void;
}
export interface VsockOption {
  /** The host's receive buffer per connection: the credit the guest gets. Default 256 KiB. */
  bufferSize?: number;
  /**
   * Low level, inline only: the guest's packets (virtio-vsock header and
   * payload) go to `onPacket` instead of the SDK's protocol, and `vsock`
   * on the instance is undefined; send with kernel.vsock.deliver().
   */
  raw?: {
    onPacket: (pkt: Uint8Array) => void;
    onInit?: (guestCid: number, rxMax: number) => void;
  };
}
/**
 * The worker option, kept out of CreateKernelOptions so that plain
 * options still type createKernel() as a KernelInstance.
 */
export interface WorkerOption {
  /**
   * Run the kernel in a worker (a worker_threads Worker on Node, a module
   * Web Worker in browsers), so it never blocks this thread. The
   * result is a WorkerKernel: the console, sync(), stop(), stats(),
   * exited, the disks' state, the display (frame() is the latest frame
   * the worker sent; readFrame() waits for a fresh one), evdev and sound,
   * without the low-level `kernel`. Disks and the network must be specs
   * (devices.ts), which the worker builds. A `display` function is asked
   * on this thread at boot, on resize() and on
   * WorkerKernel.updateDisplaySize(). The worker starts at once, and while
   * it starts this thread downloads (or reads) and compiles the kernel
   * (the engine compiles off-thread) and then posts the compiled
   * WebAssembly.Module to it. Default false.
   */
  worker?: boolean;
  /**
   * Worker mode: load and compile the kernel in the worker instead of on
   * this thread (it then starts only once the worker runs, which is
   * slower). A kernel given as a WebAssembly.Module is posted as it is
   * either way. Default false.
   */
  compileInWorker?: boolean;
  /**
   * Worker mode: console and evdev input and frames through
   * SharedArrayBuffers (worker-shared.ts), which the worker reads while the
   * kernel runs, instead of messages it handles only when the kernel
   * yields (up to 20 ms while the guest is busy). Default (undefined):
   * shared where a SharedArrayBuffer can be posted (Node; a browser page
   * only when cross-origin isolated), else messages. false: messages
   * always. true: shared, or a BootError ("support") where it cannot be.
   * WorkerKernel.transport says which is used.
   */
  shared?: boolean;
  /**
   * Worker mode with `restore`: hand the snapshot's memory buffer to the
   * worker instead of copying it (about 150 ms per 512 MiB), for a
   * snapshot that is used once; its `memory` is detached then. Default false.
   */
  transferRestore?: boolean;
}
export interface InstanceStats extends KernelStats {
  /** Milliseconds since kernel entry. */
  uptimeMs: number;
  /** CPUs the kernel was offered (CreateKernelOptions.cpus, or 1 for a UP kernel or where CPU threads cannot start). */
  cpus: number;
  /** Milliseconds to download and compile the kernel (0 if a Module was given). */
  compileMs: number;
  block: BlockStats;
  net?: NetStats;
  /** JIT counters, of all CPUs together. */
  jit: JitStats;
  /** With more than one CPU: the JIT counters per CPU (CPU 0 first). */
  jitCpus?: JitStats[];
  /** kwemu's counters, only from a -Dkwemu-stats kernel (`kernel/build.sh stats`); CPU 0's. */
  kwemu?: KwemuStats;
  /** With more than one CPU: kwemu's counters per CPU (-Dkwemu-stats kernels). */
  kwemuCpus?: (KwemuStats | undefined)[];
  display?: DisplayStats;
  evdev?: InputStats;
  sound?: SoundStats;
  vsock?: VsockStats;
  shm?: ShmStats;
}
/**
 * A running kernel, wherever it runs: KernelInstance (on this thread) and
 * WorkerKernel (in a worker) both have this surface.
 */
export interface KernelHandle {
  /** The command line it booted with. */
  readonly cmdline: string;
  /** Settles when the kernel exits: halt (power off 0, halt 1, restart 2), panic 253, trap 254, fatal 255, or stop(). */
  readonly exited: Promise<ExitResult>;
  /** Console output as a stream: the first access gets everything since boot (the last 1 MiB); closes at exit. */
  readonly output: ReadableStream<Uint8Array>;
  /** Call `listener` with console output from now on. Returns the unsubscribe function. */
  onOutput(listener: (bytes: Uint8Array) => void): () => void;
  /** Type into the console (bytes, or text encoded as UTF-8); "\n" or "\r" is Enter. */
  write(data: Uint8Array | string): void;
  /** Console input as a stream. */
  readonly input: WritableStream<Uint8Array | string>;
  /** Set the console window size; the guest's foreground process gets SIGWINCH. */
  resize(cols: number, rows: number): void;
  /** Ask the guest to sync its file systems and disks; true once persistent disks have flushed. */
  sync(opts?: {
    timeout?: number;
  }): Promise<boolean>;
  /** Stop the kernel now (no clean shutdown). Resolves with the exit. */
  stop(res?: {
    code?: number;
    reason?: string;
  }): Promise<ExitResult>;
  /** Save the machine; resume it with createKernel({ restore }) (see KernelInstance.snapshot()). */
  snapshot(opts?: {
    stop?: boolean;
  }): Promise<KernelSnapshot>;
  /** Counters (in a worker: the latest snapshot, at most about 500 ms old while running). */
  stats(): InstanceStats;
  /** Memory actually allocated, in MiB. */
  readonly memoryMiB: number;
  readonly memory64: boolean;
  /** With the display option: the mode while a program has /dev/fb0 open, else null. */
  readonly display: {
    readonly mode: DisplayMode | null;
  } | undefined;
  /** With the display option: the keyboard, mouse and tablet (InputHost's methods). */
  readonly evdev: Evdev | undefined;
  /** The current frame as RGBA (in a worker: the latest one it sent), or null. */
  frame(out?: Uint8ClampedArray): DisplayFrame | null;
  /** A fresh frame as RGBA (in a worker: a round trip), or null. */
  readFrame(out?: Uint8ClampedArray): Promise<DisplayFrame | null>;
  /** With the sound option: the playback state. */
  readonly sound: {
    readonly state: SoundState;
    readonly playing: boolean;
  } | undefined;
  /**
   * With the vsock option: listen() for guest connections to the host
   * (CID 2) and connect() to guest listeners (CID 3). In worker mode the
   * protocol runs on this thread and the packets cross as messages.
   */
  readonly vsock: Vsock | undefined;
  /**
   * Run `file` with `args` in the guest (no file: root's login shell),
   * served by the guest's kwtty over vsock (tty.ts): on its own pty, a Pty
   * (the zigpty / node-pty shape), or with `pty: false` on stdin, stdout
   * and stderr pipes, a Subprocess. Rejects with a PtyError ENODEV when
   * the instance was created with `vsock: false`. Waits until
   * createKernel's `mounts` are mounted, as exec() does, and rejects with
   * the MountError if one of them failed.
   */
  spawn(file: string | undefined, args: readonly string[] | undefined, opts: PipeOptions): Promise<Subprocess>;
  spawn(file?: string, args?: readonly string[], opts?: PtyOptions): Promise<Pty>;
  /**
   * Run `file` with `args` on pipes, feed it `input`, and resolve with
   * its stdout and stderr (strings, or bytes with `encoding: "buffer"`)
   * and how it ended (a non-zero exit resolves too). tty.ts.
   */
  exec(file: string, args?: readonly string[], opts?: ExecOptions & {
    encoding?: "utf8";
  }): Promise<ExecResult<string>>;
  exec(file: string, args: readonly string[] | undefined, opts: ExecOptions & {
    encoding: "buffer";
  }): Promise<ExecResult<Uint8Array>>;
  /**
   * A raw byte stream to TCP `port` on the guest's 127.0.0.1, through the
   * guest's kwtty (tty.ts, CONNECT): resolves once the guest connected,
   * rejects with a PtyError ECONNREFUSED when nothing listens there, or
   * ENODEV without vsock. Waits for createKernel's `mounts`, as spawn().
   */
  connect(port: number, opts?: ConnectOptions): Promise<GuestSocket>;
  /**
   * An HTTP/1.1 request to a server on the guest's loopback (http.ts
   * fetchOver() over connect()): the URL's port picks the guest port
   * (default 80), its host only goes into the Host header.
   */
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
  /**
   * Mount a host file system at guest `path` (mounts.ts): serve `fs` over
   * 9p and run kw9p in the guest. Resolves with the Mount (unmount(),
   * stats) once the guest has it mounted; rejects with a MountError
   * (ENODEV without vsock or without 9p in the kernel, ENOENT without kw9p
   * in the image, EBUSY, ETIMEDOUT, ...).
   */
  mount(path: string, fs: FsSource, opts?: MountOptions): Promise<Mount>;
  /** The mounts the guest has now, by guest path. */
  readonly mounts: ReadonlyMap<string, Mount>;
  /**
   * With the shm option: guest shmem files read and written in place
   * (open(), create(), openId(); ShmFile.read()/write()). In worker mode the
   * copies run in the worker, where the kernel's memory is.
   */
  readonly shm: Shm | undefined;
  /**
   * How input and frames reach the kernel: "inline" (this thread),
   * "messages" or "shared" (worker mode; see WorkerOption.shared).
   */
  readonly transport: KernelTransport;
}
/** A booted kernel: its console, its exit, and the low-level Kernel. */
export declare class KernelInstance implements KernelHandle {
  #private;
  /** The low-level runtime object (imports, memory, IRQ bits). */
  readonly kernel: Kernel;
  readonly module: WebAssembly.Module;
  /** The command line it booted with. */
  readonly cmdline: string;
  /** The network device, if any. */
  readonly net: NetDevice | undefined;
  /** Disks whose spec was optional and could not be built, and why. */
  skippedDisks: SkippedDisk[];
  /** Settles when the kernel exits: halt (power off 0, halt 1, restart 2), panic 253, trap 254, fatal 255, or stop(). */
  readonly exited: Promise<ExitResult>;
  /** @internal Use createKernel(). */
  constructor(kernel: Kernel, module: WebAssembly.Module, cmdline: string, net: NetDevice | undefined, compileMs: number);
  /** @internal The vsock protocol's host end, when the vsock option is set (and not raw). */
  attachVsock(host: VsockHost): void;
  /**
   * @internal createKernel({ restore, mounts }), before the kernel runs:
   * serve the snapshot's mounts again and tell the kernel to keep their
   * connections. Returns the mounts to mount once it runs.
   */
  restoreMounts(snap: KernelSnapshot, list: ReturnType<typeof parseMounts>): Promise<ReturnType<typeof parseMounts>>;
  /** @internal createKernel's `mounts`, once the kernel runs. */
  startMounts(list: ReturnType<typeof parseMounts>): void;
  /**
   * With the vsock option: listen() for guest connections to the host
   * (CID 2, any port) and connect() to guest listeners (CID 3), each a
   * byte stream with half-close and reset (VsockHost, vsock.ts).
   */
  get vsock(): VsockHost | undefined;
  /**
   * A program on its own pty, or on pipes (`pty: false`), served by the
   * guest's kwtty on vsock port 1022 (tty.ts).
   */
  spawn(file: string | undefined, args: readonly string[] | undefined, opts: PipeOptions): Promise<Subprocess>;
  spawn(file?: string, args?: readonly string[], opts?: PtyOptions): Promise<Pty>;
  exec(file: string, args?: readonly string[], opts?: ExecOptions & {
    encoding?: "utf8";
  }): Promise<ExecResult<string>>;
  exec(file: string, args: readonly string[] | undefined, opts: ExecOptions & {
    encoding: "buffer";
  }): Promise<ExecResult<Uint8Array>>;
  /** A raw byte stream to a TCP server on the guest's loopback (see KernelHandle.connect()). */
  connect(port: number, opts?: ConnectOptions): Promise<GuestSocket>;
  /** HTTP/1.1 to a server on the guest's loopback (see KernelHandle.fetch()). */
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
  /** Mount a host file system in the guest (mounts.ts; see KernelHandle.mount()). */
  mount(path: string, fs: FsSource, opts?: MountOptions): Promise<Mount>;
  get mounts(): ReadonlyMap<string, Mount>;
  /**
   * With the shm option: open guest shmem files by name or by a guest
   * export's id and read and write their pages in place (shm.ts). Handles
   * have views() too: zero-copy views of the kernel's memory, valid until
   * the kernel runs again.
   */
  get shm(): ShmClient<InlineShmFile> | undefined;
  /** @internal Disks built from specs, closed (after their last save) when the kernel exits. */
  own(disks: BlockDevice[]): void;
  /** Resolves once every save in flight on the disks has settled (a no-op for disks without saves). */
  settled(): Promise<void>;
  /** @internal Console output from the kernel. */
  emit(bytes: Uint8Array): void;
  /**
   * Console output as a stream. The first access gets everything since
   * boot (the last 1 MiB); later chunks are queued without limit, so keep
   * reading it (or use onOutput()). Closes when the kernel exits. There is
   * one such stream; tee() it for more readers.
   */
  get output(): ReadableStream<Uint8Array>;
  /** Call `listener` with console output from now on. Returns the unsubscribe function. */
  onOutput(listener: (bytes: Uint8Array) => void): () => void;
  /** Type into the console (bytes, or text encoded as UTF-8); "\n" or "\r" is Enter. */
  write(data: Uint8Array | string): void;
  /** Console input as a stream (e.g. pipe a terminal into it). */
  get input(): WritableStream<Uint8Array | string>;
  /** Set the console window size; the guest's foreground process gets SIGWINCH. */
  resize(cols: number, rows: number): void;
  /**
   * Ask the guest to write back all file systems and flush its disks (the
   * sync IRQ), e.g. before a page goes away. Resolves true once every
   * persistent disk (FileDisk, a CowDisk saved in IndexedDB) has completed
   * a flush issued after the call, false after `timeout` ms (default 3000).
   * True at once without persistent disks.
   */
  sync(opts?: {
    timeout?: number;
  }): Promise<boolean>;
  /**
   * Save the machine (Kernel.snapshot()); resume it with createKernel({
   * restore }). Disks are not copied: the snapshot stays restorable only
   * while they are unchanged. Without `stop` the guest keeps running, and
   * its next disk write ends that; `stop: true` stops the kernel right
   * after the copy (no clean shutdown), the usual way to suspend a machine
   * with disks. The devices' host state is saved (display, input, sound,
   * shm exports, the network's MAC); vsock sessions and TCP connections
   * are not (a restored guest's ends are reset). Host file systems are:
   * each mount's 9p session and the guest's open files on it (not the
   * files themselves; restore with the same `mounts`). Rejects while a
   * mount or unmount runs, or when a 9p request is in flight at the
   * snapshot point.
   */
  snapshot(opts?: {
    stop?: boolean;
  }): Promise<KernelSnapshot>;
  /**
   * Stop the kernel now (no clean shutdown: the guest is not told and
   * unflushed disk writes are lost; prefer typing `poweroff` or call
   * sync() first). Resolves
   * with the exit, which is the stop unless the kernel had already exited.
   */
  stop(res?: {
    code?: number;
    reason?: string;
  }): Promise<ExitResult>;
  stats(): InstanceStats;
  /** The kernel runs on this thread. */
  get transport(): KernelTransport;
  /** The sound card's host side, if the sound option was set: `playing`, `state`, `stats`. */
  get sound(): SoundHost | undefined;
  /** Memory actually allocated, in MiB. */
  get memoryMiB(): number;
  get memory64(): boolean;
  /**
   * The display's host side, if the display option was set: its mode and
   * the address of the pixels while a guest program has /dev/fb0 open.
   */
  get display(): DisplayHost | undefined;
  /**
   * The current frame as RGBA (canvas ImageData layout), or null when there
   * is no display or no program has it open. The guest is suspended
   * whenever this can run, but a program may be in the middle of drawing;
   * call it once per animation frame at most. `out` is reused when it has
   * the right size.
   */
  /**
   * The keyboard and mouse (with the display option): key(), button(),
   * move(), wheel(), and their open state (keyboardOpen, mouseOpen).
   */
  get evdev(): InputHost | undefined;
  frame(out?: Uint8ClampedArray): DisplayFrame | null;
  /** frame(), as a promise (the same call as WorkerKernel.readFrame(), which needs a round trip). */
  readFrame(out?: Uint8ClampedArray): Promise<DisplayFrame | null>;
}
/**
 * The default Wisp server: the project's own. Public alternatives (run by
 * third parties, who see the host names and ports the guest connects to and
 * plain-HTTP content; the guest's TLS is end to end): wss://anura.pro/,
 * wss://wisp.mercurywork.shop/. A ws:// server is blocked as mixed content
 * on an https page.
 */
export declare const DEFAULT_WISP_SERVERS: readonly string[];
export interface WispBackendOptions {
  log?: (msg: string) => void;
  /**
   * Extra handshake headers, e.g. `{ Origin: "http://localhost" }`. Only
   * runtimes whose WebSocket takes `{ headers }` (Node, Deno, Bun) send
   * them; in browsers, which set Origin themselves, the option is ignored.
   * The Node entry's wispBackend() defaults to NODE_WISP_HEADERS.
   */
  headers?: Record<string, string>;
}
/** A Wisp backend; close() drops the WebSocket (and with it every stream). */
export interface WispBackend extends NetBackend {
  close(): void;
}
/**
 * @param url  Wisp endpoint(s), e.g. "wss://wisp.example/" (trailing slash
 *   per the spec). Several are raced; the fastest handshake wins.
 */
export declare function wispBackend(url: string | readonly string[], opts?: WispBackendOptions): WispBackend;
/** A kernel log line: "[    1.234567] ...". */
export declare const KSTAMP: RegExp;
/** Kernel messages worth showing even when kernel lines are hidden. */
export declare const IMPORTANT: RegExp;
/** ANSI escape sequences (CSI, charset selection, keypad modes, save/restore). */
export declare const ANSI: RegExp;
export interface KernelLineInfo {
  /** The time stamp, seconds since boot. */
  time: number;
  /** Matches IMPORTANT (panic, oops, OOM kill, segfault, ...). */
  important: boolean;
  /** The line as received, with its line end. */
  raw: string;
}
export interface ConsoleRouterOptions {
  /** A kernel message, without "\r" and the line end. */
  onKernelLine?: (line: string, info: KernelLineInfo) => void;
  /** User-space output (including `dmesg` output), as it arrives. */
  onUserOutput?: (text: string) => void;
  /**
   * Once: user space printed its first non-empty line, or a shell prompt.
   * `why` is "first output: <line>" or "shell prompt".
   */
  onUserspace?: (why: string) => void;
  /** How long an undecidable line start is held back, default 250 ms. */
  holdMs?: number;
}
export declare class ConsoleRouter {
  #private;
  /** Whether user space has started printing (onUserspace fired). */
  userspace: boolean;
  constructor(opts?: ConsoleRouterOptions);
  /** Console output: bytes (decoded as a UTF-8 stream) or text. */
  write(data: Uint8Array | string): void;
  /** Release a held-back line start as user output now. */
  flush(): void;
}
export interface SupportReport {
  /** Everything the default (lowered, 32-bit memory) kernel needs: WebAssembly, BigInt and working JSPI. */
  ok: boolean;
  wasm: boolean;
  bigint: boolean;
  /** WebAssembly.Suspending and WebAssembly.promising exist and a suspend/resume round trip works. */
  jspi: boolean;
  /** memory64: only the wasm64 reference kernel (vmlinux) needs it. */
  memory64: boolean;
  /** Why `ok` is false (empty when it is true). */
  problems: string[];
}
/** Check JSPI by suspending a tiny module on a timer and resuming it. */
export declare function checkJspi(timeoutMs?: number): Promise<{
  ok: boolean;
  why?: string;
}>;
/** What this engine supports, and whether that is enough to boot the default kernel. */
export declare function checkSupport(): Promise<SupportReport>;
/** A byte stream to a server in the guest. */
export interface ByteDuplex {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
}
/** Open a byte stream to the guest's 127.0.0.1:<port>. */
export type GuestConnect = (port: number, opts: {
  signal?: AbortSignal;
}) => Promise<ByteDuplex>;
/** The largest status line plus header block accepted, interim responses included. */
export declare const HTTP_MAX_HEADER_BYTES: number;
/**
 * Fetch from a server in the guest: always connects to the guest's
 * 127.0.0.1:<port>, the URL's port (default 80). Only http: URLs. The
 * hostname goes only into the Host header. Takes what fetch() takes; a
 * Request's own body is read in full first and sent with Content-Length,
 * a ReadableStream (or other streaming) `init.body` is sent chunked.
 * Redirects are returned, not followed. Rejects 101 Switching Protocols.
 */
export declare function fetchOver(connect: GuestConnect, input: string | URL | Request, init?: RequestInit): Promise<Response>;
export {};