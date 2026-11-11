// Escenas del video «Pro». Cada una se puede editar en Remotion Studio (textos en el panel).
import type React from "react";
import { Interactive, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, Device, Exit, FONT, Kinetic, Magnifier, Stat, Toggle } from "./ui";

const CL = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const str = (description: string) => ({ type: "string" as const, default: "", description });

// Subtítulo que aparece suave después del título
const Sub = ({ text, delay }: { text: string; delay: number }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div
      style={{
        fontFamily: FONT,
        fontSize: 44,
        fontWeight: 500,
        lineHeight: 1.3,
        color: "rgba(255,255,255,0.72)",
        opacity: interpolate(f, [delay * fps, (delay + 0.6) * fps], [0, 1], CL),
      }}
    >
      {text}
    </div>
  );
};

// Encabezado: título, un elemento opcional (p. ej. el interruptor) y subtítulo, apilados según su alto real
const Header = ({ title, subtitle, subDelay = 0.6, children }: { title: string; subtitle: string; subDelay?: number; children?: React.ReactNode }) => (
  <div style={{ position: "absolute", left: 80, right: 80, top: 120, display: "flex", flexDirection: "column", gap: 28 }}>
    <Kinetic text={title} size={104} />
    {children}
    <Sub text={subtitle} delay={subDelay} />
  </div>
);

// 1. Gancho: dos frases grandes
const HookInner = ({ line1, line2 }: { readonly line1: string; readonly line2: string }) => (
  <Exit>
    <div style={{ position: "absolute", left: 80, right: 80, top: 0, bottom: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <Kinetic text={line1} size={150} />
      <Kinetic text={line2} size={150} delay={0.7} color={C.lilac} />
    </div>
  </Exit>
);
export const Hook = Interactive.create({
  Component: HookInner,
  layout: "absolute-fill",
  schema: { line1: str("Primera frase"), line2: str("Segunda frase") },
});

// 2. Escena con una pantalla del atlas
const FeatureInner = ({ title, subtitle, clip }: { readonly title: string; readonly subtitle: string; readonly clip: string }) => (
  <Exit>
    <Header title={title} subtitle={subtitle} />
    {/* pantalla vertical recortada sobre el cuerpo: se ve de la cabeza a los pies */}
    <Device clip={clip} delay={0.35} width={700} height={760} top={450} crop={{ w: 1216, h: 760, x: -90, y: 0 }} />
  </Exit>
);
export const Feature = Interactive.create({
  Component: FeatureInner,
  layout: "absolute-fill",
  schema: { title: str("Título"), subtitle: str("Subtítulo"), clip: str("Clip en public/atlas") },
});

// 3. Corazón con lupa sobre el diagrama de Wiggers
const HeartInner = ({ title, subtitle, label }: { readonly title: string; readonly subtitle: string; readonly label: string }) => (
  <Exit>
    <Header title={title} subtitle={subtitle} />
    <Device clip="corazon.mp4" delay={0.3} top={560} />
    <Magnifier clip="corazon.mp4" fx={98.7} fy={48} power={4} delay={1.7} left={450} top={860} width={560} height={350} label={label} />
  </Exit>
);
export const Heart = Interactive.create({
  Component: HeartInner,
  layout: "absolute-fill",
  schema: { title: str("Título"), subtitle: str("Subtítulo"), label: str("Etiqueta de la lupa") },
});

// 4. Cifras que cuentan
const StatsInner = ({ title }: { readonly title: string }) => (
  <Exit>
    <div style={{ position: "absolute", left: 80, right: 80, top: 150 }}>
      <Kinetic text={title} size={120} />
    </div>
    <div style={{ position: "absolute", left: 80, right: 80, top: 520, display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: 90, columnGap: 40 }}>
      <Stat value={2228} label="estructuras 3D" delay={0.5} />
      <Stat value={7} label="procesos animados" delay={0.7} />
      <Stat value={5} label="patologías" delay={0.9} />
      <Stat value={7} label="casos clínicos" delay={1.1} />
    </div>
  </Exit>
);
export const Stats = Interactive.create({
  Component: StatsInner,
  layout: "absolute-fill",
  schema: { title: str("Título") },
});

// 5. De normal a patológico, con interruptor
const PathoInner = ({ title, subtitle }: { readonly title: string; readonly subtitle: string }) => (
  <Exit>
    <Header title={title} subtitle={subtitle} subDelay={1.2}>
      <Toggle at={0.9} />
    </Header>
    <Device clip="infarto.mp4" delay={0.4} top={660} height={560} zoom={1.15} fx={30} fy={45} />
  </Exit>
);
export const Patho = Interactive.create({
  Component: PathoInner,
  layout: "absolute-fill",
  schema: { title: str("Título"), subtitle: str("Subtítulo") },
});

// 6. Abanico de tres pantallas en 3D
const FanInner = ({ title, subtitle }: { readonly title: string; readonly subtitle: string }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const card = (i: number) => spring({ frame: f - (0.3 + i * 0.18) * fps, fps, config: { damping: 200, mass: 1.1 } });
  const cards = [
    { clip: "vision.mp4", x: -250, ry: 28, z: -120 },
    { clip: "caso.mp4", x: 250, ry: -28, z: -120 },
    { clip: "circulacion.mp4", x: 0, ry: 0, z: 60 },
  ];
  return (
    <Exit>
      <Header title={title} subtitle={subtitle} subDelay={0.7} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 640, height: 420, perspective: 1600 }}>
        {cards.map((c, i) => {
          const s = card(i);
          return (
            <div
              key={c.clip}
              style={{
                position: "absolute",
                left: 540 - 300 + c.x * s,
                top: 0,
                width: 600,
                height: 375,
                borderRadius: 26,
                overflow: "hidden",
                opacity: interpolate(s, [0, 0.3], [0, 1], CL),
                transform: `translateZ(${c.z * s}px) rotateY(${c.ry * s}deg) translateY(${(1 - s) * 220}px)`,
                boxShadow: "0 40px 110px rgba(0,0,0,0.7), 0 0 0 1.5px rgba(183,156,255,0.5), 0 0 70px rgba(106,61,232,0.35)",
                zIndex: i === 2 ? 2 : 1,
              }}
            >
              <Device clip={c.clip} delay={0} width={600} height={375} top={0} left={0} />
            </div>
          );
        })}
      </div>
    </Exit>
  );
};
export const Fan = Interactive.create({
  Component: FanInner,
  layout: "absolute-fill",
  schema: { title: str("Título"), subtitle: str("Subtítulo") },
});

// 7. Cierre: nombre con brillo, frase y el link
const LockupInner = ({ title, subtitle, url }: { readonly title: string; readonly subtitle: string; readonly url: string }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - 1.0 * fps, fps, config: { damping: 200 } });
  return (
    <div style={{ position: "absolute", left: 80, right: 80, top: 0, bottom: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", fontFamily: FONT }}>
      <div
        style={{
          fontSize: 132,
          fontWeight: 800,
          letterSpacing: "-0.045em",
          lineHeight: 1.02,
          background: `linear-gradient(100deg, #ffffff 0%, #ffffff 35%, ${C.lilac} 50%, #ffffff 65%, #ffffff 100%)`,
          backgroundSize: "250% 100%",
          backgroundPosition: `${interpolate(f, [0.3 * fps, 2.3 * fps], [100, 0], CL)}% 0%`,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          opacity: interpolate(f, [0, 0.5 * fps], [0, 1], CL),
          filter: `blur(${interpolate(f, [0, 0.6 * fps], [16, 0], CL)}px)`,
          scale: interpolate(f, [0, 1.2 * fps], [1.08, 1], { ...CL }),
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 48, fontWeight: 500, color: "rgba(255,255,255,0.78)", marginTop: 44, opacity: interpolate(f, [0.7 * fps, 1.3 * fps], [0, 1], CL) }}>{subtitle}</div>
      <div
        style={{
          marginTop: 80,
          padding: "26px 48px",
          borderRadius: 999,
          fontSize: 42,
          fontWeight: 700,
          color: "white",
          background: "rgba(183,156,255,0.14)",
          boxShadow: `0 0 0 2px rgba(183,156,255,0.7), 0 0 ${60 * s}px rgba(106,61,232,0.6)`,
          opacity: s,
          translate: `0px ${interpolate(s, [0, 1], [40, 0])}px`,
        }}
      >
        {url}
      </div>
    </div>
  );
};
export const Lockup = Interactive.create({
  Component: LockupInner,
  layout: "absolute-fill",
  schema: { title: str("Nombre"), subtitle: str("Frase"), url: str("Enlace") },
});
