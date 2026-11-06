"use client";

import { useState } from "react";
import { StudyForm } from "./StudyForm";
import { ImportStudyForm } from "./ImportStudyForm";

export function NewStudyTabs({
  digitalProducts,
}: {
  digitalProducts: { id: string; title: string }[];
}) {
  const [tab, setTab] = useState<"manual" | "import">("manual");

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setTab("manual")}
          className={`px-4 py-2 border-b-2 ${
            tab === "manual" ? "border-ink font-medium" : "border-transparent text-moss"
          }`}
        >
          Create manually
        </button>
        <button
          onClick={() => setTab("import")}
          className={`px-4 py-2 border-b-2 ${
            tab === "import" ? "border-ink font-medium" : "border-transparent text-moss"
          }`}
        >
          Import from document
        </button>
      </div>

      {tab === "manual" ? (
        <StudyForm digitalProducts={digitalProducts} />
      ) : (
        <ImportStudyForm digitalProducts={digitalProducts} />
      )}
    </div>
  );
}
