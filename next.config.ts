import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./lib/i18n/config.ts")

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [],
  },
}

export default withNextIntl(nextConfig)
