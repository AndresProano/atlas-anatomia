import { Track, useVideoConfig } from "remotion";
import { Scene } from "./Scene";
import { TitleCard } from "./TitleCard";

// Video de LinkedIn del Atlas Anatómico 3D (4:5, 36 s). Clips grabados del sitio publicado, en public/atlas.
export const AtlasLinkedIn = () => {
  const { fps } = useVideoConfig();
  return (
    <>
      <Track name="Escenas">
        <TitleCard
          name="Portada"
          durationInFrames={3 * fps}
          title="Fisiología en movimiento"
          subtitle="Un atlas 3D del cuerpo humano, gratis y en español"
          footer="Para estudiantes de medicina"
          style={{ background: "radial-gradient(120% 80% at 50% 0%, #4a2aa8 0%, #1e1035 55%, #120a22 100%)" }}
        />
        <Scene
          name="Circulación"
          from={3 * fps}
          durationInFrames={6 * fps}
          kicker="Circulación"
          caption="La sangre recorriendo arterias y venas"
          clip="circulacion.mp4"
          zoom={1.35}
          focusX={30}
          focusY={45}
          style={{ background: "radial-gradient(120% 80% at 50% 0%, #4a2aa8 0%, #1e1035 55%, #120a22 100%)" }}
        />
        <Scene
          name="Ciclo cardíaco"
          from={9 * fps}
          durationInFrames={6 * fps}
          kicker="Ciclo cardíaco"
          caption="ECG y diagrama de Wiggers, al ritmo del latido"
          clip="corazon.mp4"
          zoom={1}
          focusX={50}
          focusY={50}
          style={{ background: "radial-gradient(120% 80% at 50% 0%, #4a2aa8 0%, #1e1035 55%, #120a22 100%)" }}
        />
        <Scene
          name="Infarto"
          from={15 * fps}
          durationInFrames={5 * fps}
          kicker="Modo patológico"
          caption="Infarto, fibrilación auricular, asma, ACV…"
          clip="infarto.mp4"
          zoom={1.15}
          focusX={30}
          focusY={45}
          style={{ background: "radial-gradient(120% 80% at 50% 0%, #4a2aa8 0%, #1e1035 55%, #120a22 100%)" }}
        />
        <Scene
          name="Vía óptica"
          from={20 * fps}
          durationInFrames={6 * fps}
          kicker="Sistema nervioso"
          caption="Vías óptica, motora y sensitiva"
          clip="vision.mp4"
          zoom={1.25}
          focusX={30}
          focusY={40}
          style={{ background: "radial-gradient(120% 80% at 50% 0%, #4a2aa8 0%, #1e1035 55%, #120a22 100%)" }}
        />
        <Scene
          name="Caso clínico"
          from={26 * fps}
          durationInFrames={6 * fps}
          kicker="Casos clínicos"
          caption="Localiza la lesión y entiende el porqué"
          clip="caso.mp4"
          zoom={1}
          focusX={50}
          focusY={50}
          style={{ background: "radial-gradient(120% 80% at 50% 0%, #4a2aa8 0%, #1e1035 55%, #120a22 100%)" }}
        />
        <TitleCard
          name="Cierre"
          from={32 * fps}
          durationInFrames={4 * fps}
          title="Pruébalo gratis"
          subtitle="andresproano.github.io/atlas-anatomia"
          footer="¿Qué le agregarías? Te leo en los comentarios"
          style={{ background: "radial-gradient(120% 80% at 50% 0%, #4a2aa8 0%, #1e1035 55%, #120a22 100%)" }}
        />
      </Track>
    </>
  );
};
