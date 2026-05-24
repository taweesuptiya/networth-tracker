"use client";

import dynamic from "next/dynamic";

export const PayslipUploader = dynamic(
  () => import("./payslip-uploader").then((m) => m.PayslipUploader),
  { ssr: false, loading: () => <div className="text-xs text-zinc-500">Loading uploader...</div> }
);
