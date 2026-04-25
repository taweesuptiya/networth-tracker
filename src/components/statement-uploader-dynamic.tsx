"use client";

import dynamic from "next/dynamic";

export const StatementUploader = dynamic(
  () => import("./statement-uploader").then((m) => m.StatementUploader),
  { ssr: false, loading: () => <div className="text-xs text-zinc-500">Loading uploader...</div> }
);
