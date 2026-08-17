import iconDay from "../assets/logo/icon-black.svg";
import iconNight from "../assets/logo/icon-white.svg";

type Props = {
  theme: "day" | "night";
};

export function Mark({ theme }: Props) {
  return (
    <img
      className="mark"
      src={theme === "night" ? iconNight : iconDay}
      alt=""
      draggable={false}
    />
  );
}
