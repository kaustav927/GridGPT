/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Handle GeoJSON files as JSON
    config.module.rules.push({
      test: /\.geojson$/,
      type: 'json',
    });
    return config;
  },
};

export default nextConfig;
