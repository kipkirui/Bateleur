import iconDay from "../assets/logo/icon-black.svg";
import iconNight from "../assets/logo/icon-white.svg";
import { paperInk, type PaperStock } from "../lib/paper";

type Props = {
  paper: PaperStock;
};

export function Mark({ paper }: Props) {
  return (
    <img
      className="mark"
      src={paperInk(paper) === "light" ? iconNight : iconDay}
      alt=""
      draggable={false}
    />
  );
}
