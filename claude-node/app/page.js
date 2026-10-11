import Link from "next/link";

// Each demo lives in app/<path>/page.js, with its API in app/api/<path>/route.js.
const DEMOS = [
  {
    path: "/live-review",
    title: "Live Review",
    description: "An editor that comments on your draft sentence by sentence as you type.",
  },
  {
    path: "/model-compare",
    title: "Model Compare",
    description: "One prompt sent to several Claude models at once: answers, speed and cost side by side.",
  },
];

export default function Home() {
  return (
    <div className="home">
      <h1>Claude demos</h1>
      <ul>
        {DEMOS.map((demo) => (
          <li key={demo.path}>
            <Link href={demo.path}>
              <strong>{demo.title}</strong>
              <span>{demo.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
