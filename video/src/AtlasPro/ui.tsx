// Piezas visuales del video «Pro» (estilo lanzamiento de Apple, con la paleta morada de Andrés).
import { Video } from "@remotion/media";
import type React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  interpolateColors,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const FONT = '"Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif';
export const C = { night: "#1e1035", violet: "#6a3de8", lilac: "#b79cff", deep: "#0a0614" };
export const EASE = Easing.bezier(0.16, 1, 0.3, 1);
const CL = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Fondo: luces moradas que se mueven lento, con viñeta
export const Aurora = () => {
  const t = useCurrentFrame() / 30;
  const blobs = [
    { x: 18, y: 12, size: 1000, color: "rgba(106,61,232,0.55)", p: 0 },
    { x: 85, y: 35, size: 760, color: "rgba(183,156,255,0.28)", p: 2.1 },
    { x: 45, y: 88, size: 1100, color: "rgba(74,42,168,0.5)", p: 4.2 },
  ];
  return (
    <AbsoluteFill style={{ background: C.deep, overflow: "hidden" }}>
      {blobs.map((b, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: b.size,
            height: b.size,
            left: `calc(${b.x + 7 * Math.sin(t * 0.33 + b.p)}% - ${b.size / 2}px)`,
            top: `calc(${b.y + 5 * Math.cos(t * 0.27 + b.p)}% - ${b.size / 2}px)`,
            background: `radial-gradient(circle, ${b.color} 0%, transparent 64%)`,
            filter: "blur(50px)",
          }}
        />
      ))}
      <AbsoluteFill style={{ background: "radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(0,0,0,0.65) 100%)" }} />
    </AbsoluteFill>
  );
};

// Salida de cada escena: se desvanece con un leve desenfoque
export const Exit = ({ children }: { children: React.ReactNode }) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: d } = useVideoConfig();
  return (
    <AbsoluteFill
      style={{
        opacity: interpolate(f, [d - 0.45 * fps, d], [1, 0], CL),
        filter: `blur(${interpolate(f, [d - 0.45 * fps, d], [0, 14], CL)}px)`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

// Tipografía cinética: cada palabra entra de borrosa a nítida
export const Kinetic = ({
  text,
  delay = 0,
  size = 112,
  weight = 700,
  color = "white",
  style,
}: {
  text: string;
  delay?: number;
  size?: number;
  weight?: number;
  color?: string;
  style?: React.CSSProperties;
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ fontFamily: FONT, fontSize: size, fontWeight: weight, letterSpacing: "-0.035em", lineHeight: 1.04, color, ...style }}>
      {text.split(" ").map((w, i) => {
        const s = delay * fps + i * 0.08 * fps;
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              marginRight: "0.24em",
              opacity: interpolate(f, [s, s + 0.45 * fps], [0, 1], CL),
              filter: `blur(${interpolate(f, [s, s + 0.55 * fps], [18, 0], CL)}px)`,
              translate: interpolate(f, [s, s + 0.65 * fps], ["0px 50px", "0px 0px"], { ...CL, easing: EASE }),
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

// Destello de luz que cruza una pantalla una sola vez
const Shine = ({ delay }: { delay: number }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = interpolate(f, [delay * fps, (delay + 1.1) * fps], [-40, 140], CL);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: `linear-gradient(110deg, transparent ${p - 18}%, rgba(255,255,255,0.16) ${p}%, transparent ${p + 18}%)`,
      }}
    />
  );
};

// Pantalla flotante: entra inclinada en 3D y se endereza con un resorte; después queda quieta
export const Device = ({
  clip,
  delay = 0.15,
  width = 940,
  height = 588,
  left,
  top = 560,
  zoom = 1,
  fx = 50,
  fy = 50,
  tiltY = 0,
  crop,
  children,
}: {
  clip: string;
  delay?: number;
  width?: number;
  height?: number;
  left?: number;
  top?: number;
  zoom?: number;
  fx?: number;
  fy?: number;
  tiltY?: number;
  /** recorte explícito: tamaño y posición del video dentro de la pantalla (el video no admite object-fit) */
  crop?: { w: number; h: number; x: number; y: number };
  children?: React.ReactNode;
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - delay * fps, fps, config: { damping: 200, mass: 1.2 } });
  return (
    <div style={{ position: "absolute", left: left ?? (1080 - width) / 2, top, width, height, perspective: 1800 }}>
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          borderRadius: 34,
          overflow: "hidden",
          rotate: `x ${interpolate(s, [0, 1], [34, 0])}deg`,
          translate: `0px ${interpolate(s, [0, 1], [280, 0])}px`,
          scale: interpolate(s, [0, 1], [0.84, 1]),
          opacity: interpolate(s, [0, 0.25], [0, 1], CL),
          boxShadow: `0 50px 140px rgba(0,0,0,0.65), 0 0 0 1.5px rgba(183,156,255,0.5), 0 0 100px rgba(106,61,232,${0.2 + 0.3 * s})`,
          transformStyle: "preserve-3d",
          ...(tiltY ? { transform: `rotateY(${tiltY * s}deg)` } : {}),
        }}
      >
        <Video
          src={staticFile(`atlas/${clip}`)}
          muted
          style={
            crop
              ? { position: "absolute", left: crop.x, top: crop.y, width: crop.w, height: crop.h }
              : { width: "100%", height: "100%", objectFit: "cover", scale: zoom, transformOrigin: `${fx}% ${fy}%` }
          }
        />
        <Shine delay={delay + 0.55} />
        {children}
      </div>
    </div>
  );
};

// Lupa: amplía una zona del mismo clip (por ejemplo el diagrama de Wiggers)
export const Magnifier = ({
  clip,
  fx,
  fy,
  power,
  delay,
  left,
  top,
  width,
  height,
  label,
}: {
  clip: string;
  fx: number;
  fy: number;
  power: number;
  delay: number;
  left: number;
  top: number;
  width: number;
  height: number;
  label: string;
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - delay * fps, fps, config: { damping: 18, mass: 0.9 } });
  return (
    <div style={{ position: "absolute", left, top, width, scale: interpolate(s, [0, 1], [0.6, 1]), opacity: interpolate(s, [0, 0.3], [0, 1], CL), transformOrigin: "30% 0%" }}>
      <div
        style={{
          display: "inline-block",
          fontFamily: FONT,
          fontSize: 32,
          fontWeight: 700,
          color: "white",
          marginBottom: 14,
          padding: "10px 22px",
          borderRadius: 999,
          background: "rgba(30,16,53,0.92)",
          boxShadow: "0 0 0 1.5px rgba(183,156,255,0.8), 0 10px 30px rgba(0,0,0,0.5)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          width,
          height,
          borderRadius: 26,
          overflow: "hidden",
          background: "#0d0b16",
          boxShadow: "0 30px 90px rgba(0,0,0,0.7), 0 0 0 2px rgba(183,156,255,0.8), 0 0 60px rgba(183,156,255,0.35)",
        }}
      >
        <Video src={staticFile(`atlas/${clip}`)} muted style={{ width: "100%", height: "100%", objectFit: "cover", scale: power, transformOrigin: `${fx}% ${fy}%` }} />
      </div>
    </div>
  );
};

// Cifra que cuenta hacia arriba
export const Stat = ({ value, label, delay }: { value: number; label: string; delay: number }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - delay * fps, fps, config: { damping: 200, mass: 1.4 } });
  return (
    <div style={{ fontFamily: FONT, opacity: interpolate(s, [0, 0.2], [0, 1], CL), translate: `0px ${interpolate(s, [0, 1], [40, 0])}px` }}>
      <div
        style={{
          fontSize: 150,
          fontWeight: 800,
          letterSpacing: "-0.05em",
          lineHeight: 1,
          background: `linear-gradient(180deg, #ffffff 30%, ${C.lilac} 100%)`,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        {String(Math.round(value * s)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
      </div>
      <div style={{ fontSize: 40, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginTop: 10 }}>{label}</div>
    </div>
  );
};

// Interruptor estilo iPhone: Normal → Infarto
export const Toggle = ({ at }: { at: number }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - at * fps, fps, config: { damping: 16, mass: 0.7 } });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 28, fontFamily: FONT, fontSize: 46, fontWeight: 700 }}>
      <span style={{ color: interpolateColors(s, [0, 1], ["#ffffff", "rgba(255,255,255,0.35)"]) }}>Normal</span>
      <div
        style={{
          width: 150,
          height: 84,
          borderRadius: 42,
          padding: 7,
          boxSizing: "border-box",
          background: interpolateColors(s, [0, 1], ["#3a2f5a", "#e11d48"]),
          boxShadow: `0 0 ${interpolate(s, [0, 1], [0, 50])}px rgba(225,29,72,0.7)`,
        }}
      >
        <div style={{ width: 70, height: 70, borderRadius: 35, background: "white", translate: `${interpolate(s, [0, 1], [0, 66])}px 0px`, boxShadow: "0 6px 16px rgba(0,0,0,0.4)" }} />
      </div>
      <span style={{ color: interpolateColors(s, [0, 1], ["rgba(255,255,255,0.35)", "#ff8fa3"]) }}>Infarto</span>
    </div>
  );
};
