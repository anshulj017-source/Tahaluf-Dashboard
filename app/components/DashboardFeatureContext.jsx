"use client";

import React, { createContext, useContext } from 'react';
import { DEFAULT_FEATURE_CONFIG, isFeatureEnabled } from '../../lib/dashboardFeatures.mjs';

export const DashboardFeatureContext = createContext({ config: DEFAULT_FEATURE_CONFIG, role: 'standard', preview: false });

export function useDashboardFeature(id) {
  const { config, role, preview } = useContext(DashboardFeatureContext);
  return isFeatureEnabled(config, id, role, preview);
}

export function ExportButton(props) {
  const enabled = useDashboardFeature('exports');
  return enabled ? <button {...props} /> : null;
}
