import { ABS_MAX, ABS_X, ABS_Y, ANSI, BTN_LEFT, BTN_MIDDLE, BTN_RIGHT, BaseDisk, BlockDevice, BlockStats, BootError, BootFailStage, BootProgress, BootStage, ByteDuplex, BytesSource, CMD_PORT, CommandError, CommandErrorCode, CommandsOption, ConnectOptions, ConsoleRouter, ConsoleRouterOptions, CowDisk, CowDiskOptions, CowDiskStats, CreateKernelOptions, DEFAULT_DISPLAY_SIZE, DEFAULT_WISP_SERVERS, DEVICE_SPEC_VERSION, DOM_CODE_TO_LINUX, DataDiskSpec, DeviceKind, DeviceSnapshots, DiskBase, DiskSnapshotState, DiskSpec, DiskState, DisplayFrame, DisplayHost, DisplayHostOptions, DisplayMode, DisplayOption, DisplaySize, DisplayStats, DistroDisk, DistroHeader, DistroIndex, DistroIndexEntry, DistroInfo, DistroSource, DownloadProgress, EV_ABS, EV_KEY, EV_REL, EV_SYN, Evdev, ExecOptions, ExecResult, ExitKind, ExitResult, FOURCC_XRGB8888, F_DISCARD, F_FLUSH, F_RO, F_WRITE_ZEROES, FileDiskSpec, FlushTracker, Fs, FsAttr, FsDirEntry, FsError, FsFile, FsFileType, FsOpenFlags, FsSetAttr, FsSource, FsStatFs, FsTree, FsTreeFile, GuestConnect, GuestSocket, HTTP_MAX_HEADER_BYTES, HostCommand, HostCommandContext, HostCommandResult, HttpBase, HttpBaseOptions, HttpBaseStats, HttpDiskSpec, IMPORTANT, INPUT_KEYBOARD, INPUT_MOUSE, INPUT_TABLET, IRQ_SYNC, InlineShmFile, InputHost, InputHostOptions, InputState, InputStats, InstanceStats, JitHost, JitHostOptions, JitStats, KSTAMP, KWSPARSE_MAGIC, Kernel, KernelConfig, KernelHandle, KernelInstance, KernelLineInfo, KernelSnapshot, KernelSource, KernelStats, KernelTransport, KwemuStats, KwsparseImage, LoadOptions, MaybePromise, MemoryFs, MemoryFsChange, MemoryStage, Mount, MountError, MountErrorCode, MountOptions, MountSpec, MountStats, MountsOption, NetBackend, NetBackendSpec, NetConnection, NetConnectionEvents, NetDevice, NetSpec, NetStack, NetStackOptions, NetStats, OverlayStore, PipeOptions, Pty, PtyEnd, PtyError, PtyErrorCode, PtyOptions, PtySize, REL_WHEEL, REL_X, REL_Y, SHM_PAGE_SIZE, SOUND_FORMAT_S16_LE, SOUND_FORMAT_U8, Shm, ShmBackend, ShmCall, ShmCallResult, ShmClient, ShmCloseReason, ShmDevice, ShmDeviceOptions, ShmDeviceStats, ShmError, ShmFile, ShmInfo, ShmStats, SkippedDisk, SoundChunk, SoundEvent, SoundFormat, SoundHost, SoundHostOptions, SoundOption, SoundSink, SoundState, SoundStats, SparseBase, SpawnOptions, StoreIndex, Subprocess, SupportReport, TTY_FEATURE_CONNECT, TTY_FEATURE_PIPES, TTY_PORT, TTY_SIGNALS, TTY_VERSION, TtyFrame, TtyFrameParser, VSOCK_GUEST_CID, VSOCK_HEADER_SIZE, VSOCK_HOST_CID, Vsock, VsockConnection, VsockDevice, VsockDeviceOptions, VsockDeviceStats, VsockError, VsockHeader, VsockHost, VsockHostOptions, VsockListener, VsockOption, VsockStats, WASI_EXEC_PORT, WasiExecOptions, WasiExecServer, WasiExecStats, WispBackend, WispBackendOptions, WorkerKernel, WorkerKernelOptions, WorkerOption, ZERO_BLOCK, ZeroBase, bundledBoot, checkJspi, checkSupport, connectGuest, convertPcm, decodeKwsparse, decodeSnapshot, decodeVsockHeader, domButtonToLinux, domCodeToLinux, download, encodeKwsparse, encodeSnapshot, encodeTtyFrame, encodeTtyOpen, encodeTtyResize, encodeVsockPacket, execSubprocess, fetchOver, frameToPpm, gunzipIfNeeded, gzipBlob, inlineShm, ip4, ip4str, isDiskSpec, isNetSpec, isZeroBlock, jitSimd, kwsparseHeader, loadBytes, loadKernelModule, moduleIsMemory64, pcmToFloat32, probeDistro, readDistroHeader, readKwsparse, sharedMemoryAvailable, snapshotDeviceMismatch, snapshotDiskMismatch, spawnPty, spawnSubprocess, wavHeader, wispBackend, xrgbToRgba } from "./_chunks/index.mjs";
interface IdbStoreOptions {
  log?: ((msg: string) => void) | null;
  durability?: IDBTransactionDurability;
}
/** Overlay persistence in IndexedDB: database "kwdisk:<name>". */
export declare class IdbStore implements OverlayStore {
  #private;
  readonly name: string;
  log: (msg: string) => void;
  durability: IDBTransactionDurability;
  dbp: Promise<IDBDatabase> | null;
  constructor(name: string, { log, durability }?: IdbStoreOptions);
  /**
   * Read the index: the numbers of all stored blocks (not their data).
   * If the database belongs to another identity: onMismatch "clear" drops
   * the blocks (logged loudly), "refuse" leaves everything alone and
   * returns {mismatch: storedIdentity}. With write: false nothing is
   * written (a read-only transaction; a fresh database stays unmarked).
   */
  open(identity: string, { onMismatch, write }?: {
    onMismatch?: "clear" | "refuse";
    write?: boolean;
  }): Promise<StoreIndex>;
  /** Records for the given block numbers: Map block -> Uint8Array (missing blocks are absent). */
  getBlocks(blocks: number[]): Promise<Map<number, Uint8Array>>;
  /** One transaction: put [block, data] pairs, delete block numbers, and record the write generation if given. */
  save(puts: Array<[number, Uint8Array]>, dels?: number[], meta?: {
    gen: number;
  }): Promise<void>;
  /** One transaction: replace everything with these blocks and mark the store initialized (a new uid, generation 0). Returns the uid. */
  seed(entries: Iterable<[number, Uint8Array]>, identity: string): Promise<string>;
  /** All records, read in one transaction (a consistent snapshot). */
  readAll(): Promise<Map<number, Uint8Array>>;
  count(): Promise<number>;
  /**
   * Forget everything. Deleting a large disk's blocks takes a while, and a
   * page that reloads meanwhile aborts the transaction, so a marker is
   * committed first (a small transaction): open() treats a marked store
   * as empty and finishes the deletion.
   */
  clear(): Promise<void>;
  close(): Promise<void>;
}
interface HttpDiskOptions {
  /** Name of the saved overlay (default: the URL). */
  name?: string;
  /** Save the overlay in IndexedDB on each flush (default true, if IndexedDB exists). */
  persist?: boolean;
  chunkSize?: number;
  log?: (msg: string) => void;
  /** A save failed (e.g. QuotaExceededError). */
  onError?: (err: unknown) => void;
}
/**
 * A disk image served over HTTP, read lazily with Range requests, written to
 * a copy-on-write overlay, optionally persisted in IndexedDB under `name`.
 * A saved overlay that belongs to another version of the image (size, ETag)
 * is dropped, loudly (it would corrupt the file system).
 */
export declare function openHttpDisk(url: string, { name, persist, chunkSize, log, onError }?: HttpDiskOptions): Promise<CowDisk>;
/** Drop the persisted overlay of a disk opened with openHttpDisk(…, {name}). */
export declare function resetHttpDisk(name: string): Promise<void>;
/**
 * A distro image served over HTTP (relative to the page) as the read-only
 * disk createKernel({ distro }) takes: read lazily with Range requests,
 * after the prefetch its distro header asks for (`prefetch` overrides it,
 * false turns it off; HttpBaseOptions.prefetch), which starts here;
 * nothing kept in IndexedDB, every range checked against the image first
 * seen (HttpBase strict). For a caller that needs the disk before
 * booting (snapshotDiskMismatch(); the distro is the snapshot's first disk);
 * createKernel({ distro: url }) opens it the same way. The disk's `stats`
 * say what was fetched.
 */
export declare function openDistroDisk(url: string, { chunkSize, prefetch, log }?: {
  chunkSize?: number;
  prefetch?: number | false;
  log?: (msg: string) => void;
}): Promise<DistroDisk>;
export declare const DATA_DISK_NAME = "kwdata";
export declare const DATA_DISK_VERSION = "v1";
interface DataDiskNameOptions {
  /** Default "kwdata". */
  name?: string;
  /** Format version, default DATA_DISK_VERSION. */
  version?: string;
  log?: (msg: string) => void;
}
/** The store of a data disk: database "kwdisk:<name>-<version>" and its identity. */
export declare function dataDiskStore(size: number, { name, version, log }?: DataDiskNameOptions): {
  store: IdbStore;
  identity: string;
};
interface OpenDataDiskOptions extends DataDiskNameOptions {
  /** The template: a kwsparse image (gzipped or not), or a decoded one. */
  template: Uint8Array | ArrayBuffer | KwsparseImage;
  /**
   * "persistent" (default): the IndexedDB store, seeded from the template
   * on first use. "snapshot": memory only, starting from a consistent copy
   * of the saved disk if it is at most snapshotLimit bytes, else from the
   * template (e.g. another tab owns the disk).
   */
  mode?: "persistent" | "snapshot";
  /** Default 64 MiB. */
  snapshotLimit?: number;
  onError?: (err: unknown) => void;
}
/**
 * Open the data disk. The result has .persistent, and .notice when it is
 * not the persistent disk. Throws a DataDiskFormatError if the saved disk
 * has another identity (size); nothing is cleared, the caller decides (the
 * page runs a snapshot of the template and says why).
 */
export declare function openDataDisk({ name, version, template, mode, snapshotLimit, log, onError }: OpenDataDiskOptions): Promise<CowDisk>;
/**
 * Replace the persisted data disk with a kwsparse image (gzipped or not).
 * The disk must not be attached (or be detached, followed by a reload).
 */
export declare function importDataDisk(bytes: Uint8Array | ArrayBuffer, { name, version, size, log }?: DataDiskNameOptions & {
  size?: number;
}): Promise<{
  size: number;
  blocks: number;
}>;
/** Forget the persisted data disk; the next boot starts again from the template. */
export declare function resetDataDisk({ name, version }?: DataDiskNameOptions): Promise<void>;
/**
 * Sizes createKernel() tries, in order, when the requested memory cannot be
 * allocated (phones often lack the address space for 512 MiB).
 */
export declare const DEFAULT_MEMORY_FALLBACK_MIB: readonly number[];
/** A phone or tablet: a coarse pointer (touch) or a mobile user agent (the old page's rule). */
export declare function isMobile(): boolean;
/**
 * A memory size for this device: from navigator.deviceMemory (secure
 * contexts only) when known, else 256 MiB on phones and 512 MiB otherwise.
 */
export declare function autoMemoryMiB(opts?: {
  mobile?: boolean;
}): {
  mib: number;
  why: string;
};
/**
 * Why this thread cannot run CPU threads, or undefined if it can: shared
 * memory (a cross-origin isolated page), Web Workers here (nested ones in
 * a worker), Atomics.waitAsync (CPU 0's idle wait for another CPU's IPI)
 * and a thread that may block (not a browser's main thread). With
 * `worker: true`, for a kernel in a worker that this thread starts
 * (createKernel({ worker: true })): the page's view, without the
 * main-thread check; the worker checks again before it starts CPUs.
 */
export declare function webCpuBlocker(opts?: {
  worker?: boolean;
}): string | undefined;
/** Run the guest's WASI programs (kwwasi, vsock port 1021) on this host, each in a Web Worker. */
export declare function serveWasiPrograms(vsock: Vsock, opts?: WasiExecOptions): WasiExecServer;
/**
 * The bundled kernel: vmlinux32.wasm with the base initramfs, its command
 * line, the data disk template and the patch to the SMP kernel in custom
 * sections, next to this module (bundlers that understand
 * `new URL(..., import.meta.url)` emit it as an asset).
 */
export declare const bundledKernelUrl: URL;
/**
 * Load, compile and boot a kernel (default: the bundled one, which boots
 * `distro`, or without one the base shell) and return the running
 * instance. Rejects with a BootError if it cannot start.
 * Memory defaults to autoMemoryMiB() with DEFAULT_MEMORY_FALLBACK_MIB. With
 * `worker: true` the kernel is loaded, compiled and run in a Web Worker and
 * the result is a WorkerKernel (experimental; disks and the network as
 * specs, see WorkerOption).
 */
export declare function createKernel(opts: CreateKernelOptions & {
  worker: true;
}): Promise<WorkerKernel>;
export declare function createKernel(opts?: CreateKernelOptions & {
  worker?: false;
}): Promise<KernelInstance>;
export declare function createKernel(opts?: CreateKernelOptions & WorkerOption): Promise<KernelHandle>;
export { ABS_MAX, ABS_X, ABS_Y, ANSI, BTN_LEFT, BTN_MIDDLE, BTN_RIGHT, BaseDisk, type BlockDevice, type BlockStats, BootError, type BootFailStage, type BootProgress, type BootStage, type ByteDuplex, type BytesSource, CMD_PORT, CommandError, type CommandErrorCode, type CommandsOption, type ConnectOptions, ConsoleRouter, type ConsoleRouterOptions, CowDisk, type CowDiskOptions, type CowDiskStats, type CreateKernelOptions, DEFAULT_DISPLAY_SIZE, DEFAULT_WISP_SERVERS, DEVICE_SPEC_VERSION, DOM_CODE_TO_LINUX, type DataDiskNameOptions, type DataDiskSpec, type DeviceKind, type DeviceSnapshots, type DiskBase, type DiskSnapshotState, type DiskSpec, type DiskState, type DisplayFrame, DisplayHost, type DisplayHostOptions, type DisplayMode, type DisplayOption, type DisplaySize, type DisplayStats, DistroDisk, type DistroHeader, type DistroIndex, type DistroIndexEntry, type DistroInfo, type DistroSource, type DownloadProgress, EV_ABS, EV_KEY, EV_REL, EV_SYN, type Evdev, type ExecOptions, type ExecResult, type ExitKind, type ExitResult, FOURCC_XRGB8888, F_DISCARD, F_FLUSH, F_RO, F_WRITE_ZEROES, type FileDiskSpec, FlushTracker, type Fs, type FsAttr, type FsDirEntry, FsError, type FsFile, type FsFileType, type FsOpenFlags, type FsSetAttr, type FsSource, type FsStatFs, type FsTree, type FsTreeFile, type GuestConnect, type GuestSocket, HTTP_MAX_HEADER_BYTES, type HostCommand, type HostCommandContext, type HostCommandResult, HttpBase, type HttpBaseOptions, type HttpBaseStats, type HttpDiskOptions, type HttpDiskSpec, IMPORTANT, INPUT_KEYBOARD, INPUT_MOUSE, INPUT_TABLET, IRQ_SYNC, type IdbStoreOptions, type InlineShmFile, InputHost, type InputHostOptions, type InputState, type InputStats, type InstanceStats, JitHost, type JitHostOptions, type JitStats, KSTAMP, KWSPARSE_MAGIC, Kernel, type KernelConfig, type KernelHandle, KernelInstance, type KernelLineInfo, type KernelSnapshot, type KernelSource, type KernelStats, type KernelTransport, type KwemuStats, type KwsparseImage, type LoadOptions, type MaybePromise, MemoryFs, type MemoryFsChange, type MemoryStage, type Mount, MountError, type MountErrorCode, type MountOptions, type MountSpec, type MountStats, type MountsOption, type NetBackend, type NetBackendSpec, type NetConnection, type NetConnectionEvents, type NetDevice, type NetSpec, NetStack, type NetStackOptions, type NetStats, type OpenDataDiskOptions, type OverlayStore, type PipeOptions, type Pty, type PtyEnd, PtyError, type PtyErrorCode, type PtyOptions, type PtySize, REL_WHEEL, REL_X, REL_Y, SHM_PAGE_SIZE, SOUND_FORMAT_S16_LE, SOUND_FORMAT_U8, type Shm, type ShmBackend, type ShmCall, type ShmCallResult, ShmClient, type ShmCloseReason, ShmDevice, type ShmDeviceOptions, type ShmDeviceStats, ShmError, type ShmFile, type ShmInfo, type ShmStats, type SkippedDisk, type SoundChunk, type SoundEvent, type SoundFormat, SoundHost, type SoundHostOptions, type SoundOption, type SoundSink, type SoundState, type SoundStats, SparseBase, type SpawnOptions, type StoreIndex, type Subprocess, type SupportReport, TTY_FEATURE_CONNECT, TTY_FEATURE_PIPES, TTY_PORT, TTY_SIGNALS, TTY_VERSION, type TtyFrame, TtyFrameParser, VSOCK_GUEST_CID, VSOCK_HEADER_SIZE, VSOCK_HOST_CID, type Vsock, type VsockConnection, VsockDevice, type VsockDeviceOptions, type VsockDeviceStats, VsockError, type VsockHeader, VsockHost, type VsockHostOptions, type VsockListener, type VsockOption, type VsockStats, WASI_EXEC_PORT, type WasiExecOptions, type WasiExecServer, type WasiExecStats, type WispBackend, type WispBackendOptions, WorkerKernel, type WorkerKernelOptions, type WorkerOption, ZERO_BLOCK, ZeroBase, bundledBoot, checkJspi, checkSupport, connectGuest, convertPcm, decodeKwsparse, decodeSnapshot, decodeVsockHeader, domButtonToLinux, domCodeToLinux, download, encodeKwsparse, encodeSnapshot, encodeTtyFrame, encodeTtyOpen, encodeTtyResize, encodeVsockPacket, execSubprocess, fetchOver, frameToPpm, gunzipIfNeeded, gzipBlob, inlineShm, ip4, ip4str, isDiskSpec, isNetSpec, isZeroBlock, jitSimd, kwsparseHeader, loadBytes, loadKernelModule, moduleIsMemory64, pcmToFloat32, probeDistro, readDistroHeader, readKwsparse, sharedMemoryAvailable, snapshotDeviceMismatch, snapshotDiskMismatch, spawnPty, spawnSubprocess, wavHeader, wispBackend, xrgbToRgba };