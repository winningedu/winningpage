import { Link } from "react-router";
import { DEMO_REGISTRY } from "@/demo/demoRegistry";

// 어드민 전용 데모 허브 — 시연 진입점일 뿐 디자인 대상이 아니라 작게 유지한다.
const DEMO_CARDS = [
  { key: "self-assessment", to: "/demo/self-assessment" },
  { key: "growth-design", to: "/demo/growth-design" },
  { key: "research", to: "/demo/research" },
  { key: "research-intro", to: "/demo/research-intro" },
  { key: "growth-intro", to: "/demo/growth-intro" },
];

export default function DemoIndex() {
  return (
    <main className="min-h-screen bg-[#F7F4EF] px-6 pb-16 pt-24 text-[#0D1B2A]">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-black">데모 허브</h1>
        <p className="mt-2 text-sm font-bold text-[#5B6573]">
          고객사 목업 5종의 어드민 전용 시연 진입점입니다.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {DEMO_CARDS.map(({ key, to }) => (
            <Link
              key={key}
              to={to}
              className="rounded-2xl border border-[#0D1B2A]/10 bg-white p-5 shadow-[0_1.125rem_2.8125rem_rgba(13,27,42,0.10)] transition hover:border-[#0D1B2A]/30"
            >
              <p className="text-lg font-black">{DEMO_REGISTRY[key].title}</p>
              <p className="mt-1 text-xs font-bold text-[#5B6573]">{to}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
