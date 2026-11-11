import { Video } from "@remotion/media";
import {
  Easing,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const FONT = '"Segoe UI", Inter, system-ui, sans-serif';
const ACCENT = "#b79cff"; // lila de la paleta de Andrés (morado noche #1e1035, violeta #6a3de8)

// Texto de la escena: entra con un desplazamiento suave
const Caption = ({ kicker, caption }: { kicker: string; caption: string }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div
      style={{
        position: "absolute",
        left: 80,
        right: 80,
        top: 110,
        fontFamily: FONT,
        opacity: interpolate(frame, [0, 0.5 * fps], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        translate: interpolate(frame, [0, 0.6 * fps], ["0px 30px", "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
      }}
    >
      <div style={{ fontSize: 40, fontWeight: 700, color: ACCENT, letterSpacing: 1, textTransform: "uppercase" }}>
        {kicker}
      </div>
      <div style={{ fontSize: 76, fontWeight: 800, color: "white", lineHeight: 1.08, marginTop: 14 }}>
        {caption}
      </div>
    </div>
  );
};

// Grabación del atlas en un marco redondeado
const Clip = ({ clip, zoom, focusX, focusY }: { clip: string; zoom: number; focusX: number; focusY: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        top: 470,
        width: 960,
        height: 600,
        borderRadius: 28,
        overflow: "hidden",
        boxShadow: "0 30px 80px rgba(0,0,0,0.55), 0 0 0 2px rgba(183,156,255,0.55), 0 0 60px rgba(106,61,232,0.45)",
        opacity: interpolate(frame, [0, 0.4 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      }}
    >
      <Video
        src={staticFile(`atlas/${clip}`)}
        muted
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transformOrigin: `${focusX}% ${focusY}%`,
          scale: zoom, // acercamiento fijo: uno animado hacía vibrar el texto fino de la interfaz
        }}
      />
    </div>
  );
};

const SceneInner = ({
  kicker,
  caption,
  clip,
  zoom,
  focusX,
  focusY,
}: {
  readonly kicker: string;
  readonly caption: string;
  readonly clip: string;
  readonly zoom: number;
  readonly focusX: number;
  readonly focusY: number;
}) => (
  <>
    <Caption kicker={kicker} caption={caption} />
    <Clip clip={clip} zoom={zoom} focusX={focusX} focusY={focusY} />
    <div
      style={{
        position: "absolute",
        left: 80,
        right: 80,
        bottom: 110,
        fontFamily: FONT,
        fontSize: 44,
        fontWeight: 600,
        color: "rgba(255,255,255,0.75)",
        textAlign: "center",
      }}
    >
      Atlas Anatómico 3D · gratis y en español
    </div>
  </>
);

export const Scene = Interactive.create({
  Component: SceneInner,
  layout: "absolute-fill",
  schema: {
    ...Interactive.backgroundSchema,
    kicker: { type: "string", default: "", description: "Etiqueta superior" },
    caption: { type: "string", default: "", description: "Texto principal" },
    clip: { type: "string", default: "corazon.mp4", description: "Clip en public/atlas" },
    zoom: { type: "number", default: 1, min: 1, max: 3, step: 0.05, hiddenFromList: false, description: "Acercamiento del clip" },
    focusX: { type: "number", default: 50, min: 0, max: 100, step: 1, hiddenFromList: false, description: "Centro del acercamiento X (%)" },
    focusY: { type: "number", default: 50, min: 0, max: 100, step: 1, hiddenFromList: false, description: "Centro del acercamiento Y (%)" },
  },
});
