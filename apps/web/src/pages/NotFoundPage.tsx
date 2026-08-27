import { useNavigate } from "react-router-dom";

import { BlockButton, Headline, Kicker } from "../components/ui";
import { RoomwaveMark } from "../components/RoomwaveMark";

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <main id="roomwave-main" className="safe-page safe-gutters page-pad mx-auto flex min-h-dvh max-w-md flex-col justify-center">
      <RoomwaveMark />
      <Kicker color="var(--red)">missing page</Kicker>
      <Headline size="lg">This sheet is blank.</Headline>
      <p className="mt-5 text-lg text-[var(--ink-soft)]">
        Room pages live on a six-character code. If someone sent you a link, check the spelling and try again from home.
      </p>
      <div className="mt-8">
        <BlockButton wide color="var(--yellow)" onClick={() => navigate("/")}>
          back to home
        </BlockButton>
      </div>
    </main>
  );
}
