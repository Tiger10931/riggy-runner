import { createFileRoute } from "@tanstack/react-router";

const TITLE = "Riggy Runner — Endless Dash Arcade Game";
const DESC =
  "Dodge trains, grab coins and ride hoverboards in Riggy Runner, a fast three-lane endless runner starring the Danno Cal mascot.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="fixed inset-0 bg-black">
      <h1 className="sr-only">Riggy Runner — endless dash</h1>
      <iframe
        src="/riggy/index.html"
        title="Riggy Runner game"
        className="h-full w-full border-0"
        allow="autoplay; fullscreen; gamepad"
      />
    </main>
  );
}
