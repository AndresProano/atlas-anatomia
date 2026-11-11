import { Track, useVideoConfig } from "remotion";
import { Aurora } from "./ui";
import { Fan, Feature, Heart, Hook, Lockup, Patho, Stats } from "./scenes";

// Video «Pro» de LinkedIn del Atlas (4:5, 34,5 s): estilo lanzamiento de Apple con la paleta morada.
export const AtlasLinkedInPro = () => {
  const { fps } = useVideoConfig();
  return (
    <>
      <Aurora />
      <Track name="Escenas">
        <Hook name="Gancho" durationInFrames={3 * fps} line1="Tu cuerpo." line2="En movimiento." />
        <Feature
          name="Flujo sanguíneo"
          from={3 * fps}
          durationInFrames={5.5 * fps}
          title="Mira la sangre fluir."
          subtitle="Arterias y venas en tiempo real, sobre un cuerpo 3D."
          clip="circulacion.mp4"
        />
        <Heart
          name="Corazón"
          from={8.5 * fps}
          durationInFrames={6.5 * fps}
          title="Cada latido, medido."
          subtitle="ECG y diagrama de Wiggers sincronizados con el corazón."
          label="Diagrama de Wiggers, en vivo"
        />
        <Stats name="Cifras" from={15 * fps} durationInFrames={4 * fps} title="Todo esto. Gratis." />
        <Patho
          name="Patología"
          from={19 * fps}
          durationInFrames={5.5 * fps}
          title="De normal a patológico."
          subtitle="Infarto · fibrilación auricular · asma · ACV · litiasis"
        />
        <Fan
          name="Aprender"
          from={24.5 * fps}
          durationInFrames={5.5 * fps}
          title="Aprende como en la clínica."
          subtitle="Vías nerviosas, casos clínicos y 2.228 estructuras."
        />
        <Lockup
          name="Cierre"
          from={30 * fps}
          durationInFrames={4.5 * fps}
          title="Atlas Anatómico 3D"
          subtitle="Gratis. En español. En tu navegador."
          url="andresproano.github.io/atlas-anatomia"
        />
      </Track>
    </>
  );
};
