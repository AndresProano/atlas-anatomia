import { Composition, Folder } from "remotion";
import { AtlasLinkedIn } from "./AtlasLinkedIn/AtlasLinkedIn";
import { Scene } from "./AtlasLinkedIn/Scene";
import { TitleCard } from "./AtlasLinkedIn/TitleCard";
import { AtlasLinkedInPro } from "./AtlasPro/AtlasLinkedInPro";

export const RemotionRoot = () => (
  <>
    <Composition
      id="AtlasLinkedInPro"
      component={AtlasLinkedInPro}
      width={1080}
      height={1350}
      fps={30}
      durationInFrames={1035}
    />
    <Composition
      id="AtlasLinkedIn"
      component={AtlasLinkedIn}
      width={1080}
      height={1350}
      fps={30}
      durationInFrames={1080}
    />
    <Folder name="Escenas">
      <Composition
        id="Escena"
        component={Scene}
        width={1080}
        height={1350}
        fps={30}
        durationInFrames={180}
        defaultProps={{
          kicker: "Ciclo cardíaco",
          caption: "ECG y diagrama de Wiggers, al ritmo del latido",
          clip: "corazon.mp4",
          zoom: 1,
          focusX: 50,
          focusY: 50,
          style: { background: "radial-gradient(120% 80% at 50% 0%, #4a2aa8 0%, #1e1035 55%, #120a22 100%)" },
        }}
      />
      <Composition
        id="Tarjeta"
        component={TitleCard}
        width={1080}
        height={1350}
        fps={30}
        durationInFrames={90}
        defaultProps={{
          title: "Fisiología en movimiento",
          subtitle: "Un atlas 3D del cuerpo humano, gratis y en español",
          footer: "Para estudiantes de medicina",
          style: { background: "radial-gradient(120% 80% at 50% 0%, #4a2aa8 0%, #1e1035 55%, #120a22 100%)" },
        }}
      />
    </Folder>
  </>
);
