import { Easing, Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

const FONT = '"Segoe UI", Inter, system-ui, sans-serif';

// Texto de la portada y del cierre: cada línea entra con un pequeño retraso
const Line = ({ delay, style, children }: { delay: number; style: React.CSSProperties; children: React.ReactNode }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div
      style={{
        ...style,
        opacity: interpolate(frame, [delay * fps, (delay + 0.5) * fps], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        translate: interpolate(frame, [delay * fps, (delay + 0.7) * fps], ["0px 40px", "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
      }}
    >
      {children}
    </div>
  );
};

const TitleCardInner = ({
  title,
  subtitle,
  footer,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly footer: string;
}) => (
  <>
    <div
      style={{
        position: "absolute",
        left: 80,
        right: 80,
        top: 0,
        bottom: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        fontFamily: FONT,
        textAlign: "center",
      }}
    >
      <Line delay={0} style={{ fontSize: 96, fontWeight: 800, color: "white", lineHeight: 1.05 }}>
        {title}
      </Line>
      <Line delay={0.4} style={{ fontSize: 48, fontWeight: 500, color: "rgba(255,255,255,0.8)", lineHeight: 1.3, marginTop: 40 }}>
        {subtitle}
      </Line>
      <Line delay={0.8} style={{ fontSize: 44, fontWeight: 700, color: "#2dd4bf", marginTop: 70 }}>
        {footer}
      </Line>
    </div>
  </>
);

export const TitleCard = Interactive.create({
  Component: TitleCardInner,
  layout: "absolute-fill",
  schema: {
    ...Interactive.backgroundSchema,
    title: { type: "string", default: "", description: "Título" },
    subtitle: { type: "string", default: "", description: "Subtítulo" },
    footer: { type: "string", default: "", description: "Línea final" },
  },
});
