import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { LegalDoc, Section } from "@/components/legal/doc";

export const metadata: Metadata = {
  title: "Licences and third-party notices",
  description: "okinvo's licence and the licences of the works it bundles.",
};

/**
 * THIRD_PARTY_NOTICES.md is generated (`pnpm notices`) and shipped in the image; this page renders
 * its headings, paragraphs and bullet lists without a markdown dependency.
 */
interface Block {
  kind: "h2" | "h3" | "p" | "ul";
  text?: string;
  items?: string[];
}

function parseNotices(md: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
    if (list.length) blocks.push({ kind: "ul", items: list });
    para = [];
    list = [];
  };
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    if (line.startsWith("# ")) continue; // the page has its own title
    if (line.startsWith("### ")) {
      flush();
      blocks.push({ kind: "h3", text: line.slice(4) });
    } else if (line.startsWith("## ")) {
      flush();
      blocks.push({ kind: "h2", text: line.slice(3) });
    } else if (line.startsWith("- ")) {
      if (para.length) {
        blocks.push({ kind: "p", text: para.join(" ") });
        para = [];
      }
      list.push(line.slice(2));
    } else if (line.trim() === "") {
      flush();
    } else {
      if (list.length) {
        blocks.push({ kind: "ul", items: list });
        list = [];
      }
      para.push(line.trim());
    }
  }
  flush();
  return blocks;
}

const strip = (s: string) => s.replace(/`([^`]*)`/g, "$1").replace(/^_|_$/g, "");

export default function LicensesPage() {
  let notices = "";
  try {
    notices = readFileSync(path.join(process.cwd(), "THIRD_PARTY_NOTICES.md"), "utf8");
  } catch {
    notices = "## Package licences\n\nThe notices file was not found in this build.";
  }
  const blocks = parseNotices(notices);
  const sections = [
    { id: "okinvo", title: "okinvo licence" },
    ...blocks.filter((b) => b.kind === "h2").map((b, i) => ({ id: `n-${i}`, title: b.text ?? "" })),
  ];
  let h2 = -1;
  let sectionNo = 1;
  const rendered: React.ReactNode[] = [];
  let current: React.ReactNode[] = [];
  let currentTitle: { id: string; title: string } | null = null;
  const closeSection = () => {
    if (currentTitle) {
      sectionNo += 1;
      rendered.push(
        <Section
          key={currentTitle.id}
          id={currentTitle.id}
          number={sectionNo}
          title={currentTitle.title}
        >
          {current}
        </Section>,
      );
    }
    current = [];
  };
  blocks.forEach((b, idx) => {
    if (b.kind === "h2") {
      closeSection();
      h2 += 1;
      currentTitle = { id: `n-${h2}`, title: b.text ?? "" };
    } else if (b.kind === "h3") {
      current.push(
        <h3 key={idx} className="mt-4 text-app-label text-ink">
          {strip(b.text ?? "")}
        </h3>,
      );
    } else if (b.kind === "ul") {
      current.push(
        <ul key={idx} className="columns-1 text-app-caption md:columns-2">
          {(b.items ?? []).map((it, j) => (
            <li key={j} className="break-inside-avoid">
              {strip(it)}
            </li>
          ))}
        </ul>,
      );
    } else {
      current.push(<p key={idx}>{strip(b.text ?? "")}</p>);
    }
  });
  closeSection();

  return (
    <LegalDoc
      title="Licences and third-party notices"
      sections={sections}
      summary="okinvo is free software. This page lists its licence and the licences of everything it bundles, generated from the dependency manifest of this build."
    >
      <Section id="okinvo" number={1} title="okinvo licence">
        <p>
          okinvo is licensed under the <strong>Apache License, Version 2.0</strong>. You may use,
          copy, modify and distribute it, including commercially, provided you keep the licence and
          notices. The full text is in the <code className="font-mono">LICENSE</code> file of the
          source repository; attribution lines are in <code className="font-mono">NOTICE</code>.
          Copyright 2026 Devesh Gupta.
        </p>
      </Section>
      {rendered}
    </LegalDoc>
  );
}
