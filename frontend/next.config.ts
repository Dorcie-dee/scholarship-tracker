import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app's UI is a fixed light theme (Ant Design ConfigProvider, no dark
  // mode support yet) — the on-screen dev-only route indicator badge has
  // nothing useful to add on top of that and was showing up as a stray
  // floating logo in the corner of every page; hide it. Next.js still
  // surfaces real compile/runtime errors regardless of this setting.
  devIndicators: false,
};

export default nextConfig;
