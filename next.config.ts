import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./lib/i18n/config.ts")

const nextConfig: NextConfig = {
  // Run middleware on the Node.js runtime instead of Edge. The Edge bundle
  // pulls in a transitive module referencing __dirname (absent in Edge),
  // causing MIDDLEWARE_INVOCATION_FAILED in production. Node middleware has
  // __dirname natively and avoids the whole class of Edge incompatibilities.
  experimental: {
    // nodeMiddleware is runtime-supported in Next 15.5 but not yet in the TS types.
    // @ts-expect-error -- known property gap in ExperimentalConfig
    nodeMiddleware: true,
  },
  images: {
    remotePatterns: [],
  },
}

export default withNextIntl(nextConfig)
