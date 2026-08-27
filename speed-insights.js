// Import and initialize Vercel Speed Insights
import { injectSpeedInsights } from './node_modules/@vercel/speed-insights/dist/index.mjs';

// Initialize Speed Insights with default configuration
// This will automatically track web vitals and performance metrics
injectSpeedInsights({
  debug: false // Set to true for development debugging
});
