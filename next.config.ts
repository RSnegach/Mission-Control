import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Twilio SDK and node:sqlite use Node built-ins (net/tls, etc.) that must
  // not be bundled. Keep them external so they are required at runtime; needed
  // because instrumentation.ts pulls the ack/twilio chain into the server graph.
  serverExternalPackages: ["twilio"],
};

export default nextConfig;
