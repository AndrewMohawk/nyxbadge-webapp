"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const VENDOR_ID = 0x0416;
const PRODUCT_ID = 0x5020;
const ROWS = 11;
const COLS = 44;

type BadgeMode = 0 | 1 | 4;
type ConnectionState = "idle" | "connecting" | "ready" | "writing" | "success" | "error";

type HIDDeviceLike = {
  opened: boolean;
  productName?: string;
  vendorId: number;
  productId: number;
  open: () => Promise<void>;
  sendReport: (reportId: number, data: BufferSource) => Promise<void>;
};

type HIDNavigator = Navigator & {
  hid?: {
    getDevices: () => Promise<HIDDeviceLike[]>;
    requestDevice: (options: { filters: Array<{ vendorId: number; productId: number }> }) => Promise<HIDDeviceLike[]>;
  };
};

function rasterize(text: string) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Your browser could not create the badge bitmap.");

  ctx.font = "700 10px monospace";
  const measured = Math.ceil(ctx.measureText(text).width);
  canvas.width = Math.max(8, measured + 4);
  canvas.height = ROWS;

  const draw = canvas.getContext("2d", { willReadFrequently: true });
  if (!draw) throw new Error("Your browser could not create the badge bitmap.");
  draw.clearRect(0, 0, canvas.width, canvas.height);
  draw.fillStyle = "#fff";
  draw.font = "700 10px monospace";
  draw.textBaseline = "alphabetic";
  draw.fillText(text, 1, 9);

  const pixels = draw.getImageData(0, 0, canvas.width, ROWS).data;
  const byteColumns = Math.ceil(canvas.width / 8);
  const bitmap = new Uint8Array(byteColumns * ROWS);

  for (let column = 0; column < byteColumns; column += 1) {
    for (let row = 0; row < ROWS; row += 1) {
      let value = 0;
      for (let bit = 0; bit < 8; bit += 1) {
        const x = column * 8 + bit;
        if (x < canvas.width && pixels[(row * canvas.width + x) * 4 + 3] > 96) {
          value |= 1 << (7 - bit);
        }
      }
      bitmap[column * ROWS + row] = value;
    }
  }

  return { bitmap, byteColumns, width: canvas.width, pixels };
}

function buildPacket(text: string, speed: number, mode: BadgeMode, brightness: number, blink: boolean) {
  const { bitmap, byteColumns } = rasterize(text);
  const header = new Uint8Array(64);
  header.set([0x77, 0x61, 0x6e, 0x67], 0);
  header[5] = brightness === 25 ? 0x40 : brightness === 50 ? 0x20 : brightness === 75 ? 0x10 : 0x00;
  header[6] = blink ? 1 : 0;
  header.fill(16 * (speed - 1) + mode, 8, 16);
  header[16] = Math.floor(byteColumns / 256);
  header[17] = byteColumns % 256;

  const now = new Date();
  header.set(
    [now.getFullYear() % 100, now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds()],
    38,
  );

  const unpadded = new Uint8Array(header.length + bitmap.length);
  unpadded.set(header);
  unpadded.set(bitmap, header.length);
  if (unpadded.length > 8192) throw new Error("That message is too long for the badge.");

  const packet = new Uint8Array(Math.ceil(unpadded.length / 64) * 64);
  packet.set(unpadded);
  return packet;
}

function BadgePreview({ text, speed, mode }: { text: string; speed: number; mode: BadgeMode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const source = document.createElement("canvas");
    const sourceCtx = source.getContext("2d", { willReadFrequently: true });
    if (!sourceCtx) return;
    sourceCtx.font = "700 10px monospace";
    source.width = Math.max(8, Math.ceil(sourceCtx.measureText(text).width) + 4);
    source.height = ROWS;
    const sourceDraw = source.getContext("2d", { willReadFrequently: true });
    if (!sourceDraw) return;
    sourceDraw.fillStyle = "#fff";
    sourceDraw.font = "700 10px monospace";
    sourceDraw.textBaseline = "alphabetic";
    sourceDraw.fillText(text, 1, 9);
    const image = sourceDraw.getImageData(0, 0, source.width, ROWS).data;

    let frame = 0;
    const started = performance.now();
    const pxPerSecond = [4, 6, 8, 11, 15, 21, 30, 44][speed - 1];

    const draw = (time: number) => {
      const elapsed = (time - started) / 1000;
      let offset = 0;
      if (mode === 0) offset = Math.floor(elapsed * pxPerSecond) % (source.width + COLS) - COLS;
      if (mode === 1) offset = source.width - (Math.floor(elapsed * pxPerSecond) % (source.width + COLS));
      if (mode === 4) offset = Math.floor((source.width - COLS) / 2);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#07110d";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const cell = canvas.width / COLS;
      for (let y = 0; y < ROWS; y += 1) {
        for (let x = 0; x < COLS; x += 1) {
          const sx = mode === 1 ? x + offset - COLS : x + offset;
          const on = sx >= 0 && sx < source.width && image[(y * source.width + sx) * 4 + 3] > 96;
          ctx.beginPath();
          ctx.arc(x * cell + cell / 2, y * cell + cell / 2, cell * 0.28, 0, Math.PI * 2);
          ctx.fillStyle = on ? "#b9ff38" : "rgba(110, 145, 83, .13)";
          if (on) {
            ctx.shadowColor = "#b9ff38";
            ctx.shadowBlur = cell * 0.65;
          } else {
            ctx.shadowBlur = 0;
          }
          ctx.fill();
        }
      }
      ctx.shadowBlur = 0;
      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [text, speed, mode]);

  return <canvas ref={canvasRef} width={704} height={176} aria-label={`LED preview: ${text}`} />;
}

export default function Home() {
  const [message, setMessage] = useState("no logs, no crime.");
  const [speed, setSpeed] = useState(8);
  const [mode, setMode] = useState<BadgeMode>(0);
  const [brightness, setBrightness] = useState(100);
  const [blink, setBlink] = useState(false);
  const [device, setDevice] = useState<HIDDeviceLike | null>(null);
  const [state, setState] = useState<ConnectionState>("idle");
  const [note, setNote] = useState("Connect your badge to begin.");

  const supported = typeof navigator !== "undefined" && "hid" in navigator;
  const packetCount = useMemo(() => {
    if (typeof document === "undefined") return 0;
    try {
      return buildPacket(message || " ", speed, mode, brightness, blink).length / 64;
    } catch {
      return 0;
    }
  }, [message, speed, mode, brightness, blink]);

  useEffect(() => {
    const hid = (navigator as HIDNavigator).hid;
    if (!hid) return;
    hid.getDevices().then(async (devices) => {
      const remembered = devices.find((item) => item.vendorId === VENDOR_ID && item.productId === PRODUCT_ID);
      if (!remembered) return;
      if (!remembered.opened) await remembered.open();
      setDevice(remembered);
      setState("ready");
      setNote(`${remembered.productName || "CH583 badge"} is ready.`);
    }).catch(() => undefined);
  }, []);

  async function connect() {
    const hid = (navigator as HIDNavigator).hid;
    if (!hid) {
      setState("error");
      setNote("WebHID requires desktop Chrome or Edge over HTTPS.");
      return null;
    }
    setState("connecting");
    setNote("Choose the wch.cn CH583 badge in the browser prompt.");
    try {
      const devices = await hid.requestDevice({ filters: [{ vendorId: VENDOR_ID, productId: PRODUCT_ID }] });
      const selected = devices[0];
      if (!selected) {
        setState("idle");
        setNote("No badge selected.");
        return null;
      }
      if (!selected.opened) await selected.open();
      setDevice(selected);
      setState("ready");
      setNote(`${selected.productName || "CH583 badge"} is ready.`);
      return selected;
    } catch (error) {
      setState("error");
      setNote(error instanceof Error ? error.message : "Could not open the badge.");
      return null;
    }
  }

  async function writeBadge() {
    const target = device ?? await connect();
    if (!target) return;
    setState("writing");
    setNote("Writing LED frames…");
    try {
      const packet = buildPacket(message || " ", speed, mode, brightness, blink);
      for (let offset = 0; offset < packet.length; offset += 64) {
        await target.sendReport(0, packet.slice(offset, offset + 64));
      }
      setState("success");
      setNote(`Written successfully — ${packet.length / 64} reports sent at speed ${speed}.`);
    } catch (error) {
      setState("error");
      setNote(error instanceof Error ? error.message : "The badge write failed.");
    }
  }

  return (
    <main>
      <div className="noise" aria-hidden="true" />
      <header className="topbar">
        <div className="brand"><span className="brand-mark">N</span> NYX BADGE CONTROL</div>
        <div className={`connection-pill ${state}`}><span />{device ? "CH583 CONNECTED" : "BADGE OFFLINE"}</div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">LOCAL USB-HID // 0416:5020</p>
          <h1>MAKE IT<br /><em>LOUDER.</em></h1>
          <p className="lede">Program your 44×11 LED badge directly from the browser. No app. No account. No logs.</p>
        </div>
        <div className="device-card">
          <div className="device-screws"><i /><i /><i /><i /></div>
          <div className="screen-label"><span>LIVE LED PREVIEW</span><span>{COLS} × {ROWS}</span></div>
          <div className="led-window"><BadgePreview text={message || " "} speed={speed} mode={mode} /></div>
          <div className="device-meta"><span>WCH.CN / CH583</span><span className="pulse-dot">READY TO BURN</span></div>
        </div>
      </section>

      <section className="console" aria-label="Badge controls">
        <div className="console-main">
          <label className="field-label" htmlFor="message">MESSAGE BUFFER <span>{message.length}/120</span></label>
          <div className="message-row">
            <input id="message" value={message} maxLength={120} onChange={(event) => setMessage(event.target.value)} spellCheck={false} />
            <button className="write-button" onClick={writeBadge} disabled={state === "writing" || state === "connecting" || !message.trim()}>
              <span>{state === "writing" ? "WRITING…" : "WRITE BADGE"}</span><b>↗</b>
            </button>
          </div>

          <div className="control-grid">
            <div className="control speed-control">
              <div className="control-head"><label htmlFor="speed">SCROLL SPEED</label><strong>{speed === 8 ? "MAX" : `0${speed}`}</strong></div>
              <input id="speed" type="range" min="1" max="8" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} />
              <div className="scale"><span>SLOW</span><span>FAST</span><span>FERAL</span></div>
            </div>
            <div className="control">
              <label htmlFor="mode">MOTION</label>
              <select id="mode" value={mode} onChange={(event) => setMode(Number(event.target.value) as BadgeMode)}>
                <option value={0}>Scroll left</option><option value={1}>Scroll right</option><option value={4}>Hold still</option>
              </select>
            </div>
            <div className="control">
              <label htmlFor="brightness">BRIGHTNESS</label>
              <select id="brightness" value={brightness} onChange={(event) => setBrightness(Number(event.target.value))}>
                <option value={100}>100%</option><option value={75}>75%</option><option value={50}>50%</option><option value={25}>25%</option>
              </select>
            </div>
            <label className="control toggle-control">
              <span>BLINK</span>
              <input type="checkbox" checked={blink} onChange={(event) => setBlink(event.target.checked)} />
              <i aria-hidden="true" />
            </label>
          </div>
        </div>

        <aside className="status-panel">
          <p className="panel-kicker">DEVICE LINK</p>
          <div className="status-icon"><span className={device ? "linked" : ""}>⌁</span></div>
          <h2>{device ? "BADGE ARMED" : "PLUG IN. CONNECT."}</h2>
          <p>{note}</p>
          {!device && <button className="connect-button" onClick={connect} disabled={!supported || state === "connecting"}>{state === "connecting" ? "OPENING…" : "CONNECT BADGE"}</button>}
          <dl>
            <div><dt>VID:PID</dt><dd>0416:5020</dd></div>
            <div><dt>REPORTS</dt><dd>{packetCount || "—"}</dd></div>
            <div><dt>PRIVACY</dt><dd>LOCAL ONLY</dd></div>
          </dl>
          {!supported && <p className="browser-warning">Open this page in desktop Chrome or Edge. Safari and Firefox do not expose WebHID.</p>}
        </aside>
      </section>

      <footer><span>NYX BADGE CONTROL // BUILD 01</span><span>NOTHING IS UPLOADED. YOUR BROWSER TALKS DIRECTLY TO USB.</span></footer>
    </main>
  );
}
